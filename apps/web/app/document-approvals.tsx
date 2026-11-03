"use client";
import { useEffect, useState, type FormEvent } from "react";
type Row = Record<string, any>;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
async function api(path: string, body?: unknown, key?: string) {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message);
  return data;
}
export function DocumentApprovals({
  company,
  userId,
  role,
  onPosted,
}: {
  company: string;
  userId: string;
  role: string;
  onPosted: () => Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [selected, setSelected] = useState<Row | null>(null),
    [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reason, setReason] = useState(""),
    [key, setKey] = useState("");
  const load = async () => setRows(await api(`companies/${company}/drafts`));
  useEffect(() => {
    let active = true;
    api(`companies/${company}/drafts`)
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [company]);
  function select(row: Row | null, editing = false) {
    setSelected(row);
    setEdit(editing);
    setReason("");
    setKey(crypto.randomUUID());
    setError("");
    setNotice("");
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const document = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      const row = await api(
        `companies/${company}/drafts${selected ? `/${selected.id}/revise` : ""}`,
        selected ? { version: selected.version, document } : document,
        key,
      );
      await load();
      select(row);
      setNotice("Draft saved. No accounting entry has been posted.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function act(action: string) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `companies/${company}/drafts/${selected.id}/action`,
        {
          version: selected.version,
          action,
          ...(["approve", "reject"].includes(action) ? { reason } : {}),
        },
        `${key}-${action}`,
      );
      await load();
      if (action === "post") await onPosted();
      setSelected(null);
      setNotice(
        action === "post"
          ? "Approved document and balanced journal posted."
          : `Draft ${action === "submit" ? "submitted" : action === "approve" ? "approved" : "rejected"}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Drafts & approvals</h2>
            <p className="muted">
              Independent owner review · Development documents only · Latest 100
              drafts
            </p>
          </div>
          {role !== "auditor" && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => select(null, true)}
            >
              New draft
            </button>
          )}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Party / description</th>
                <th>Type</th>
                <th>Net · PHP</th>
                <th>State</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button
                      className="table-link"
                      disabled={busy}
                      onClick={() => select(r)}
                    >
                      {r.party_name}
                    </button>
                    <small className="document-number">{r.description}</small>
                  </td>
                  <td>{r.kind === "sale" ? "Invoice" : "Bill"}</td>
                  <td className="num">{r.net}</td>
                  <td>
                    <span className="badge">{r.state}</span>
                  </td>
                  <td>{r.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="empty">
              No drafts yet. Save a draft to begin independent review.
            </p>
          )}
        </div>
      </section>
      {(selected || edit) && (
        <section className="panel settings report-section">
          <div className="panel-heading">
            <h2>
              {edit
                ? selected
                  ? "Revise draft"
                  : "New document draft"
                : "Draft detail"}
            </h2>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setSelected(null);
                setEdit(false);
              }}
            >
              Close draft
            </button>
          </div>
          {edit ? (
            <form key={selected?.id || "new"} onSubmit={save}>
              <div className="form-row">
                <label>
                  Document type
                  <select name="kind" defaultValue={selected?.kind || "sale"}>
                    <option value="sale">Customer invoice</option>
                    <option value="bill">Supplier bill</option>
                  </select>
                </label>
                <label>
                  Accounting date
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={
                      selected?.business_date.slice(0, 10) || today()
                    }
                  />
                </label>
              </div>
              <label>
                Party name
                <input
                  name="partyName"
                  required
                  minLength={2}
                  maxLength={160}
                  defaultValue={selected?.party_name}
                />
              </label>
              <label>
                Draft description
                <input
                  name="description"
                  required
                  minLength={2}
                  maxLength={500}
                  defaultValue={selected?.description}
                />
              </label>
              <div className="form-row">
                <label>
                  Net amount · PHP
                  <input
                    name="net"
                    required
                    inputMode="decimal"
                    defaultValue={selected?.net || "1000.00"}
                  />
                </label>
                <label>
                  Sample tax treatment
                  <select
                    name="taxCode"
                    defaultValue={selected?.tax_code || "DEMO_VAT"}
                  >
                    <option value="DEMO_VAT">
                      Sample 12% VAT — unverified
                    </option>
                    <option value="DEMO_NONE">
                      Sample no VAT — unverified
                    </option>
                  </select>
                </label>
              </div>
              <p className="notice">
                Saving a revision clears any approval. Submit the saved version
                for independent review.
              </p>
              <button className="primary" disabled={busy}>
                Save draft
              </button>
            </form>
          ) : (
            selected && (
              <>
                <h3>{selected.party_name}</h3>
                <p>{selected.description}</p>
                <p>
                  {selected.business_date.slice(0, 10)} · Net PHP {selected.net}{" "}
                  · {selected.tax_code}
                </p>
                <p className="muted">
                  Created by {selected.author_name} · Version {selected.version}{" "}
                  · {selected.state}
                </p>
                {selected.reviewer_name && (
                  <p>
                    Reviewed by {selected.reviewer_name}:{" "}
                    {selected.decision_reason}
                  </p>
                )}
                {selected.state === "posted" && (
                  <p className="success">
                    Posted document: {selected.document_id}. View its journal
                    and outstanding balance in Sales or Bills.
                  </p>
                )}
                {role !== "auditor" && (
                  <div className="draft-actions">
                    {["draft", "rejected", "approved"].includes(
                      selected.state,
                    ) && (
                      <button
                        disabled={busy}
                        className="secondary"
                        onClick={() => select(selected, true)}
                      >
                        Revise draft
                      </button>
                    )}
                    {selected.state === "draft" && (
                      <button
                        disabled={busy}
                        className="primary"
                        onClick={() => act("submit")}
                      >
                        Submit for approval
                      </button>
                    )}
                    {selected.state === "approved" && (
                      <button
                        disabled={busy}
                        className="primary"
                        onClick={() => act("post")}
                      >
                        Post approved document
                      </button>
                    )}
                    {selected.state === "submitted" &&
                      (role === "owner" &&
                      selected.created_by !== userId &&
                      selected.last_edited_by !== userId ? (
                        <div>
                          <label>
                            Decision reason
                            <input
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              minLength={5}
                              maxLength={500}
                            />
                          </label>
                          <button
                            disabled={busy || reason.trim().length < 5}
                            className="primary"
                            onClick={() => act("approve")}
                          >
                            Approve draft
                          </button>
                          <button
                            disabled={busy || reason.trim().length < 5}
                            className="secondary"
                            onClick={() => act("reject")}
                          >
                            Reject draft
                          </button>
                        </div>
                      ) : (
                        <p className="notice">
                          Awaiting an owner who did not create or edit this
                          draft.
                        </p>
                      ))}
                  </div>
                )}
              </>
            )
          )}
        </section>
      )}
    </>
  );
}
export function ApprovalPolicy({
  company,
  required,
  onSaved,
}: {
  company: string;
  required: boolean;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="panel settings">
      <h2>Document approval policy</h2>
      <p>
        Current policy:{" "}
        <b>
          {required
            ? "Independent approval required"
            : "Direct posting allowed"}
        </b>
      </p>
      <p className="muted">
        Applies to new customer invoices and supplier bills. Add a second
        company owner before requiring approval. Payments and manual journals
        are not covered by this policy yet.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const reason = String(new FormData(form).get("reason"));
          setBusy(true);
          setError("");
          try {
            await api(`companies/${company}/approval-policy`, {
              required: !required,
              reason,
            });
            await onSaved();
            form.reset();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Policy change reason
          <input name="reason" required minLength={5} maxLength={500} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {required ? "Allow direct posting" : "Require independent approval"}
        </button>
      </form>
    </section>
  );
}
