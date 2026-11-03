import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { z } from "zod";
import { audit, createDocument, documentInput, type Scope } from "./ledger.js";
export const revision = z.number().int().min(1);
export async function saveDraft(
  db: PoolClient,
  s: Scope,
  input: z.infer<typeof documentInput>,
  id?: string,
  version?: number,
) {
  if (id) {
    const found = await db.query(
      "SELECT * FROM document_drafts WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!found.rowCount) throw new NotFoundException("Draft not found");
    if (["submitted", "posted"].includes(found.rows[0].state))
      throw new ConflictException(
        "Submitted or posted drafts cannot be edited",
      );
    if (found.rows[0].version !== version)
      throw new ConflictException("Draft changed; refresh before continuing");
  }
  const values = [
    s.tenant,
    s.company,
    input.kind,
    input.partyName,
    input.description,
    input.date,
    input.taxCode,
    input.net,
  ];
  const result = id
    ? await db.query(
        `UPDATE document_drafts SET kind=$3,party_name=$4,description=$5,business_date=$6,tax_code=$7,net=$8,state='draft' WHERE id=$9 AND tenant_id=$1 AND company_id=$2 RETURNING *`,
        [...values, id],
      )
    : await db.query(
        `INSERT INTO document_drafts(tenant_id,company_id,kind,party_name,description,business_date,tax_code,net,id,created_by,last_edited_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,
        [...values, randomUUID(), s.user],
      );
  const draft = result.rows[0];
  await audit(db, s, id ? "draft.revised" : "draft.created", draft.id, {
    version: draft.version,
    input,
  });
  return draft;
}
export async function transitionDraft(
  db: PoolClient,
  s: Scope,
  id: string,
  version: number,
  action: "submit" | "approve" | "reject" | "post",
  reason?: string,
) {
  // Order shared company lock before draft and accounting-period locks.
  await db.query("SELECT id FROM companies WHERE id=$1 FOR SHARE", [s.company]);
  const found = await db.query(
    "SELECT * FROM document_drafts WHERE id=$1 FOR UPDATE",
    [id],
  );
  if (!found.rowCount) throw new NotFoundException("Draft not found");
  const draft = found.rows[0];
  if (draft.version !== version)
    throw new ConflictException("Draft changed; refresh before continuing");
  if (["approve", "reject"].includes(action)) {
    if (!reason || reason.trim().length < 5)
      throw new BadRequestException(
        "Provide a decision reason of at least 5 characters",
      );
    const membership = await db.query(
      "SELECT role FROM memberships WHERE company_id=$1 AND user_id=$2",
      [s.company, s.user],
    );
    if (
      membership.rows[0]?.role !== "owner" ||
      s.user === draft.created_by ||
      s.user === draft.last_edited_by
    )
      throw new ForbiddenException(
        "An owner who did not create or edit this draft must review it",
      );
  }
  if (action === "post") {
    if (draft.state !== "approved")
      throw new ConflictException(
        "Independent approval is required before posting",
      );
    const doc = await createDocument(
      db,
      s,
      {
        kind: draft.kind,
        partyName: draft.party_name,
        description: draft.description,
        date: draft.business_date.toISOString().slice(0, 10),
        taxCode: draft.tax_code,
        net: draft.net,
      },
      id,
    );
    await db.query("UPDATE document_drafts SET state='posted' WHERE id=$1", [
      id,
    ]);
    await audit(db, s, "draft.posted", id, { documentId: doc.id, version });
    return doc;
  }
  const state = {
    submit: "submitted",
    approve: "approved",
    reject: "rejected",
  }[action];
  const result = await db.query(
    "UPDATE document_drafts SET state=$1,decision_reason=$2 WHERE id=$3 RETURNING *",
    [state, reason || null, id],
  );
  await audit(db, s, `draft.${state}`, id, {
    version: result.rows[0].version,
    reason,
  });
  return result.rows[0];
}
