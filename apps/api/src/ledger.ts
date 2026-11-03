import { Decimal } from "decimal.js";
import { randomUUID, createHash } from "node:crypto";
import { PoolClient } from "pg";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const money = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,13})(\.\d{1,2})?$/,
    "Use a positive decimal amount with at most 2 decimal places",
  );
export const date = z.iso.date();
export const documentInput = z
  .object({
    kind: z.enum(["sale", "bill"]),
    partyName: z.string().trim().min(2).max(160),
    description: z.string().trim().min(2).max(500),
    date,
    taxCode: z.enum(["DEMO_VAT", "DEMO_NONE"]),
    net: money.refine((v) => new Decimal(v).gt(0)),
  })
  .strict();
export const paymentInput = z
  .object({
    date,
    cash: money,
    withholding: money,
    reference: z.string().trim().min(2).max(160),
  })
  .strict();
export type Scope = { user: string; tenant: string; company: string };
export async function audit(
  db: PoolClient,
  s: Scope,
  action: string,
  id: string,
  detail: object,
) {
  await db.query(
    "INSERT INTO audit_events(id,tenant_id,company_id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [randomUUID(), s.tenant, s.company, s.user, action, id, detail],
  );
  await db.query(
    "INSERT INTO outbox(id,tenant_id,company_id,event_type,aggregate_id,payload) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), s.tenant, s.company, action, id, { id }],
  );
}
export async function idempotent(
  db: PoolClient,
  s: Scope,
  key: string,
  payload: unknown,
  work: () => Promise<unknown>,
) {
  if (!key || key.length < 8 || key.length > 120)
    throw new BadRequestException(
      "An Idempotency-Key of 8–120 characters is required",
    );
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `${s.company}:${key}`,
  ]);
  const existing = await db.query(
    "SELECT hash,response FROM requests WHERE key=$1",
    [key],
  );
  if (existing.rowCount) {
    if (existing.rows[0].hash !== hash)
      throw new ConflictException(
        "Idempotency key already used for another command",
      );
    return existing.rows[0].response;
  }
  const response = await work();
  await db.query(
    "INSERT INTO requests(id,tenant_id,company_id,key,hash,response) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), s.tenant, s.company, key, hash, response],
  );
  return response;
}
export async function post(
  db: PoolClient,
  s: Scope,
  businessDate: string,
  memo: string,
  lines: { code: string; debit: string; credit: string }[],
  reversal?: string,
) {
  const period = await db.query(
    "SELECT id,closed FROM periods WHERE $1::date BETWEEN starts AND ends FOR UPDATE",
    [businessDate],
  );
  if (!period.rowCount || period.rows[0].closed)
    throw new ConflictException(
      "The accounting date must fall within an open fiscal period",
    );
  const balance = lines.reduce(
    (a, l) => a.plus(l.debit).minus(l.credit),
    new Decimal(0),
  );
  if (lines.length < 2 || !balance.isZero())
    throw new BadRequestException("Journal must balance");
  const id = randomUUID();
  const result = await db.query(
    "INSERT INTO journals(id,tenant_id,company_id,business_date,memo,reversal_of) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,number",
    [id, s.tenant, s.company, businessDate, memo, reversal || null],
  );
  for (const line of lines) {
    const account = await db.query(
      "SELECT id FROM accounts WHERE code=$1 AND active",
      [line.code],
    );
    if (!account.rowCount)
      throw new BadRequestException("Unknown or inactive account");
    await db.query(
      "INSERT INTO journal_lines(id,tenant_id,company_id,journal_id,account_id,debit,credit) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        s.tenant,
        s.company,
        id,
        account.rows[0].id,
        line.debit,
        line.credit,
      ],
    );
  }
  await db.query("UPDATE journals SET status='posted' WHERE id=$1", [id]);
  await audit(db, s, reversal ? "journal.reversed" : "journal.posted", id, {
    memo,
    reversalOf: reversal,
  });
  return result.rows[0];
}
export async function createDocument(
  db: PoolClient,
  s: Scope,
  input: z.infer<typeof documentInput>,
  draftId?: string,
) {
  const policy = await db.query(
    "SELECT approval_required FROM companies WHERE id=$1 FOR SHARE",
    [s.company],
  );
  if (policy.rows[0]?.approval_required && !draftId)
    throw new ConflictException("This company requires an approved draft");
  const rule = await db.query(
    "SELECT rate FROM tax_rules WHERE code=$1 AND effective_from<=$2",
    [input.taxCode, input.date],
  );
  if (!rule.rowCount)
    throw new BadRequestException("No sample tax treatment for this date");
  const net = new Decimal(input.net),
    tax = net.mul(rule.rows[0].rate).toDecimalPlaces(2),
    gross = net.plus(tax);
  const sale = input.kind === "sale";
  const lines = sale
    ? [
        { code: "1100", debit: gross.toFixed(2), credit: "0" },
        { code: "4000", debit: "0", credit: net.toFixed(2) },
      ]
    : [
        { code: "5000", debit: net.toFixed(2), credit: "0" },
        { code: "2000", debit: "0", credit: gross.toFixed(2) },
      ];
  if (tax.gt(0))
    lines.push({
      code: sale ? "2100" : "1200",
      debit: sale ? "0" : tax.toFixed(2),
      credit: sale ? tax.toFixed(2) : "0",
    });
  const journal = await post(
    db,
    s,
    input.date,
    `${sale ? "Invoice" : "Bill"} · ${input.partyName} · ${input.description}`,
    lines,
  );
  const party = randomUUID(),
    id = randomUUID();
  await db.query(
    "INSERT INTO parties(id,tenant_id,company_id,name,kind) VALUES($1,$2,$3,$4,$5)",
    [
      party,
      s.tenant,
      s.company,
      input.partyName,
      sale ? "customer" : "supplier",
    ],
  );
  const result = await db.query(
    "INSERT INTO documents(id,tenant_id,company_id,kind,party_id,party_name,description,business_date,net,tax,gross,tax_code,tax_rate,journal_id,draft_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *",
    [
      id,
      s.tenant,
      s.company,
      input.kind,
      party,
      input.partyName,
      input.description,
      input.date,
      net.toFixed(2),
      tax.toFixed(2),
      gross.toFixed(2),
      input.taxCode,
      rule.rows[0].rate,
      journal.id,
      draftId || null,
    ],
  );
  await audit(db, s, `${input.kind}.posted`, id, { journalId: journal.id });
  return result.rows[0];
}
export async function settle(
  db: PoolClient,
  s: Scope,
  document: string,
  input: z.infer<typeof paymentInput>,
) {
  const found = await db.query(
    "SELECT * FROM documents WHERE id=$1 FOR UPDATE",
    [document],
  );
  if (!found.rowCount) throw new NotFoundException("Document not found");
  const doc = found.rows[0];
  if (input.date < doc.business_date.toISOString().slice(0, 10))
    throw new BadRequestException("Payment cannot predate the document");
  const paid = await db.query(
    "SELECT coalesce(sum(cash+withholding),0)::text amount FROM payments WHERE document_id=$1",
    [document],
  );
  const cash = new Decimal(input.cash),
    withholding = new Decimal(input.withholding),
    total = cash.plus(withholding);
  if (!total.gt(0) || total.plus(paid.rows[0].amount).gt(doc.gross))
    throw new ConflictException(
      "Settlement must be positive and cannot exceed the outstanding balance",
    );
  const sale = doc.kind === "sale";
  const lines = [
    {
      code: sale ? "1100" : "2000",
      debit: sale ? "0" : total.toFixed(2),
      credit: sale ? total.toFixed(2) : "0",
    },
  ];
  if (cash.gt(0))
    lines.push({
      code: "1000",
      debit: sale ? cash.toFixed(2) : "0",
      credit: sale ? "0" : cash.toFixed(2),
    });
  if (withholding.gt(0))
    lines.push({
      code: sale ? "1300" : "2200",
      debit: sale ? withholding.toFixed(2) : "0",
      credit: sale ? "0" : withholding.toFixed(2),
    });
  const journal = await post(
    db,
    s,
    input.date,
    `${sale ? "Collection" : "Payment"} · ${doc.party_name} · ${input.reference}`,
    lines,
  );
  const id = randomUUID();
  await db.query(
    "INSERT INTO payments(id,tenant_id,company_id,document_id,business_date,cash,withholding,reference,journal_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      id,
      s.tenant,
      s.company,
      document,
      input.date,
      cash.toFixed(2),
      withholding.toFixed(2),
      input.reference,
      journal.id,
    ],
  );
  await audit(db, s, "payment.posted", id, {
    documentId: document,
    journalId: journal.id,
  });
  return { id, journalId: journal.id };
}
