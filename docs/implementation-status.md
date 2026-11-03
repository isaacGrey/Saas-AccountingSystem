# Implementation status and continuation guide

## Latest increment: dated reporting and fiscal periods

Owners can add non-overlapping accounting periods. Reports now provide date-filtered opening/activity/closing trial balances, period income, as-of financial-position summaries, historical AR/AP reconciliation, paginated account activity and audited server-generated CSV exports. See reporting-and-periods.md. Approved reopening, year-end profit transfers and full statutory statements remain pending.

## Previous increment: company access

Implemented owner-only member listing and role grants/changes/revocation for registered users, additive legal-company creation within the same tenant, and an explicit company switcher with persisted selection. Creation copies configuration but no transactions or other memberships. See company-access.md. Email invitations, MFA/recovery, branch administration and granular roles remain pending.

## Original foundation milestone

Local development vertical slice, not a complete commercial product. Original full requirements remain in product-requirements.md. No production deployment, live messages, payments, books or government filings have been performed.

Implemented: pinned Next.js/NestJS/TypeScript stack; local PostgreSQL and Redis; maintained password/session libraries; signup creates tenant, company, main branch, current-year period, starter accounts and sample tax treatments; actual restricted-role PostgreSQL RLS; company-scoped composite foreign keys; exact decimal arithmetic; atomic sales invoice/bill posting; cash/withholding settlement; remaining balance and overpayment protection; scoped hashed idempotency keys; manual journals and linked reversals; immutable posted history; close-period lock; transactional audit/outbox; trial balance, income summary, VAT controls, AR/AP reconciliation; trial balance CSV; server-persisted five-preset light/dark/system company themes; desktop/mobile interface; API documentation at /api/docs; PostgreSQL and browser regression tests.

Not complete: milestone 1 compliance discovery and full reference review; milestone 2 fine-grained permissions, MFA, multi-company/branch administration, editable COA and approved period reopening, full reporting/theme controls; milestone 3 regulatory tax verification, statutory invoice issuance, credit notes, bank reconciliation, withholding certificates and tax returns. The first connected development workflow is runnable without representing these milestones as fully complete.

## Next concrete work (dependency order)

1. Obtain the authorized reference PDF and access to current BIR/NPC/SSS/PhilHealth/Pag-IBIG/DOLE official sources; verify effective dates and preserve source evidence. Have a Philippine accountant approve applicability and fixtures before any live tax behavior.
2. Add invitation/membership administration, explicit multiple-company/branch selection, least-privilege roles, MFA, recovery, user/session revocation, transactional approval policies and personal preferences. Keep full isolation tests.
3. Build versioned verified tax profiles, invoice drafts/approval/issuance, legally correct credit notes, payment corrections and certificate reconciliation. Replace only sample rules with approved effective-dated rules, retaining historical snapshots.
4. Add editable COA, fiscal calendars and approved reopening; as-of/date-range reports, financial position/cash flows/equity statements and drilldown; paginate rather than just cap lists.
5. Private S3-compatible attachments, upload validation/scanning, scoped expiring access; worker delivery/retry/dead letters from PostgreSQL outbox. Redis is provisioned but intentionally unused until a real job implementation exists.
6. Orders/receipts/shipment/three-way match and approvals; inventory valuation; assets/projects/budgets/CRM. Follow the complete mapping, not only this summary.
7. Implement payroll against verified agency fixture packs; migration dry-run/reconciliation; subscriptions/accountant portfolio/portals; authenticated integration adapters.
8. Release gates: security review, regulatory/financial approval, restore drills, load benchmarks, registration/certification evidence and explicit deployment instruction.

## Resuming

Read README, architecture, posting-rules, test-evidence and this document. Run setup only if .env is absent. Start services; apply append-only migrations; build/start API and UI; run tests. Do not rewrite already-applied migration files; checksum validation detects changes. Preserve synthetic data in local Docker volumes. Tests create uniquely named synthetic tenants and leave evidence; use a disposable database for CI. Never run test fixtures against live books.

## Known limitations

Only PHP, one initial branch and calendar fiscal period per new company. Owner/accountant/auditor permissions now have a company-owner administration UI. Server sessions lack MFA/recovery; suitable only for this local milestone. Auth tables are not exposed by APIs. Company settings require write permission. Reports support explicit dates but are not complete statutory financial statements. Document, journal and audit lists show 100 latest rows; accounting totals and reconciliation cover all rows. Basic two-line manual journal UI; API supports up to 100 lines. Source reversals require a future correction workflow. Close is one-way for now. Outbox has no delivery worker. API OpenAPI request schemas are explicit for documents/payments; auth, journal and settings schemas need fuller OpenAPI descriptions. Themes support company presets/mode; full custom colours, import/export, logos, personal overrides and contrast validation are pending. No performance, restore, accessibility-certification or production-security claims.
