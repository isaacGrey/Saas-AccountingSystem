# Tala Accounting · Philippine accounting SaaS

First local development milestone: company setup → sample tax treatment → customer invoice / supplier bill → balanced journal → cash and withholding settlement → AR/AP reconciliation and trial balance. This is a runnable foundation, **not a production-ready or verified Philippine-compliant product**.

## Run locally

Prerequisites: Node 24, npm, Docker with Compose, free ports 3000, 4000, 54329 and 63799.

```sh
npm run setup
npm ci
npm run services
npm run db:migrate
npm run dev
```

Open http://localhost:3000 on the machine running the app. For a remote cloud workspace, use an authorized local tunnel/preview before opening it on your own device; localhost on your PC does not refer to this cloud machine. No hosted deployment is included.

Create a development account with a unique email and a 12+ character password. Signup creates a company, main branch, current-year fiscal period, starter chart of accounts and explicitly unverified sample tax rules. No emails are sent and there are no default credentials.

## Review the persisted workflow

1. Post a sample customer invoice: net PHP 10,000; sample VAT PHP 1,200; total PHP 11,200.
2. Record collection: cash PHP 11,000 plus explicit withholding PHP 200. AR becomes zero; revenue remains PHP 10,000 and output VAT PHP 1,200.
3. Post a sample supplier bill: net PHP 4,000; sample VAT PHP 480; total PHP 4,480. Pay cash PHP 4,400 plus withholding PHP 80.
4. Reports show cash PHP 6,600, input VAT PHP 480, output VAT PHP 1,200, withholding receivable PHP 200, withholding payable PHP 80, net income PHP 6,000 and zero AR/AP. Trial balance is balanced.
5. Inspect General ledger and Activity log. Change and save company appearance; reload to verify persistence.

All example rates and withholding amounts are synthetic fixtures, not advice or verified taxpayer treatment. Documents are DEV records, not valid tax invoices.

## Verify

Start the API and web app before the tests. Tests create new synthetic companies in the configured local database.

```sh
npm run build
npm test
npm run test:browser
```

Browser tests use installed Chromium at /usr/bin/chromium; set CHROMIUM_PATH for another installation. They cover the full sales/purchasing workflow and mobile/theme behavior. API documentation: http://localhost:4000/api/docs (on the execution machine).

## Project layout

- apps/web: Next.js user interface and theme tokens.
- apps/api: NestJS API, access context, exact-decimal posting services.
- db/migrations: reviewed PostgreSQL constraints, RLS, roles and immutable records.
- tests: real PostgreSQL/API and browser checks.
- docs: product requirements, architecture, feature traceability, compliance gaps, payroll, migration, design, operations and implementation handoff.

See [implementation status](docs/implementation-status.md), [test evidence](docs/test-evidence.md), and [compliance register](docs/compliance-matrix.md) before expanding scope. The supplied reference PDF remains unavailable. No live integrations, government submissions, production deployment or real accounting migration have occurred.

## Update an existing Windows installation

Stop the running app with Ctrl+C, then run these from your project folder:

```powershell
git pull --ff-only origin codex/accounting-foundation
npm.cmd ci
npm.cmd run services
npm.cmd run db:migrate
npm.cmd run dev
```

Keep your existing `.env` and Docker volumes. The new Company access section in Settings supports creating separate companies and managing registered users. Use the header selector to switch companies. See [company access](docs/company-access.md) for permissions and limits.
