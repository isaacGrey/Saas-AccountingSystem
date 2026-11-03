# Dated financial reports and fiscal periods

Owners can add named, non-overlapping accounting periods in Settings. Date bounds are inclusive. The PostgreSQL exclusion constraint rejects overlaps, including overlaps with closed periods, under concurrency. A narrow SECURITY DEFINER function checks company ownership and locks the company; runtime credentials no longer have direct INSERT rights on periods. Creation is idempotent and audited. Existing periods are not resized. Closing retains the existing posting lock and remains one-way: approved reopening and year-end income transfer are not yet implemented.

Reports now accept explicit inclusive From/Through dates, with a fiscal-period selector as a convenience. Changing inputs does not silently relabel old results: Apply dates fetches a new report and each result displays its actual dates. The company selector mounts a separate report instance, preventing old-company responses from replacing the new company's reports.

Trial balance: opening = posted debits minus credits strictly before From; activity debits/credits = posted lines between From and Through; closing = opening plus net activity. Positive net balances are debit balances, negative are credit balances. All values are exact decimal strings. Prior-year balances carry forward in the report; no opening journal is invented and no year-end closing entry is automatically generated.

Income summary uses period activity only. Financial position uses closing asset, liability and equity balances plus accumulated unclosed income/expense results from inception. The difference must equal zero for balanced books. This is a basic management summary, not a complete statutory/PFRS statement or annual closing workflow. Cash flows, changes in equity, disclosure notes and verified statutory tax returns remain pending.

Historical AR/AP reconciliation includes documents dated by Through and only payments dated by Through. A future payment does not rewrite an earlier outstanding balance. One PostgreSQL statement builds trial balance and both subsidiary totals, so they share a single MVCC snapshot even while other sessions post. Reports include all applicable rows, independent of the 100-record workspace list cap.

Select any trial-balance account for its dated journal lines. Entries have date, JE number, memo and debit/credit. Pages contain 50 lines with deterministic date/number/line-ID ordering and an uncapped total count. Pagination is live; backdated entries added between page requests may shift pages. This is not a frozen filing artifact.

CSV export is generated server-side for the applied dates after authorization, includes dates/opening/activity/closing, quotes text, neutralizes spreadsheet formula prefixes while preserving numeric negatives, and records a report.exported audit/outbox event. Exports are a fresh snapshot and can differ from an earlier screen if another session posts; refresh the screen when comparing. Auditors may read and export but cannot create periods. Nonmembers cannot access reports, exports or ledger drilldown.

Windows update: Ctrl+C to stop the app, git pull --ff-only origin codex/accounting-foundation, npm.cmd ci, npm.cmd run services, npm.cmd run db:migrate, npm.cmd run dev. Keep .env and Docker volumes. Migration 004 is additive and preserves all existing books.
