# Verification evidence

Verified in the managed Debian workspace on 3 November 2026 (Asia/Singapore). Synthetic data only. These are local results; GitHub Actions configuration has not run remotely.

| Check | Actual result |
|---|---|
| npm run build | PASS: NestJS TypeScript compile and Next.js production build/type check |
| npm test | PASS: 19 tests reported by Node (18 named subtests plus parent), real PostgreSQL 17 and HTTP API |
| npm run test:browser | PASS: one end-to-end Chromium scenario, desktop 1440px and mobile 390px |
| npm audit --omit=dev --audit-level=high | PASS: registry reported 0 vulnerabilities in production dependencies at check time |
| git diff --check | PASS |
| Docker service health | PostgreSQL and Redis healthy |

Database/API coverage: non-superuser/non-BYPASSRLS runtime role; fail-closed RLS; unauthorized API access; different-tenant and same-tenant/different-company isolation; composite foreign keys; transaction-local pool context reset; sales and purchasing with explicit withholding; independent expected balances; identical concurrent idempotency replay and conflicting payload rejection; simultaneous payment over-allocation prevention; exact-decimal/date validation; database-enforced balance rollback; posted-record immutability; append-only audit privileges; manual reversal and duplicate/source reversal rejection; manual AR/AP bypass rejection; whole source/journal/audit/outbox rollback; persisted/validated themes; auditor read-only behavior; close/post race and closed-period rejection; CSRF origin and logout revocation.

Browser scenario: create account/company; post PHP 10,000 net sample-VAT sale; collect PHP 11,000 cash plus PHP 200 withholding; post PHP 4,000 net sample-VAT bill; pay PHP 4,400 cash plus PHP 80 withholding; verify AR/AP reconciliation; save dark Emerald and reload; restore light Ocean; inspect dashboard; verify no page-width overflow at 390px. Browser page errors are asserted empty. Screenshot: workspace-preview.png.

Independent expected ledger: cash DR 6,600; withholding receivable DR 200; input VAT DR 480; operating expense DR 4,000; revenue CR 10,000; output VAT CR 1,200; withholding payable CR 80; AR/AP zero. Debits=credits=PHP 11,280 on a net-balance basis. Income=PHP 6,000. These fixtures are arithmetic evidence, not statutory tax validation.

Failures found and fixed: framework dependency incompatibility (selected supported TS 6); ESM build alignment for Nest 12; PostgreSQL row-lock update privilege (minimal column grant with immutable trigger retained); browser locator refinement; absolute screen-reader label causing mobile overflow (contained within positioned scrolling table). Final checks above passed after fixes.

Not verified: official tax/payroll compliance, BIR forms/validators, external integrations, MFA/recovery, full WCAG audit, complete role matrix, source credit-note/payment corrections, migration cutover, S3 security, worker delivery, backup restore, load/performance/SLOs, production hosting and security review. No throughput/scalability or recovery guarantee is claimed. Production dependency audit is not a security certification.

## Company-access increment — 3 November 2026

`npm test`: 20 tests pass, including the new administration scenario. It checks owner-only member visibility, denial of accountant administration, auditor read-only access, accountant posting, self-owner protection, owner promotion, revocation without loss of access to unrelated companies, audit events, same-tenant separation and idempotent concurrent company creation. Existing accounting regression checks continue to pass.

`npm run test:browser`: 2 scenarios pass. New coverage creates a second company through Settings, verifies empty books, switches back, persists selected context across reloads and checks the selector on 390px mobile. The original invoice/bill/withholding/reports/theme scenario still passes. Final API/web builds pass. Remote CI execution remains unverified.
