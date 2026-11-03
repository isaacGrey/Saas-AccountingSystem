import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { trialCsv } from "../apps/api/src/reporting.js";
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
test("dated reports, historical settlements, fiscal boundaries and paginated ledger", async () => {
  const a = client(),
    b = client();
  const email = `${randomUUID()}@example.test`;
  const signup = (email: string) => ({
    name: "Report Tester",
    email,
    password: "Synthetic-report-password!",
    company: "Report Company",
    date: "2026-01-01",
  });
  const owner = await a(
    "auth/register",
    signup(`${randomUUID()}@example.test`),
  );
  const other = await b("auth/register", signup(email));
  assert.equal(owner.status, 201);
  const path = `companies/${owner.data.company}`;
  const post = (suffix: string, body: unknown) =>
    a(`${path}/${suffix}`, body, randomUUID());
  assert.equal(
    (
      await post("journals", {
        date: "2026-01-05",
        memo: "Capital fixture",
        lines: [
          { code: "1000", debit: "5000", credit: "0" },
          { code: "3000", debit: "0", credit: "5000" },
        ],
      })
    ).status,
    201,
  );
  const sale = await post("documents", {
    kind: "sale",
    partyName: "Customer Fixture",
    description: "January sale",
    date: "2026-01-10",
    taxCode: "DEMO_VAT",
    net: "1000",
  });
  assert.equal(sale.status, 201);
  const bill = await post("documents", {
    kind: "bill",
    partyName: "Supplier Fixture",
    description: "January expense",
    date: "2026-01-20",
    taxCode: "DEMO_VAT",
    net: "400",
  });
  assert.equal(bill.status, 201);
  assert.equal(
    (
      await post(`documents/${sale.data.id}/payments`, {
        date: "2026-02-05",
        cash: "1120",
        withholding: "0",
        reference: "February collection",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await post(`documents/${bill.data.id}/payments`, {
        date: "2026-03-15",
        cash: "448",
        withholding: "0",
        reference: "March payment",
      })
    ).status,
    201,
  );
  const jan = await a(`${path}/reports?from=2026-01-01&to=2026-01-31`);
  assert.equal(jan.status, 200);
  assert.deepEqual(jan.data.income, {
    revenue: "1000.00",
    expenses: "400.00",
    netIncome: "600.00",
  });
  assert.deepEqual(jan.data.position, {
    assets: "6168.00",
    liabilities: "568.00",
    equity: "5000.00",
    accumulatedProfit: "600.00",
    difference: "0.00",
  });
  assert.equal(jan.data.reconciliation[0].subledger, "1120.00");
  assert.equal(jan.data.reconciliation[1].subledger, "448.00");
  assert.ok(jan.data.reconciliation.every((r: any) => r.difference === "0.00"));
  const feb = (await a(`${path}/reports?from=2026-02-01&to=2026-02-28`)).data;
  const ar = feb.trialBalance.find((r: any) => r.code === "1100");
  assert.equal(ar.opening, "1120.00");
  assert.equal(ar.credit, "1120.00");
  assert.equal(ar.closing, "0.00");
  assert.equal(feb.income.netIncome, "0.00");
  assert.equal(feb.reconciliation[1].subledger, "448.00");
  assert.equal(feb.position.difference, "0.00");
  assert.equal(
    (await a(`${path}/reports?from=2026-02-30&to=2026-03-01`)).status,
    400,
  );
  assert.equal(
    (await a(`${path}/reports?from=2026-03-01&to=2026-02-01`)).status,
    400,
  );
  assert.equal(
    (await b(`${path}/reports?from=2026-01-01&to=2026-12-31`)).status,
    403,
  );
  assert.equal(
    (
      await post("periods", {
        name: "Overlap",
        starts: "2026-12-31",
        ends: "2027-01-31",
      })
    ).status,
    409,
  );
  const attempts = await Promise.all([
    post("periods", {
      name: "FY 2027",
      starts: "2027-01-01",
      ends: "2027-12-31",
    }),
    post("periods", {
      name: "Overlap race",
      starts: "2027-06-01",
      ends: "2027-12-31",
    }),
  ]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [201, 409]);
  // Whichever request wins, July is an open date in the new period.
  const lines = Array.from({ length: 51 }, () => ({
    code: "1000",
    debit: "1",
    credit: "0",
  }));
  lines.push({ code: "3000", debit: "0", credit: "51" });
  assert.equal(
    (
      await post("journals", {
        date: "2027-07-01",
        memo: "Pagination fixture",
        lines,
      })
    ).status,
    201,
  );
  const cash = feb.trialBalance.find((r: any) => r.code === "1000").id;
  const ledgerPath = `${path}/accounts/${cash}/ledger?from=2027-01-01&to=2027-12-31`;
  const first = (await a(ledgerPath)).data,
    second = (await a(ledgerPath + "&page=1")).data;
  assert.equal(first.total, 51);
  assert.equal(first.entries.length, 50);
  assert.equal(second.entries.length, 1);
  assert.equal(
    new Set([...first.entries, ...second.entries].map((r) => r.id)).size,
    51,
  );
  assert.equal(
    (
      await a(
        `${path}/accounts/${randomUUID()}/ledger?from=2026-01-01&to=2026-12-31`,
      )
    ).status,
    400,
  );
  await a(`${path}/members`, { email, role: "auditor" });
  assert.equal(
    (await b(`${path}/reports?from=2026-01-01&to=2026-01-31`)).status,
    200,
  );
  const exported = await b(`${path}/reports/export`, {
    from: "2026-01-01",
    to: "2026-01-31",
  });
  assert.equal(exported.status, 201);
  assert.ok(exported.data.csv.includes('"1120.00"'));
  assert.ok(exported.data.filename.includes("2026-01-31"));
  assert.equal(
    (
      await b(
        `${path}/periods`,
        { name: "Forbidden", starts: "2028-01-01", ends: "2028-12-31" },
        randomUUID(),
      )
    ).status,
    403,
  );
  await a(`${path}/members`, { email, role: "accountant" });
  assert.equal(
    (
      await b(
        `${path}/periods`,
        { name: "Still forbidden", starts: "2028-01-01", ends: "2028-12-31" },
        randomUUID(),
      )
    ).status,
    403,
  );
  const workspace = (await a(`${path}/workspace`)).data;
  assert.ok(workspace.audit.some((e: any) => e.action === "report.exported"));
  const original = workspace.periods.find((p: any) => p.name === "FY 2026");
  await post(`periods/${original.id}/close`, {});
  assert.equal(
    (
      await post("periods", {
        name: "Closed overlap",
        starts: "2026-01-01",
        ends: "2026-01-31",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await post("journals", {
        date: "2026-01-31",
        memo: "Closed attempt",
        lines: [
          { code: "1000", debit: "1", credit: "0" },
          { code: "3000", debit: "0", credit: "1" },
        ],
      })
    ).status,
    409,
  );
  assert.equal(
    (await a(`${path}/reports?from=2026-01-01&to=2026-01-31`)).data.income
      .netIncome,
    "600.00",
  );
});
test("CSV quotes text and neutralizes spreadsheet formula cells", () => {
  const csv = trialCsv({
    from: "2026-01-01",
    to: "2026-12-31",
    trialBalance: [
      {
        code: "1000",
        name: '=HYPERLINK("bad")',
        opening: "0",
        debit: "0",
        credit: "0",
        closing: "-12.50",
      },
    ],
  } as any);
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"-12.50"'));
});
