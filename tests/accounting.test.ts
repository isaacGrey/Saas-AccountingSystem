import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { pool, scoped, transaction } from "../apps/api/src/db.js";
import { documentInput, createDocument } from "../apps/api/src/ledger.js";
const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const base = "http://127.0.0.1:4000/api";
const today = new Date().toISOString().slice(0, 10);
function client() {
  let cookie = "";
  return async (
    path: string,
    body?: unknown,
    key?: string,
    method?: string,
  ) => {
    const r = await fetch(base + "/" + path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookie,
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie")!.split(";")[0];
    return { status: r.status, data: await r.json() };
  };
}
const admin = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});
after(async () => {
  await pool.end();
  await admin.end();
});
test("persisted accounting workflow, isolation and database invariants", async (t) => {
  const a = client(),
    b = client();
  const signup = () => ({
    name: "Test Accountant",
    email: `${randomUUID()}@example.test`,
    password: "Synthetic-test-password-123!",
    company: "Mayumi Development Company",
    date: today,
  });
  const owner = await a("auth/register", signup());
  assert.equal(owner.status, 201, JSON.stringify(owner));
  const outsider = await b("auth/register", signup());
  assert.equal(outsider.status, 201);
  const company = owner.data.company,
    user = owner.data.id;
  const path = `companies/${company}`;
  let workspace = (await a(`${path}/workspace`)).data;
  const tenant = (await a("me")).data.companies[0].tenant_id;
  const invoice = {
    kind: "sale",
    partyName: "Mayumi Creative Studio",
    description: "November design services",
    date: today,
    taxCode: "DEMO_VAT",
    net: "10000.00",
  };
  let sale: any, bill: any;
  await t.test("runtime role is restricted and RLS fails closed", async () => {
    const r = await pool.query(
      "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
    );
    assert.deepEqual(r.rows[0], { rolsuper: false, rolbypassrls: false });
    assert.equal((await pool.query("SELECT * FROM accounts")).rowCount, 0);
    const denied = await b(`${path}/workspace`);
    assert.equal(denied.status, 403);
    await transaction(outsider.data.id, async (db) => {
      await db.query(
        "SELECT set_config('app.tenant',$1,true),set_config('app.company',$2,true)",
        [tenant, company],
      );
      assert.equal((await db.query("SELECT * FROM accounts")).rowCount, 0);
    });
  });
  await t.test(
    "sale posting and concurrent identical retry create one document",
    async () => {
      const key = randomUUID();
      const responses = await Promise.all([
        a(`${path}/documents`, invoice, key),
        a(`${path}/documents`, invoice, key),
      ]);
      responses.forEach((r) => assert.equal(r.status, 201, JSON.stringify(r)));
      assert.equal(responses[0].data.id, responses[1].data.id);
      sale = responses[0].data;
      assert.equal(sale.tax, "1200.00");
      assert.equal(sale.gross, "11200.00");
      assert.equal(
        (await a(`${path}/documents`, { ...invoice, net: "999.00" }, key))
          .status,
        409,
      );
    },
  );
  await t.test(
    "withheld collection reconciles AR, revenue, VAT and cash",
    async () => {
      const r = await a(
        `${path}/documents/${sale.id}/payments`,
        {
          date: today,
          cash: "11000.00",
          withholding: "200.00",
          reference: "DEV collection",
        },
        randomUUID(),
      );
      assert.equal(r.status, 201, JSON.stringify(r));
      workspace = (await a(`${path}/workspace`)).data;
      const bal = (code: string) =>
        workspace.trialBalance.find((r: any) => r.code === code).balance;
      assert.equal(bal("1100"), "0.00");
      assert.equal(bal("1000"), "11000.00");
      assert.equal(bal("1300"), "200.00");
      assert.equal(bal("2100"), "-1200.00");
      assert.equal(bal("4000"), "-10000.00");
      assert.equal(workspace.documents[0].outstanding, "0.00");
    },
  );
  await t.test(
    "bill and withheld payment reconcile AP and input VAT",
    async () => {
      const r = await a(
        `${path}/documents`,
        {
          ...invoice,
          kind: "bill",
          partyName: "Bayan Office Supplies",
          net: "4000.00",
        },
        randomUUID(),
      );
      assert.equal(r.status, 201);
      bill = r.data;
      assert.equal(
        (
          await a(
            `${path}/documents/${bill.id}/payments`,
            {
              date: today,
              cash: "4400.00",
              withholding: "80.00",
              reference: "DEV supplier payment",
            },
            randomUUID(),
          )
        ).status,
        201,
      );
      workspace = (await a(`${path}/workspace`)).data;
      const bal = (code: string) =>
        workspace.trialBalance.find((r: any) => r.code === code).balance;
      assert.equal(bal("2000"), "0.00");
      assert.equal(bal("1200"), "480.00");
      assert.equal(bal("2200"), "-80.00");
      assert.equal(bal("1000"), "6600.00");
      assert.equal(bal("5000"), "4000.00");
    },
  );
  await t.test(
    "concurrent settlements cannot overpay; failed commands leave no journal",
    async () => {
      const doc = (
        await a(
          `${path}/documents`,
          { ...invoice, net: "100.00" },
          randomUUID(),
        )
      ).data;
      const before = (await a(`${path}/workspace`)).data.journals.length;
      const responses = await Promise.all([
        a(
          `${path}/documents/${doc.id}/payments`,
          {
            date: today,
            cash: "112.00",
            withholding: "0",
            reference: "Race A",
          },
          randomUUID(),
        ),
        a(
          `${path}/documents/${doc.id}/payments`,
          {
            date: today,
            cash: "112.00",
            withholding: "0",
            reference: "Race B",
          },
          randomUUID(),
        ),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      assert.equal(
        (await a(`${path}/workspace`)).data.journals.length,
        before + 1,
      );
    },
  );
  await t.test("invalid decimals and nonexistent dates rejected", async () => {
    for (const net of ["NaN", "1e3", "-1", "0", "1.005"])
      assert.equal(
        (await a(`${path}/documents`, { ...invoice, net }, randomUUID()))
          .status,
        400,
      );
    assert.equal(
      (
        await a(
          `${path}/documents`,
          { ...invoice, date: "2026-02-30" },
          randomUUID(),
        )
      ).status,
      400,
    );
  });
  await t.test(
    "database rejects an unbalanced posting and rolls back the header",
    async () => {
      const id = randomUUID();
      await assert.rejects(
        scoped(user, company, true, async (db) => {
          await db.query(
            "INSERT INTO journals(id,tenant_id,company_id,business_date,memo) VALUES($1,$2,$3,$4,$5)",
            [id, tenant, company, today, "Unbalanced attack"],
          );
          const accts = (
            await db.query("SELECT id FROM accounts ORDER BY code LIMIT 2")
          ).rows;
          for (let i = 0; i < 2; i++)
            await db.query(
              "INSERT INTO journal_lines(id,tenant_id,company_id,journal_id,account_id,debit,credit) VALUES($1,$2,$3,$4,$5,$6,$7)",
              [
                randomUUID(),
                tenant,
                company,
                id,
                accts[i].id,
                i === 0 ? "100" : "0",
                i === 1 ? "99" : "0",
              ],
            );
          await db.query("UPDATE journals SET status='posted' WHERE id=$1", [
            id,
          ]);
        }),
        /balanced/,
      );
      await scoped(user, company, false, async (db) =>
        assert.equal(
          (await db.query("SELECT id FROM journals WHERE id=$1", [id]))
            .rowCount,
          0,
        ),
      );
    },
  );
  await t.test(
    "posted records and audit history cannot be modified",
    async () => {
      await assert.rejects(
        scoped(user, company, true, async (db) => {
          await db.query("UPDATE journals SET status='draft' WHERE id=$1", [
            sale.journal_id,
          ]);
        }),
        /immutable/,
      );
      await assert.rejects(
        scoped(user, company, true, async (db) => {
          await db.query("DELETE FROM audit_events");
        }),
        /permission denied/,
      );
    },
  );
  await t.test(
    "cross-company foreign keys prevent reference injection",
    async () => {
      const foreign = await scoped(
        outsider.data.id,
        outsider.data.company,
        false,
        async (db) =>
          (await db.query("SELECT id FROM accounts LIMIT 1")).rows[0].id,
      );
      await assert.rejects(
        scoped(user, company, true, async (db) => {
          const id = randomUUID();
          await db.query(
            "INSERT INTO journals(id,tenant_id,company_id,business_date,memo) VALUES($1,$2,$3,$4,$5)",
            [id, tenant, company, today, "Cross tenant attack"],
          );
          await db.query(
            "INSERT INTO journal_lines(id,tenant_id,company_id,journal_id,account_id,debit,credit) VALUES($1,$2,$3,$4,$5,1,0)",
            [randomUUID(), tenant, company, id, foreign],
          );
        }),
        /foreign key/,
      );
    },
  );
  await t.test(
    "manual reversal preserves original and nets to zero; source reversal blocked",
    async () => {
      const j = await a(
        `${path}/journals`,
        {
          date: today,
          memo: "Owner contribution",
          lines: [
            { code: "1000", debit: "500", credit: "0" },
            { code: "3000", debit: "0", credit: "500" },
          ],
        },
        randomUUID(),
      );
      assert.equal(j.status, 201);
      const r = await a(
        `${path}/journals/${j.data.id}/reverse`,
        { date: today, reason: "Reverse test contribution" },
        randomUUID(),
      );
      assert.equal(r.status, 201);
      assert.equal(
        (
          await a(
            `${path}/journals/${j.data.id}/reverse`,
            { date: today, reason: "Duplicate reversal attempt" },
            randomUUID(),
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await a(
            `${path}/journals/${sale.journal_id}/reverse`,
            { date: today, reason: "Illegal source reversal" },
            randomUUID(),
          )
        ).status,
        400,
      );
      assert.equal(
        (await a(`${path}/workspace`)).data.trialBalance.find(
          (r: any) => r.code === "3000",
        ).balance,
        "0.00",
      );
    },
  );
  await t.test(
    "theme persists and rejects unvalidated configuration",
    async () => {
      assert.equal(
        (
          await a(
            `${path}/theme`,
            { mode: "dark", preset: "emerald" },
            undefined,
            "PATCH",
          )
        ).status,
        200,
      );
      assert.deepEqual((await a("me")).data.companies[0].theme, {
        mode: "dark",
        preset: "emerald",
      });
      assert.equal(
        (
          await a(
            `${path}/theme`,
            { mode: "dark", preset: "url(javascript:bad)" },
            undefined,
            "PATCH",
          )
        ).status,
        400,
      );
    },
  );
  await t.test("auditor role cannot post", async () => {
    await admin.query(
      "UPDATE memberships SET role='auditor' WHERE user_id=$1",
      [user],
    );
    assert.equal(
      (await a(`${path}/documents`, invoice, randomUUID())).status,
      403,
    );
    assert.equal((await a(`${path}/workspace`)).status, 200);
    await admin.query("UPDATE memberships SET role='owner' WHERE user_id=$1", [
      user,
    ]);
  });
  await t.test("manual entries cannot bypass AR/AP source controls", async () => {
    const result = await a(`${path}/journals`, {date:today,memo:'Bypass attempt',lines:[{code:'1100',debit:'100',credit:'0'},{code:'4000',debit:'0',credit:'100'}]},randomUUID());
    assert.equal(result.status,400);
  });
  await t.test("source, ledger, audit and outbox roll back together", async () => {
    const counts=()=>scoped(user,company,false,async db=>(await db.query('SELECT (SELECT count(*) FROM documents) docs,(SELECT count(*) FROM journals) journals,(SELECT count(*) FROM audit_events) audit,(SELECT count(*) FROM outbox) outbox')).rows[0]);
    const before=await counts();
    await assert.rejects(scoped(user,company,true,async db=>{await createDocument(db,{user,company,tenant},documentInput.parse(invoice));throw new Error('Simulated failure after source insert');}),/Simulated failure/);
    assert.deepEqual(await counts(),before);
  });
  await t.test("same-tenant companies remain isolated even with dual membership", async () => {
    const other=randomUUID(),foreignAccount=randomUUID();
    await admin.query('INSERT INTO companies(id,tenant_id,name) VALUES($1,$2,$3)',[other,tenant,'Second legal company']);
    await admin.query("INSERT INTO memberships VALUES($1,$2,$3,'owner')",[user,tenant,other]);
    await admin.query("INSERT INTO accounts(id,tenant_id,company_id,code,name,kind) VALUES($1,$2,$3,'9999','Other company cash','asset')",[foreignAccount,tenant,other]);
    await scoped(user,company,false,async db=>assert.equal((await db.query('SELECT id FROM accounts WHERE id=$1',[foreignAccount])).rowCount,0));
    await scoped(user,other,false,async db=>assert.equal((await db.query('SELECT id FROM documents WHERE id=$1',[sale.id])).rowCount,0));
    assert.equal((await b(`companies/${other}/workspace`)).status,403);
  });
  await t.test(
    "closing serializes with posting; subsequent post fails atomically",
    async () => {
      const period = workspace.periods[0].id;
      const results = await Promise.all([
        a(`${path}/periods/${period}/close`, {}, randomUUID()),
        a(`${path}/documents`, invoice, randomUUID()),
      ]);
      assert.equal(results[0].status, 201);
      assert.ok([201, 409].includes(results[1].status));
      const before = (await a(`${path}/workspace`)).data.documents.length;
      assert.equal(
        (await a(`${path}/documents`, invoice, randomUUID())).status,
        409,
      );
      assert.equal(
        (await a(`${path}/workspace`)).data.documents.length,
        before,
      );
    },
  );
  await t.test(
    "transaction-local context cannot leak through pooled connections",
    async () => {
      for (let i = 0; i < 15; i++)
        assert.equal((await pool.query("SELECT * FROM documents")).rowCount, 0);
    },
  );
  await t.test(
    "CSRF and unauthenticated access rejected; logout revokes session",
    async () => {
      const r = await fetch(base + `/${path}/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://attacker.invalid",
        },
        body: JSON.stringify(invoice),
      });
      assert.equal(r.status, 403);
      assert.equal((await client()(`${path}/workspace`)).status, 401);
      assert.equal((await a("auth/logout", {})).status, 201);
      assert.equal((await a("me")).status, 401);
    },
  );
});
