"use client";
import { useEffect, useState, type FormEvent } from "react";
type Member = { id: string; name: string; email: string; role: string };
async function request(path: string, body?: unknown, key?: string) {
  const response = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message);
  return data;
}
export function CompanyAccess({
  company,
  userId,
  onCreated,
}: {
  company: string;
  userId: string;
  onCreated: (id: string) => Promise<void>;
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [creationKey, setCreationKey] = useState("");
  useEffect(() => {
    let active = true;
    setCreationKey(crypto.randomUUID());
    request(`companies/${company}/members`)
      .then((data) => {
        if (active) setMembers(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [company]);
  async function submit(
    e: FormEvent<HTMLFormElement>,
    type: "member" | "company",
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (type === "company") {
        const result = await request(
          `companies/${company}/companies`,
          input,
          creationKey,
        );
        setCreationKey(crypto.randomUUID());
        await onCreated(result.id);
      } else {
        await request(`companies/${company}/members`, input);
        setMembers(await request(`companies/${company}/members`));
        setNotice(
          "Company access updated. Changes apply to subsequent requests.",
        );
        form.reset();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings company-access">
      <h2>Company access</h2>
      <p className="muted">
        Owners manage this company’s access. Accountants can post; auditors can
        read and export. Access to other companies is separate.
      </p>
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
              <th>Name / email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name}
                  {m.id === userId ? " (you)" : ""}
                  <small className="document-number">{m.email}</small>
                </td>
                <td>{m.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={(e) => submit(e, "member")}>
        <h3>Grant, change, or revoke access</h3>
        <p className="muted">
          The person must already have a registered account. No invitation email
          is sent. You cannot change your own owner access.
        </p>
        <label>
          Member email
          <input type="email" name="email" required maxLength={200} />
        </label>
        <label>
          Access role
          <select name="role" aria-label="Access role">
            <option value="auditor">Auditor — read and export</option>
            <option value="accountant">Accountant — post transactions</option>
            <option value="owner">Owner — administer company access</option>
            <option value="remove">Revoke company access</option>
          </select>
        </label>
        <button className="primary" disabled={busy}>
          Apply access change
        </button>
      </form>
      <hr />
      <form onSubmit={(e) => submit(e, "company")}>
        <h3>Add a legal company</h3>
        <p className="muted">
          Creates separate books within this tenant. Copies the chart and sample
          tax rules, but no transactions or other memberships.
        </p>
        <label>
          New company name
          <input name="name" required minLength={2} maxLength={160} />
        </label>
        <label>
          Fiscal year date
          <input
            name="date"
            type="date"
            required
            defaultValue={new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Manila",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date())}
          />
        </label>
        <button className="primary" disabled={busy}>
          Create separate company
        </button>
      </form>
    </section>
  );
}
