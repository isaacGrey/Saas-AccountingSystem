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

## Reporting and fiscal-period increment — 3 November 2026

Final `npm run build` passes for both API and web. `npm test` passes 22 tests, including all prior accounting/access checks and new date-sensitive reporting and CSV safety checks. `npm run test:browser` passes all 3 scenarios: company access, original finance workflow, and fiscal-year setup/report filtering/drilldown/export at desktop/mobile sizes. Browser scenarios ran before the final formatting and numeric-negative CSV preservation correction; the final API suite explicitly verifies that correction.

Independent reporting fixture: January capital PHP 5,000, January sale net PHP 1,000 plus sample VAT PHP 120, January bill net PHP 400 plus sample VAT PHP 48, customer collection in February, supplier payment in March. January income is PHP 600; assets PHP 6,168; liabilities PHP 568; posted equity PHP 5,000; accumulated unclosed profit PHP 600; balance-sheet difference zero. January AR remains PHP 1,120 and AP PHP 448 despite later settlements. February AR opening is PHP 1,120, credit activity PHP 1,120, closing zero; February income is zero. Historical reports remain unchanged after period close.

New tests also cover invalid dates/ranges, unauthorized report and account access, auditor exports with audit evidence, denial of auditor/accountant period creation, concurrent overlapping periods (exactly one accepted), rejection of overlap with closed periods, new-year postings, stable ordering across a 51-line two-page ledger, formula-safe CSV text and preserved negative numeric cells. These are synthetic arithmetic/control tests, not statutory reporting verification or performance benchmarks.

## Document approval increment — 3 November 2026

Final API/web builds pass. The API/PostgreSQL suite reports 23 passing tests, retaining all earlier checks. Four Chromium scenarios pass: company access, two-owner document approval, fiscal reporting, and the original invoice/bill/settlement workflow. Browser tests ran before the final deferred source-finalization constraint; the final API suite directly verifies that additional constraint.

Approval checks cover: requirement for a second owner when enabling policy; company isolation; author self-approval denial; rejected/unapproved posting denial; submitted/posted edit denial; independent approve/reject with reasons; edit-after-approval reset; stale-version conflicts; mismatched approved-content insertion rejected by PostgreSQL; correctly matched source insertion without draft finalization rejected at commit; raw direct source insertion denied while policy is enabled; complete rollback of failed posting; identical retry returns one source; competing bill-posting requests produce one success; auditor writes/policy changes rejected; decision/revision/posting audit evidence; authorized policy disable restores direct posting. The browser scenario uses two independent authenticated browser contexts, enables policy, saves/submits an invoice draft, approves as a second owner, posts as author and verifies its sales record at desktop/mobile sizes.

General approval routing, thresholds, delegation, payment/journal/payroll approvals and statutory issuance are not covered or claimed implemented. No live messages or filings were sent.
