"use client";
import { useEffect, useState, FormEvent } from "react";
import Decimal from "decimal.js";
import { FinancialReports, FiscalPeriodForm } from "./financial-reports";
import { DocumentApprovals, ApprovalPolicy } from "./document-approvals";
import { CompanyAccess } from "./company-access";
type Row = Record<string, any>;
const php = (v: string | number) =>
  "₱" + new Decimal(v || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const displayDate = (v: string) =>
  new Date(v).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
async function api(path: string, method = "GET", body?: unknown, key?: string) {
  const r = await fetch("/api/" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || "Request failed");
  return data;
}
const nav = [
  ["overview", "◈", "Overview"],
  ["sale", "→", "Sales & collections"],
  ["bill", "←", "Bills & payments"],
  ["drafts", "✓", "Drafts & approvals"],
  ["journals", "≡", "General ledger"],
  ["reports", "▥", "Reports"],
  ["accounts", "⌘", "Chart of accounts"],
  ["activity", "◷", "Activity log"],
  ["settings", "⚙", "Settings"],
];
export default function Home() {
  const [me, setMe] = useState<Row | null>(null),
    [company, setCompany] = useState(""),
    [data, setData] = useState<Row | null>(null),
    [view, setView] = useState("overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [register, setRegister] = useState(true),
    [modal, setModal] = useState<string | null>(null),
    [selected, setSelected] = useState<Row | null>(null),
    [search, setSearch] = useState(""),
    [collapsed, setCollapsed] = useState(false);
  const [net, setNet] = useState("10000.00"),
    [tax, setTax] = useState("DEMO_VAT");
  const [requestKey, setRequestKey] = useState("");
  const current = me?.companies.find((c: Row) => c.id === company);
  const [theme, setTheme] = useState({ mode: "light", preset: "ocean" });
  function applyTheme(t: Row) {
    document.documentElement.dataset.theme = t.preset;
    document.documentElement.dataset.mode =
      t.mode === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : t.mode;
  }
  useEffect(() => {
    applyTheme(theme);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyTheme(theme);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme]);
  async function refresh(id = company) {
    const result = await api("me");
    setMe(result);
    const c = result.companies.some((x: Row) => x.id === id)
      ? id
      : result.companies[0]?.id;
    if (c) {
      const workspace = await api(`companies/${c}/workspace`);
      setCompany(c);
      localStorage.setItem(`tala-company-${result.user.id}`, c);
      setData(workspace);
      const item = result.companies.find((x: Row) => x.id === c);
      setTheme(item.theme);
    }
  }
  useEffect(() => {
    api("me")
      .then(async (result) => {
        setMe(result);
        const saved = localStorage.getItem(`tala-company-${result.user.id}`);
        const c =
          result.companies.find((x: Row) => x.id === saved)?.id ||
          result.companies[0]?.id;
        if (c) {
          setCompany(c);
          setData(await api(`companies/${c}/workspace`));
          setTheme(result.companies.find((x: Row) => x.id === c).theme);
        }
      })
      .catch((e) => {
        if (e.message !== "Please sign in") setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(type: string, row?: Row) {
    setModal(type);
    setSelected(row || null);
    setNet("10000.00");
    setTax("DEMO_VAT");
    setRequestKey(crypto.randomUUID());
    setError("");
  }
  const balance = (code: string) =>
    data?.trialBalance.find((r: Row) => r.code === code)?.balance || "0";
  const total = (kind: string) =>
    new Decimal(balance(kind === "sale" ? "1100" : "2000")).abs().toFixed(2);
  const profit = new Decimal(balance("4000"))
    .neg()
    .minus(balance("5000"))
    .toFixed(2);
  const documents = (data?.documents || []).filter(
    (d: Row) =>
      ((view !== "sale" && view !== "bill") || d.kind === view) &&
      `${d.party_name} ${d.description} ${d.number}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function auth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    await action(async () => {
      await api(
        register ? "auth/register" : "auth/login",
        "POST",
        register ? { ...form, date: day() } : form,
      );
      await refresh();
    });
  }
  async function saveDocument(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    await action(async () => {
      await api(
        `companies/${company}/${current?.approval_required ? "drafts" : "documents"}`,
        "POST",
        { ...form, kind: modal, net, taxCode: tax },
        requestKey,
      );
      await refresh();
      setModal(null);
      setNotice(
        current?.approval_required
          ? "Draft saved. Open Drafts & approvals to submit it."
          : "Document posted. The journal and outstanding balance are updated.",
      );
    });
  }
  async function savePayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    await action(async () => {
      await api(
        `companies/${company}/documents/${selected?.id}/payments`,
        "POST",
        form,
        requestKey,
      );
      await refresh();
      setModal(null);
      setNotice("Settlement posted and reconciled to the general ledger.");
    });
  }
  if (loading)
    return (
      <main className="loading">
        <span className="brand-mark">t</span>
        <p>Opening your workspace…</p>
      </main>
    );
  if (!me)
    return (
      <main className="auth">
        <section className="auth-story">
          <div className="brand">
            <span className="brand-mark">t</span>tala
            <span className="brand-sub">ACCOUNTING</span>
          </div>
          <span className="eyebrow">A CLEARER VIEW OF YOUR BUSINESS</span>
          <h1>
            Good books.
            <br />
            Better decisions.
          </h1>
          <p>
            A considered workspace for your Philippine business. From the first
            invoice to the final balance.
          </p>
          <div className="auth-note">
            Local development edition
            <br />
            <small>Synthetic data only · Tax rules are unverified</small>
          </div>
        </section>
        <section className="auth-form">
          <span className="eyebrow">LET’S GET STARTED</span>
          <h2>{register ? "Set up your workspace" : "Welcome back"}</h2>
          <p className="muted">
            {register
              ? "Create a company with a starter chart of accounts and a current-year fiscal period."
              : "Sign in to continue to your books."}
          </p>
          <form onSubmit={auth}>
            {register && (
              <>
                <label>
                  Your name
                  <input
                    name="name"
                    required
                    minLength={2}
                    autoComplete="name"
                    placeholder="Isaac Santos"
                  />
                </label>
                <label>
                  Company name
                  <input
                    name="company"
                    required
                    minLength={2}
                    placeholder="Sample Philippine Trading Inc."
                  />
                </label>
              </>
            )}
            <label>
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={register ? 12 : 1}
                maxLength={72}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder="At least 12 characters"
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : register
                  ? "Create development workspace →"
                  : "Sign in →"}
            </button>
          </form>
          <button
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register
              ? "Already have a workspace? Sign in"
              : "Create a new workspace"}
          </button>
        </section>
      </main>
    );
  return (
    <div className={`shell ${collapsed ? "compact" : ""}`}>
      <aside>
        <div className="brand">
          <span className="brand-mark">t</span>
          {!collapsed && (
            <>
              tala<span className="brand-sub">ACCOUNTING</span>
            </>
          )}
        </div>
        <button
          className="collapse"
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Toggle navigation"
        >
          {collapsed ? "→" : "←"}
        </button>
        {!collapsed && (
          <div className="workspace-label">
            <span className="avatar">{current?.name.slice(0, 1)}</span>
            <div>
              <strong>{current?.name}</strong>
              <small>Main branch · PHP</small>
            </div>
          </div>
        )}
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([key, icon, label]) => (
            <button
              key={key}
              title={label}
              onClick={() => {
                setView(key);
                setSearch("");
              }}
              className={view === key ? "active" : ""}
            >
              <span aria-hidden>{icon}</span>
              {!collapsed && label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {!collapsed && (
            <>
              <span className="dev-pill">DEVELOPMENT</span>
              <p>Sample rules. Real accounting controls.</p>
              <small>
                {me.user.name}
                <br />
                {me.user.email}
              </small>
            </>
          )}
          <button
            onClick={() =>
              action(async () => {
                await api("auth/logout", "POST");
                setMe(null);
                setData(null);
                setCompany("");
              })
            }
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="separator">/</span>
            {nav.find((n) => n[0] === view)?.[2]}
          </div>
          <div className="header-right">
            <select
              aria-label="Active company"
              className="company-picker"
              value={company}
              disabled={busy || !!modal}
              onChange={(e) => {
                const id = e.target.value;
                action(async () => {
                  setData(null);
                  await refresh(id);
                  setView("overview");
                  setSearch("");
                });
              }}
            >
              {me.companies.map((c: Row) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.role}
                </option>
              ))}
            </select>
            <span className="live-dot" /> Local development{" "}
            <span className="avatar small">{me.user.name.slice(0, 1)}</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">{displayDate(day())} · PHP</span>
              <h1>
                {view === "overview"
                  ? "Your business, at a glance"
                  : nav.find((n) => n[0] === view)?.[2]}
              </h1>
              <p className="muted">
                {view === "overview"
                  ? "A clear picture of your books, from posted transactions."
                  : view === "sale"
                    ? "Invoices, outstanding balances, and customer collections."
                    : view === "bill"
                      ? "Supplier bills, balances due, and payments."
                      : "Every figure connects back to your company’s books."}
              </p>
            </div>
            <div className="heading-actions">
              {["overview", "sale", "bill"].includes(view) && (
                <button
                  className="primary"
                  onClick={() => open(view === "bill" ? "bill" : "sale")}
                >
                  ＋ {view === "bill" ? "New bill" : "New invoice"}
                </button>
              )}
              {view === "journals" && (
                <button className="primary" onClick={() => open("journal")}>
                  ＋ Manual journal
                </button>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="success">
              {notice}
            </div>
          )}
          {!data ? (
            <p>Loading company records…</p>
          ) : (
            <>
              {view === "drafts" && (
                <DocumentApprovals
                  key={company}
                  company={company}
                  userId={me.user.id}
                  role={current.role}
                  onPosted={() => refresh()}
                />
              )}
              {view === "overview" && (
                <>
                  <div className="metrics">
                    {[
                      [
                        "Cash & bank",
                        php(balance("1000")),
                        "Posted cash movements",
                        "1000",
                      ],
                      [
                        "To collect",
                        php(total("sale")),
                        "Accounts receivable",
                        "sale",
                      ],
                      [
                        "To pay",
                        php(total("bill")),
                        "Accounts payable",
                        "bill",
                      ],
                      [
                        "Net income",
                        php(profit),
                        "Revenue less expenses",
                        "reports",
                      ],
                    ].map(([label, value, hint, target]) => (
                      <button
                        className="metric"
                        key={label}
                        onClick={() =>
                          setView(target === "1000" ? "reports" : target)
                        }
                      >
                        <div>
                          {label}
                          <span>→</span>
                        </div>
                        <strong>{value}</strong>
                        <small>{hint}</small>
                      </button>
                    ))}
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Recent documents</h2>
                          <p className="muted">
                            Your latest invoices and supplier bills
                          </p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setView("sale")}
                        >
                          View sales →
                        </button>
                      </div>
                      <DocumentTable
                        rows={data.documents.slice(0, 6)}
                        onSelect={(d) => open("detail", d)}
                      />
                    </section>
                    <section className="panel health">
                      <span className="eyebrow">BOOKS AT A GLANCE</span>
                      <h2>Built on balanced entries.</h2>
                      <div className="health-row">
                        <span>Ledger balance</span>
                        <b>
                          {new Decimal(
                            data.trialBalance.reduce(
                              (a: Decimal, r: Row) => a.plus(r.balance),
                              new Decimal(0),
                            ),
                          ).isZero()
                            ? "✓ Balanced"
                            : "Needs review"}
                        </b>
                      </div>
                      <div className="health-row">
                        <span>Fiscal period</span>
                        <b>
                          {data.periods.find(
                            (p: Row) =>
                              p.starts.slice(0, 10) <= day() &&
                              p.ends.slice(0, 10) >= day(),
                          )?.closed
                            ? "Closed"
                            : data.periods.some(
                                  (p: Row) =>
                                    p.starts.slice(0, 10) <= day() &&
                                    p.ends.slice(0, 10) >= day(),
                                )
                              ? "Open"
                              : "No current period"}
                        </b>
                      </div>
                      <div className="health-row">
                        <span>Tax configuration</span>
                        <b>Sample only</b>
                      </div>
                      <p className="muted">
                        Development documents are not valid tax invoices. Verify
                        tax treatment before live use.
                      </p>
                      <button
                        className="secondary"
                        onClick={() => setView("reports")}
                      >
                        Review trial balance →
                      </button>
                    </section>
                  </div>
                  <section className="panel next-steps">
                    <span className="round-icon">→</span>
                    <div>
                      <h2>Start with a complete transaction</h2>
                      <p className="muted">
                        Create an invoice, record a collection, then follow both
                        entries into your ledger.
                      </p>
                    </div>
                    <button className="secondary" onClick={() => open("sale")}>
                      Create invoice
                    </button>
                  </section>
                </>
              )}
              {["sale", "bill"].includes(view) && (
                <>
                  <div className="section-strip">
                    <div>
                      <span className="muted">Outstanding balance</span>
                      <h2>{php(total(view))}</h2>
                    </div>
                    <label className="search-label">
                      <span className="sr-only">Search documents</span>
                      <input
                        placeholder="Search name, description, or number…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  <section className="panel">
                    <DocumentTable
                      rows={documents}
                      onSelect={(d) => open("detail", d)}
                    />
                    <div className="table-footer">
                      Showing up to 100 recent documents · DEV documents only
                    </div>
                  </section>
                </>
              )}
              {view === "journals" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Posted journals</h2>
                    <span className="badge">Immutable history</span>
                  </div>
                  {data.journals.length === 0 ? (
                    <Empty text="Your first posted document will create a journal here." />
                  ) : (
                    data.journals.map((j: Row) => (
                      <details className="journal" key={j.id}>
                        <summary>
                          <span className="mono">JE-{j.number}</span>
                          <span>{j.memo}</span>
                          <small>{displayDate(j.business_date)}</small>
                          <span className="badge">Posted</span>
                        </summary>
                        <table>
                          <thead>
                            <tr>
                              <th>Account</th>
                              <th className="num">Debit</th>
                              <th className="num">Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {j.lines.map((l: Row, i: number) => (
                              <tr key={i}>
                                <td>
                                  {l.code} · {l.name}
                                </td>
                                <td className="num">{php(l.debit)}</td>
                                <td className="num">{php(l.credit)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!j.reversal_of &&
                          !j.source_linked &&
                          !data.journals.some(
                            (r: Row) => r.reversal_of === j.id,
                          ) && (
                            <button
                              className="text-button"
                              onClick={() => open("reverse", j)}
                            >
                              Request reversal
                            </button>
                          )}
                      </details>
                    ))
                  )}
                </section>
              )}
              {view === "reports" && (
                <FinancialReports
                  key={company}
                  company={company}
                  periods={data.periods}
                />
              )}
              {view === "accounts" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Starter chart of accounts</h2>
                    <span className="badge">PHP functional currency</span>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Account name</th>
                        <th>Classification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.accounts.map((a: Row) => (
                        <tr key={a.id}>
                          <td className="mono">{a.code}</td>
                          <td>{a.name}</td>
                          <td>
                            <span className="badge">{a.kind}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
              {view === "activity" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Company audit trail</h2>
                    <span className="badge">Append-only</span>
                  </div>
                  {data.audit.length === 0 ? (
                    <Empty text="Accounting actions will appear here." />
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Record</th>
                          <th>When · Manila</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.audit.map((a: Row) => (
                          <tr key={a.id}>
                            <td>{a.action}</td>
                            <td className="mono">{a.entity_id.slice(0, 8)}</td>
                            <td>
                              {new Date(a.created_at).toLocaleString("en-PH", {
                                timeZone: "Asia/Manila",
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              )}
              {view === "settings" && (
                <div className="settings-grid">
                  {current?.role === "owner" && (
                    <ApprovalPolicy
                      key={company + String(current.approval_required)}
                      company={company}
                      required={current.approval_required}
                      onSaved={() => refresh()}
                    />
                  )}
                  {current?.role === "owner" && (
                    <CompanyAccess
                      key={company}
                      company={company}
                      userId={me.user.id}
                      onCreated={async (id) => {
                        await refresh(id);
                        setView("overview");
                        setNotice(
                          "Separate company created. Its books are empty.",
                        );
                      }}
                    />
                  )}
                  <section className="panel settings">
                    <h2>Appearance</h2>
                    <p className="muted">
                      Preview a theme, then save it for this company.
                    </p>
                    <label>
                      Colour preset
                      <select
                        value={theme.preset}
                        onChange={(e) =>
                          setTheme({ ...theme, preset: e.target.value })
                        }
                      >
                        {[
                          ["ocean", "Ocean Blue"],
                          ["emerald", "Emerald"],
                          ["indigo", "Indigo"],
                          ["graphite", "Graphite"],
                          ["warm", "Warm Neutral"],
                        ].map(([id, label]) => (
                          <option value={id} key={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Mode
                      <select
                        value={theme.mode}
                        onChange={(e) =>
                          setTheme({ ...theme, mode: e.target.value })
                        }
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                        <option value="system">System</option>
                      </select>
                    </label>
                    <button
                      disabled={busy}
                      className="primary"
                      onClick={() =>
                        action(async () => {
                          await api(
                            `companies/${company}/theme`,
                            "PATCH",
                            theme,
                          );
                          await refresh();
                          setNotice("Company appearance saved.");
                        })
                      }
                    >
                      Save appearance
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setTheme(current.theme)}
                    >
                      Discard preview
                    </button>
                  </section>
                  <section className="panel settings">
                    <h2>Company & fiscal period</h2>
                    {current?.role === "owner" && (
                      <FiscalPeriodForm
                        key={company}
                        company={company}
                        onSaved={async () => {
                          await refresh();
                          setNotice("Fiscal period created.");
                        }}
                      />
                    )}
                    <p>
                      {current.name}
                      <br />
                      <span className="muted">
                        Main branch · PHP · Asia/Manila
                      </span>
                    </p>
                    {data.periods.map((p: Row) => (
                      <div key={p.id}>
                        <p>
                          {p.name} · {p.closed ? "Closed" : "Open"}
                        </p>
                        <p className="muted">
                          {displayDate(p.starts)} – {displayDate(p.ends)}
                        </p>
                        {!p.closed && (
                          <button
                            className="secondary"
                            onClick={() => open("close", p)}
                          >
                            Close fiscal period
                          </button>
                        )}
                      </div>
                    ))}
                    <p className="muted">
                      Closing blocks new postings in this period. Approved
                      reopening is not available in this milestone.
                    </p>
                  </section>
                </div>
              )}
            </>
          )}
          <footer>
            TALA ACCOUNTING{" "}
            <span>
              Development workspace · Not for live books or statutory issuance
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onKeyDown={(e) => {
              if (e.key === "Escape" && !busy) setModal(null);
              if (e.key === "Tab") {
                const nodes = e.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled),input,select,textarea",
                );
                const first = nodes[0],
                  last = nodes[nodes.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">DEVELOPMENT WORKFLOW</span>
                <h2 id="dialog-title">
                  {modal === "sale"
                    ? "New customer invoice"
                    : modal === "bill"
                      ? "New supplier bill"
                      : modal === "payment"
                        ? "Record settlement"
                        : modal === "detail"
                          ? `DEV-${selected?.kind === "sale" ? "INV" : "BILL"}-${selected?.number}`
                          : modal === "journal"
                            ? "Post manual journal"
                            : modal === "reverse"
                              ? "Reverse manual journal"
                              : "Close fiscal period"}
                </h2>
              </div>
              <button
                autoFocus
                className="icon-button"
                aria-label="Close dialog"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                ×
              </button>
            </div>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            {["sale", "bill"].includes(modal) && (
              <form onSubmit={saveDocument}>
                <div className="notice">
                  Sample tax treatment · Not a valid tax invoice
                </div>
                <label>
                  {modal === "sale" ? "Customer" : "Supplier"}
                  <input
                    name="partyName"
                    required
                    minLength={2}
                    placeholder={
                      modal === "sale"
                        ? "Mayumi Creative Studio"
                        : "Bayan Office Supplies"
                    }
                  />
                </label>
                <label>
                  Description
                  <input
                    name="description"
                    required
                    minLength={2}
                    placeholder="Professional services"
                  />
                </label>
                <div className="form-row">
                  <label>
                    Accounting date
                    <input
                      type="date"
                      name="date"
                      defaultValue={day()}
                      required
                    />
                  </label>
                  <label>
                    Net amount · PHP
                    <input
                      inputMode="decimal"
                      value={net}
                      onChange={(e) => setNet(e.target.value)}
                      required
                      pattern="[0-9]+(\.[0-9]{1,2})?"
                    />
                  </label>
                </div>
                <label>
                  Tax treatment
                  <select value={tax} onChange={(e) => setTax(e.target.value)}>
                    <option value="DEMO_VAT">
                      Sample 12% VAT — unverified
                    </option>
                    <option value="DEMO_NONE">
                      Sample no VAT — unverified
                    </option>
                  </select>
                </label>
                <div className="posting-preview">
                  <span>Posting preview</span>
                  <strong>
                    Total{" "}
                    {php(
                      /^\d+(\.\d{0,2})?$/.test(net)
                        ? new Decimal(net)
                            .plus(
                              new Decimal(net)
                                .mul(tax === "DEMO_VAT" ? "0.12" : "0")
                                .toDecimalPlaces(2),
                            )
                            .toFixed(2)
                        : "0",
                    )}
                  </strong>
                  <p>
                    {modal === "sale"
                      ? "Debit receivables · Credit revenue and output VAT"
                      : "Debit expense and input VAT · Credit payables"}
                  </p>
                </div>
                <button className="primary" disabled={busy}>
                  {busy
                    ? "Saving…"
                    : current?.approval_required
                      ? "Save draft for approval"
                      : "Post document & journal"}
                </button>
              </form>
            )}
            {modal === "detail" && selected && (
              <>
                <div className="notice">
                  Development document · {selected.tax_code}
                </div>
                <h3>{selected.party_name}</h3>
                <p>{selected.description}</p>
                <p className="muted">{displayDate(selected.business_date)}</p>
                <div className="detail-totals">
                  {[
                    ["Net", selected.net],
                    ["VAT", selected.tax],
                    ["Total", selected.gross],
                    ["Settled", selected.settled],
                    ["Outstanding", selected.outstanding],
                  ].map(([label, value]) => (
                    <div className="health-row" key={label}>
                      <span>{label}</span>
                      <b>{php(value)}</b>
                    </div>
                  ))}
                </div>
                <div className="form-row">
                  <button
                    className="secondary"
                    onClick={() => {
                      setModal(null);
                      setView("journals");
                    }}
                  >
                    View general ledger
                  </button>
                  {new Decimal(selected.outstanding).gt(0) && (
                    <button
                      className="primary"
                      onClick={() => open("payment", selected)}
                    >
                      Record{" "}
                      {selected.kind === "sale" ? "collection" : "payment"}
                    </button>
                  )}
                </div>
              </>
            )}
            {modal === "payment" && selected && (
              <form onSubmit={savePayment}>
                <p>
                  {selected.party_name} · Outstanding{" "}
                  {php(selected.outstanding)}
                </p>
                <label>
                  Accounting date
                  <input
                    type="date"
                    name="date"
                    defaultValue={day()}
                    required
                  />
                </label>
                <div className="form-row">
                  <label>
                    Cash amount · PHP
                    <input
                      name="cash"
                      defaultValue={selected.outstanding}
                      inputMode="decimal"
                      required
                    />
                  </label>
                  <label>
                    Withheld · PHP
                    <input
                      name="withholding"
                      defaultValue="0.00"
                      inputMode="decimal"
                      required
                    />
                  </label>
                </div>
                <label>
                  Reference
                  <input
                    name="reference"
                    placeholder="Development bank reference"
                    required
                    minLength={2}
                  />
                </label>
                <div className="notice">
                  Withholding is an explicit allocation. Certificate
                  verification and statutory reporting are not available yet.
                </div>
                <button className="primary" disabled={busy}>
                  {busy ? "Posting…" : "Post settlement"}
                </button>
              </form>
            )}
            {modal === "journal" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  action(async () => {
                    await api(
                      `companies/${company}/journals`,
                      "POST",
                      {
                        date: f.date,
                        memo: f.memo,
                        lines: [
                          { code: f.debit, debit: f.amount, credit: "0" },
                          { code: f.credit, debit: "0", credit: f.amount },
                        ],
                      },
                      requestKey,
                    );
                    await refresh();
                    setModal(null);
                    setNotice("Balanced journal posted.");
                  });
                }}
              >
                <label>
                  Date
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={day()}
                  />
                </label>
                <label>
                  Memo
                  <input name="memo" required minLength={3} />
                </label>
                <div className="form-row">
                  {["debit", "credit"].map((side) => (
                    <label key={side}>
                      {side === "debit" ? "Debit account" : "Credit account"}
                      <select
                        name={side}
                        defaultValue={side === "debit" ? "1000" : "3000"}
                      >
                        {data?.accounts
                          .filter(
                            (a: Row) => !["1100", "2000"].includes(a.code),
                          )
                          .map((a: Row) => (
                            <option value={a.code} key={a.id}>
                              {a.code} · {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                </div>
                <label>
                  Amount · PHP
                  <input
                    name="amount"
                    required
                    inputMode="decimal"
                    placeholder="50000.00"
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Post balanced journal
                </button>
              </form>
            )}
            {modal === "reverse" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  action(async () => {
                    await api(
                      `companies/${company}/journals/${selected?.id}/reverse`,
                      "POST",
                      f,
                      requestKey,
                    );
                    await refresh();
                    setModal(null);
                    setNotice(
                      "Linked reversal posted; original history preserved.",
                    );
                  });
                }}
              >
                <p>
                  Source document journals require a correction workflow and
                  cannot be reversed here.
                </p>
                <label>
                  Reversal date
                  <input
                    type="date"
                    name="date"
                    defaultValue={day()}
                    required
                  />
                </label>
                <label>
                  Reason
                  <input name="reason" required minLength={5} />
                </label>
                <button className="primary" disabled={busy}>
                  Post reversal
                </button>
              </form>
            )}
            {modal === "close" && (
              <>
                <p>
                  Close {selected?.name}? This prevents further posting in the
                  period. Reopening is not available yet.
                </p>
                <button
                  disabled={busy}
                  className="primary"
                  onClick={() =>
                    action(async () => {
                      await api(
                        `companies/${company}/periods/${selected?.id}/close`,
                        "POST",
                        {},
                        requestKey,
                      );
                      await refresh();
                      setModal(null);
                      setNotice("Fiscal period closed.");
                    })
                  }
                >
                  Confirm period close
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span>◇</span>
      <h3>A fresh set of books</h3>
      <p>{text}</p>
    </div>
  );
}
function DocumentTable({
  rows,
  onSelect,
}: {
  rows: Row[];
  onSelect: (r: Row) => void;
}) {
  if (!rows.length)
    return (
      <Empty text="Create an invoice or bill to start your accounting history." />
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Document / party</th>
            <th>Date</th>
            <th>Status</th>
            <th className="num">Amount</th>
            <th className="num">Outstanding</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td>
                <button className="table-link" onClick={() => onSelect(d)}>
                  {d.party_name}
                </button>
                <small className="document-number">
                  DEV-{d.kind === "sale" ? "INV" : "BILL"}-{d.number}
                </small>
              </td>
              <td>{displayDate(d.business_date)}</td>
              <td>
                <span
                  className={`badge ${new Decimal(d.outstanding).isZero() ? "settled" : ""}`}
                >
                  {new Decimal(d.outstanding).isZero()
                    ? "Settled"
                    : new Decimal(d.settled).gt(0)
                      ? "Part-paid"
                      : "Posted"}
                </span>
              </td>
              <td className="num">{php(d.gross)}</td>
              <td className="num">{php(d.outstanding)}</td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Open document ${d.number}`}
                  onClick={() => onSelect(d)}
                >
                  →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
