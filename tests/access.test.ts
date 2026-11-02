import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
test("owner administration, company isolation, role transitions and revocation", async () => {
  const owner = client(),
    member = client(),
    outsider = client();
  const date = new Date().toISOString().slice(0, 10);
  const signup = (email: string) => ({
    name: "Access Test",
    email,
    password: "Development-only-password!",
    company: "Access test company",
    date,
  });
  const ownerEmail = `${randomUUID()}@example.test`,
    memberEmail = `${randomUUID()}@example.test`;
  const a = await owner("auth/register", signup(ownerEmail)),
    b = await member("auth/register", signup(memberEmail));
  await outsider("auth/register", signup(`${randomUUID()}@example.test`));
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const root = `companies/${a.data.company}`;
  assert.equal((await outsider(`${root}/members`)).status, 403);
  assert.equal(
    (await owner(`${root}/members`, { email: ownerEmail, role: "remove" }))
      .status,
    400,
  );
  assert.equal(
    (await owner(`${root}/members`, { email: memberEmail, role: "auditor" }))
      .status,
    201,
  );
  assert.equal((await member(`${root}/workspace`)).status, 200);
  assert.equal((await member(`${root}/members`)).status, 403);
  const input = {
    kind: "sale",
    partyName: "Scoped Customer",
    description: "Isolation fixture",
    date,
    taxCode: "DEMO_NONE",
    net: "200.00",
  };
  assert.equal(
    (await member(`${root}/documents`, input, randomUUID())).status,
    403,
  );
  assert.equal(
    (await owner(`${root}/members`, { email: memberEmail, role: "accountant" }))
      .status,
    201,
  );
  assert.equal(
    (await member(`${root}/documents`, input, randomUUID())).status,
    201,
  );
  assert.equal(
    (await member(`${root}/members`, { email: ownerEmail, role: "remove" }))
      .status,
    403,
  );
  assert.equal(
    (
      await member(
        `${root}/companies`,
        { name: "Unauthorized company", date },
        randomUUID(),
      )
    ).status,
    403,
  );
  const key = randomUUID();
  const responses = await Promise.all([
    owner(`${root}/companies`, { name: "Separate books", date }, key),
    owner(`${root}/companies`, { name: "Separate books", date }, key),
  ]);
  assert.equal(responses[0].status, 201, JSON.stringify(responses));
  assert.equal(responses[0].data.id, responses[1].data.id);
  const second = responses[0].data.id;
  const me = (await owner("me")).data;
  assert.equal(me.companies.length, 2);
  assert.equal(me.companies[0].tenant_id, me.companies[1].tenant_id);
  const workspace = (await owner(`companies/${second}/workspace`)).data;
  assert.equal(workspace.documents.length, 0);
  assert.equal(workspace.accounts.length, 10);
  assert.equal((await member(`companies/${second}/workspace`)).status, 403);
  assert.equal(
    (await owner(`${root}/members`, { email: memberEmail, role: "owner" }))
      .status,
    201,
  );
  assert.equal((await member(`${root}/members`)).status, 200);
  assert.equal(
    (await member(`${root}/members`, { email: memberEmail, role: "auditor" }))
      .status,
    400,
  );
  assert.equal(
    (await owner(`${root}/members`, { email: memberEmail, role: "remove" }))
      .status,
    201,
  );
  assert.equal((await member(`${root}/workspace`)).status, 403);
  assert.equal(
    (await member(`companies/${b.data.company}/workspace`)).status,
    200,
  );
  const audit = (await owner(`${root}/workspace`)).data.audit;
  assert.ok(audit.some((e: any) => e.action === "membership.revoked"));
  assert.ok(audit.some((e: any) => e.action === "company.added"));
});
