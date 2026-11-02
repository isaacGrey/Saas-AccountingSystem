# Data model reference

Executable truth: db/migrations/*.sql. The architectural domain plan is in architecture.md.

Identity: users hold normalized email and bcrypt hash; sessions are server-side PostgreSQL sessions. Tenants are subscribers; companies are legal books, with PHP and Asia/Manila defaults. Memberships connect a user to an explicit company and role. Branches belong to company scope, never substitute for the legal company. Signup currently creates one company/branch; broader administration remains pending.

Accounting: periods define non-overlapping ranges per company (GiST exclusion); accounts define unique company codes and classifications. Tax rules have an effective start and explicitly unverified development rates. Journals have business dates, immutable posted status and optional unique reversal links. Journal lines have one positive debit or credit and composite company/account/journal references. PostgreSQL enforces at least two balanced lines at posting commit.

Sources: parties distinguish customer/supplier. Documents snapshot party name, net/tax/gross, sample tax code/rate, business date and posted journal. Payments reference the source and their own journal, separately storing cash and withholding. Outstanding balance is derived, never stored as a mutable floating point amount. Document row locks serialize allocation. Current document party creation is per-document; master-party deduplication/editor remains pending.

Controls: requests store company-scoped idempotency keys, canonical validated payload hashes and response snapshots. Audit events are append-only for the runtime role, with actor/action/entity/detail/time. Outbox events are transactionally recorded; no consumer exists yet. Every financial table has tenant/company scope plus composite referential constraints. RLS checks transaction-local scope AND current user membership; memberships and tenant reads are restricted as well.

All financial numbers use fixed-scale NUMERIC and JSON decimal strings. Financial dates are date-only; event times are UTC timestamptz. Identity-generated DEV numbers are not legal invoice series and may have gaps. JSONB is confined to theme, audit/outbox metadata and idempotent response snapshots, not journal amounts or document line accounting.

Full source line items, inventory layers, approvals, payroll, assets, subscription and migration schemas must be added as normalized, scoped entities in future reviewed migrations. Do not infer their existence from the product plan.
