import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, scoped } from "../apps/api/src/db.js";
import { createDocument } from "../apps/api/src/ledger.js";
function client() {
  let cookie = "";
  return async (path: string, body?: unknown, key?: string) => {
    const r = await fetch("http://127.0.0.1:4000/api/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: process.env.APP_ORIGIN || "http://localhost:3000",
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
after(() => pool.end());
test("independent review, immutable approval snapshots, posting gate and concurrent retries", async () => {
  const a = client(),
    b = client(),
    outside = client();
  const date = new Date().toISOString().slice(0, 10),
    email = `${randomUUID()}@example.test`;
  const signup = (email: string) => ({
    name: "Approval Tester",
    email,
    password: "Synthetic-approval-password!",
    company: "Approval Company",
    date,
  });
  const owner = await a(
    "auth/register",
    signup(`${randomUUID()}@example.test`),
  );
  await b("auth/register", signup(email));
  await outside("auth/register", signup(`${randomUUID()}@example.test`));
  assert.equal(owner.status, 201);
  const company = owner.data.company,
    path = `companies/${company}`;
  const command = (
    who: ReturnType<typeof client>,
    suffix: string,
    body: unknown,
    key = randomUUID(),
  ) => who(`${path}/${suffix}`, body, key);
  assert.equal(
    (
      await command(a, "approval-policy", {
        required: true,
        reason: "Require review",
      })
    ).status,
    400,
  );
  await command(a, "members", { email, role: "owner" });
  assert.equal(
    (
      await command(a, "approval-policy", {
        required: true,
        reason: "Require independent review",
      })
    ).status,
    201,
  );
  const input = {
    kind: "sale" as const,
    partyName: "Review Customer",
    description: "Approval fixture",
    date,
    taxCode: "DEMO_VAT" as const,
    net: "1000.00",
  };
  assert.equal((await command(a, "documents", input)).status, 409);
  const created = await command(a, "drafts", input);
  assert.equal(created.status, 201, JSON.stringify(created));
  let d = created.data;
  const act = (
    who: ReturnType<typeof client>,
    action: string,
    version = d.version,
    key = randomUUID(),
  ) =>
    command(
      who,
      `drafts/${d.id}/action`,
      { version, action, reason: "Independent review evidence" },
      key,
    );
  assert.equal((await outside(`${path}/drafts`)).status, 403);
  assert.equal((await act(a, "post")).status, 409);
  d = (await act(a, "submit")).data;
  assert.equal(d.state, "submitted");
  assert.equal((await act(a, "approve")).status, 403);
  assert.equal(
    (
      await command(a, `drafts/${d.id}/revise`, {
        version: d.version,
        document: { ...input, net: "2000" },
      })
    ).status,
    409,
  );
  d = (await act(b, "reject")).data;
  assert.equal(d.state, "rejected");
  assert.equal((await act(a, "post")).status, 409);
  d = (
    await command(a, `drafts/${d.id}/revise`, {
      version: d.version,
      document: input,
    })
  ).data;
  assert.equal(d.state, "draft");
  d = (await act(a, "submit")).data;
  d = (await act(b, "approve")).data;
  assert.equal(d.state, "approved");
  const stale = d.version;
  d = (
    await command(a, `drafts/${d.id}/revise`, {
      version: d.version,
      document: { ...input, net: "2000.00" },
    })
  ).data;
  assert.equal(d.state, "draft");
  assert.equal(d.reviewed_by, null);
  assert.equal((await act(a, "post", stale)).status, 409);
  d = (await act(a, "submit")).data;
  d = (await act(b, "approve")).data;
  const tenant = (await a("me")).data.companies.find(
    (c: any) => c.id === company,
  ).tenant_id;
  // Database gate rejects mismatched approved content even if the application helper is called directly.
  await assert.rejects(
    scoped(owner.data.id, company, true, (db) =>
      createDocument(db, { user: owner.data.id, company, tenant }, input, d.id),
    ),
    /differs from approved draft/,
  );
  // Even a correctly matched direct helper call cannot commit without finalizing the draft.
  await assert.rejects(
    scoped(owner.data.id, company, true, (db) =>
      createDocument(
        db,
        { user: owner.data.id, company, tenant },
        { ...input, net: "2000.00" },
        d.id,
      ),
    ),
    /finalize together/,
  );
  const before = (await a(`${path}/workspace`)).data;
  assert.equal(before.documents.length, 0);
  assert.equal(before.journals.length, 0);
  const key = randomUUID();
  const results = await Promise.all([
    act(a, "post", d.version, key),
    act(a, "post", d.version, key),
  ]);
  assert.equal(results[0].status, 201, JSON.stringify(results));
  assert.equal(results[0].data.id, results[1].data.id);
  const workspace = (await a(`${path}/workspace`)).data;
  assert.equal(workspace.documents.length, 1);
  assert.equal(workspace.journals.length, 1);
  assert.equal(workspace.documents[0].net, "2000.00");
  assert.equal(workspace.documents[0].gross, "2240.00");
  await assert.rejects(
    scoped(owner.data.id, company, true, (db) =>
      db.query(
        `INSERT INTO documents(id,tenant_id,company_id,kind,party_id,party_name,description,business_date,net,tax,gross,tax_code,tax_rate,journal_id) SELECT $1,tenant_id,company_id,kind,party_id,party_name,description,business_date,net,tax,gross,tax_code,tax_rate,journal_id FROM documents WHERE id=$2`,
        [randomUUID(), workspace.documents[0].id],
      ),
    ),
    /requires an approved draft/,
  );

  assert.equal(
    (
      await command(a, `drafts/${d.id}/revise`, {
        version: d.version + 1,
        document: input,
      })
    ).status,
    409,
  );
  assert.ok(workspace.audit.some((e: any) => e.action === "draft.approved"));
  assert.ok(workspace.audit.some((e: any) => e.action === "draft.rejected"));
  assert.ok(workspace.audit.some((e: any) => e.action === "draft.posted"));
  // Supplier workflow obeys the same review gate and posts exactly once.
  let bill = (
    await command(a, "drafts", {
      ...input,
      kind: "bill",
      partyName: "Review Supplier",
    })
  ).data;
  bill = (
    await command(a, `drafts/${bill.id}/action`, {
      version: bill.version,
      action: "submit",
    })
  ).data;
  bill = (
    await command(b, `drafts/${bill.id}/action`, {
      version: bill.version,
      action: "approve",
      reason: "Supplier bill independently checked",
    })
  ).data;
  const race = await Promise.all([
    command(a, `drafts/${bill.id}/action`, {
      version: bill.version,
      action: "post",
    }),
    command(a, `drafts/${bill.id}/action`, {
      version: bill.version,
      action: "post",
    }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  await command(a, "members", { email, role: "auditor" });
  assert.equal((await command(b, "drafts", input)).status, 403);
  assert.equal(
    (
      await command(b, "approval-policy", {
        required: false,
        reason: "Bypass attempt",
      })
    ).status,
    403,
  );
  assert.equal((await b(`${path}/drafts`)).status, 200);
  assert.equal(
    (
      await command(a, "approval-policy", {
        required: false,
        reason: "Return to direct demo workflow",
      })
    ).status,
    201,
  );
  assert.equal((await command(a, "documents", input)).status, 201);
});
