# Invoice and supplier-bill drafts and approvals

This increment adds a development document lifecycle: draft → submitted → approved or rejected → posted. It covers basic customer invoices and supplier bills, not payment, payroll, journal, inventory or order approvals. It is not legal invoice issuance or a BIR-compliant invoice system.

Use Drafts & approvals to create a typed draft, save it, submit it and review it. Drafts have normalized financial fields, author/last-editor/reviewer IDs, a monotonic version and timestamps. No draft affects the ledger, outstanding items or reports until posting. Owners/accountants may create, revise, submit and post; auditors can read. An owner who neither created nor last edited the draft must approve/reject, with a reason. There is one review stage, no amount threshold, delegation or approval routing yet.

A rejected or approved draft can be revised, resetting it to draft and clearing its reviewer/decision. Submitted and posted drafts cannot be edited. Revised drafts must be submitted and independently approved again. Every state change increments the version; stale commands conflict rather than overwrite another person's work. The UI shows author, reviewer, version, decision and state. Revision and decision audit events retain inputs/reasons/version history. Lists currently show the latest 100 drafts.

Posting consumes the exact approved contents via the existing accounting engine and commits source, balanced journal, audit/outbox and final draft state together. Closed periods, missing tax rules and other failures roll everything back; approval remains available for correction/retry. A unique source-draft index prevents double posting, with scoped idempotency keys supporting retry. Revisions after approval invalidate approval. Database triggers independently enforce state transitions, review separation, source-content matching and atomic finalization. Runtime credentials cannot delete drafts.

Owners can require independent review in Settings → Document approval policy. Enabling requires at least two company owners. The policy is off by default for existing and newly created companies, preserving the previous direct development workflow. When enabled, the New invoice/bill form saves a draft and direct API/database document insertion without an approved draft is blocked. Policy changes are owner-only, require a reason and are audited. Owners can explicitly disable the policy; this authorized configuration change is not a bypass protection against a malicious owner. Policy changes and posting coordinate through company locks.

If an owner later removes the second owner's access, required-review documents remain unpostable until an eligible owner is added or the policy is explicitly changed. Membership/role administration is not disabled. Earlier authorized approval remains historical evidence if the reviewer later leaves. Current application tax rules are unverified sample rules; effective-dated verified tax versions and approval snapshots for mutable tax configuration remain future work.

## Windows review

Stop the app, pull codex/accounting-foundation, run npm.cmd run services and npm.cmd run db:migrate, then npm.cmd run dev. Keep .env and existing volumes. Migrations 005–006 are additive and retain all previous transactions.

1. Register a second development user (use another browser/private window).
2. From Company access, grant that registered email owner access to the company being tested.
3. Enable required independent review with a policy-change reason.
4. Create an invoice; it saves as a draft. In Drafts & approvals, submit it. Its author cannot approve it.
5. In the second user's browser, select the shared company, open the submitted draft, enter a reason and approve.
6. Return to the first user, reload the draft and post. Verify the source document, balanced journal and AR/AP reports.
7. Separately try rejection, revision after approval and a stale browser version. A revised draft requires fresh approval.

No emails or external notifications are sent. General approval policy routing, approval history UI beyond the current decision/audit log, legal document issuance, source credit notes, payment corrections, MFA and recovery remain pending.
