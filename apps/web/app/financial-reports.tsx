"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Decimal from "decimal.js";
type Row = Record<string, any>;
const money = (v: string) =>
  "₱" + new Decimal(v || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
async function request(path: string, body?: unknown) {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message);
  return data;
}
export function FinancialReports({
  company,
  periods,
}: {
  company: string;
  periods: Row[];
}) {
  const [from, setFrom] = useState(today().slice(0, 4) + "-01-01"),
    [to, setTo] = useState(today()),
    [report, setReport] = useState<Row | null>(null),
    [ledger, setLedger] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  async function load(start: string, end: string) {
    const token = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const data = await request(
        `companies/${company}/reports?from=${start}&to=${end}`,
      );
      if (token === generation.current) {
        setReport(data);
        setLedger(null);
      }
    } catch (e) {
      if (token === generation.current) setError((e as Error).message);
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load(from, to);
    return () => {
      generation.current++;
    };
  }, [company]);
  async function drill(account: string, page = 0) {
    if (!report) return;
    setBusy(true);
    setError("");
    try {
      setLedger(
        await request(
          `companies/${company}/accounts/${account}/ledger?from=${report.from}&to=${report.to}&page=${page}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportCsv() {
    if (!report) return;
    setBusy(true);
    setError("");
    try {
      const data = await request(`companies/${company}/reports/export`, {
        from: report.from,
        to: report.to,
      });
      const url = URL.createObjectURL(
        new Blob([data.csv], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel settings">
        <h2>Reporting dates</h2>
        <form
          className="report-filters"
          onSubmit={(e) => {
            e.preventDefault();
            void load(from, to);
          }}
        >
          <label>
            Fiscal period
            <select
              aria-label="Reporting fiscal period"
              disabled={busy}
              defaultValue=""
              onChange={(e) => {
                const p = periods.find((p) => p.id === e.target.value);
                if (p) {
                  setFrom(p.starts.slice(0, 10));
                  setTo(p.ends.slice(0, 10));
                }
              }}
            >
              <option value="">Custom dates</option>
              {periods.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                  {p.closed ? " · closed" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            From date
            <input
              type="date"
              value={from}
              required
              disabled={busy}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Through date
            <input
              type="date"
              value={to}
              required
              disabled={busy}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            Apply dates
          </button>
        </form>
        <p className="muted">
          Income uses the selected interval. Closing balances, financial
          position and reconciliation include all posted history through the end
          date.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {busy && <p role="status">Loading report…</p>}
      </section>
      {report && (
        <>
          <p className="muted report-caption">
            Showing {report.from} through {report.to} · PHP · Posted entries
            only
          </p>
          <div className="metrics">
            {[
              ["Revenue", report.income.revenue],
              ["Expenses", report.income.expenses],
              ["Net income", report.income.netIncome],
            ].map(([label, value]) => (
              <div className="metric" key={label}>
                <div>{label}</div>
                <strong>{money(value)}</strong>
                <small>Selected date range</small>
              </div>
            ))}
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Trial balance</h2>
                <p className="muted">
                  Positive net balances are debits; negative balances are
                  credits. Select an account for its activity.
                </p>
              </div>
              <button className="secondary" disabled={busy} onClick={exportCsv}>
                Export CSV ↓
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="num">Opening</th>
                    <th className="num">Debits</th>
                    <th className="num">Credits</th>
                    <th className="num">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {report.trialBalance.map((r: Row) => (
                    <tr key={r.id}>
                      <td>
                        <button
                          className="table-link"
                          disabled={busy}
                          onClick={() => drill(r.id)}
                        >
                          {r.code} · {r.name}
                        </button>
                      </td>
                      <td className="num">{money(r.opening)}</td>
                      <td className="num">{money(r.debit)}</td>
                      <td className="num">{money(r.credit)}</td>
                      <td className="num">{money(r.closing)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    {["opening", "debit", "credit", "closing"].map((k) => (
                      <td className="num" key={k}>
                        {money(
                          report.trialBalance
                            .reduce(
                              (sum: Decimal, r: Row) => sum.plus(r[k]),
                              new Decimal(0),
                            )
                            .toFixed(2),
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
          {ledger && (
            <section className="panel report-section">
              <div className="panel-heading">
                <div>
                  <h2>Account activity · {ledger.account.name}</h2>
                  <p className="muted">
                    {ledger.total} posting lines in {report.from} through{" "}
                    {report.to}
                  </p>
                </div>
                <button className="text-button" onClick={() => setLedger(null)}>
                  Close activity
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date / journal</th>
                      <th>Memo</th>
                      <th className="num">Debit</th>
                      <th className="num">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.entries.map((l: Row) => (
                      <tr key={l.id}>
                        <td>
                          {l.business_date}
                          <small className="document-number">
                            JE-{l.number}
                          </small>
                        </td>
                        <td>{l.memo}</td>
                        <td className="num">{money(l.debit)}</td>
                        <td className="num">{money(l.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!ledger.entries.length && (
                  <p className="empty">No activity in this date range.</p>
                )}
              </div>
              <div className="panel-heading">
                <button
                  className="secondary"
                  disabled={busy || ledger.page === 0}
                  onClick={() => drill(ledger.account.id, ledger.page - 1)}
                >
                  Previous page
                </button>
                <span>Page {ledger.page + 1} · 50 lines per page</span>
                <button
                  className="secondary"
                  disabled={busy || (ledger.page + 1) * 50 >= ledger.total}
                  onClick={() => drill(ledger.account.id, ledger.page + 1)}
                >
                  Next page
                </button>
              </div>
            </section>
          )}
          <section className="panel reconciliation">
            <h2>Financial position · {report.to}</h2>
            {[
              ["Assets", report.position.assets],
              ["Liabilities", report.position.liabilities],
              ["Posted equity", report.position.equity],
              [
                "Accumulated unclosed profit / (loss)",
                report.position.accumulatedProfit,
              ],
              [
                "Assets less liabilities and equity",
                report.position.difference,
              ],
            ].map(([label, value]) => (
              <div className="health-row" key={label}>
                <span>{label}</span>
                <b>{money(value)}</b>
              </div>
            ))}
            <p className="muted">
              Basic ledger summary, not a complete statutory financial
              statement. Year-end profit transfer, cash flows and disclosure
              notes are not implemented.
            </p>
          </section>
          <section className="panel reconciliation">
            <h2>Subledger reconciliation · {report.to}</h2>
            {report.reconciliation.map((r: Row) => (
              <div className="health-row" key={r.kind}>
                <span>{r.kind === "sale" ? "Receivables" : "Payables"}</span>
                <b>
                  {money(r.subledger)} / GL {money(r.control)}
                </b>
                <span>
                  {new Decimal(r.difference).isZero()
                    ? "✓ Reconciled"
                    : `Difference ${money(r.difference)}`}
                </span>
              </div>
            ))}
            <p className="muted">
              Includes only documents and settlements dated on or before{" "}
              {report.to}. Sample tax treatment remains unverified.
            </p>
          </section>
        </>
      )}
    </>
  );
}
export function FiscalPeriodForm({
  company,
  onSaved,
}: {
  company: string;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef("");
  useEffect(() => {
    key.current = crypto.randomUUID();
  }, [company]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/companies/${company}/periods`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key.current,
        },
        body: JSON.stringify(input),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      key.current = crypto.randomUUID();
      form.reset();
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="period-form">
      <h3>Add a fiscal period</h3>
      <p className="muted">
        Dates cannot overlap any existing period, including closed periods.
        Adding a period does not transfer profit or reopen old books.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <label>
        Period name
        <input
          name="name"
          required
          minLength={2}
          maxLength={80}
          placeholder="FY 2027"
        />
      </label>
      <div className="form-row">
        <label>
          Period starts
          <input name="starts" type="date" required />
        </label>
        <label>
          Period ends
          <input name="ends" type="date" required />
        </label>
      </div>
      <button className="primary" disabled={busy}>
        Add fiscal period
      </button>
    </form>
  );
}
