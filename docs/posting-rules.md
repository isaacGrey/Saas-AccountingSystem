# Posting invariants

All posted journals have at least two one-sided positive lines and exactly equal debits/credits. PostgreSQL deferred constraint triggers validate at commit, independently of application checks. Header and lines become immutable after posting. Atomic transactions use explicit connection ownership and transaction-local scope, cleared on rollback/commit. Each source command requires an idempotency key; a scoped advisory lock serializes retries and a content hash rejects key reuse with different payloads.

Each posting locks its fiscal period row; close takes the same lock. Closed periods reject posting. Payment commands also lock their source document to prevent over-allocation under concurrency. Source numbers are company-scoped sequences with explicit DEV prefixes; gaps are allowed. No legal number series has been configured.

Sale (sample VAT): DR AR gross; CR revenue net; CR output VAT. Bill: DR expense net; DR input VAT; CR AP gross. Customer settlement: DR cash paid; DR withholding receivable withheld; CR AR settled. Supplier settlement: DR AP settled; CR cash paid; CR withholding payable withheld. Withholding is explicit settlement allocation and never reduces revenue/VAT. Certificate validation and statutory remittance are not implemented. Manual reversal exchanges debit and credit, preserves history and requires an open date and reason. Source-linked postings cannot be reversed via the manual route.

Trial balance and financial summaries include posted entries only. AR/AP reports reconcile gross less settled amounts to ledger control accounts. General cash flow statement, changes in equity, FX, non-deductible tax, mixed VAT and detailed statutory schedules remain pending.
