# AccountingSuite / 1C migration plan — not implemented

No live migration or reference database access authorized. The referenced Windows PDF is unavailable; obtain it as a user-provided file. Never read an existing 1C PostgreSQL schema as if it were this product's data model. Use authorized exports and documented APIs.

Stage source files with a batch manifest, hash, origin, source identifiers, mapping version and row errors. Map COA, parties, items/UOM/warehouses, bank accounts, dimensions/projects, assets, opening balances, open AR/AP/credits/advances, inventory cost layers, payroll YTD and prior-employer data. Dry runs must detect duplicate source identities, invalid foreign references and incompatible precision.

Choose opening balances OR reconstruction per scope; do not double count documents and balance imports. Retain original document references, issuance numbers and tax snapshots without silently reissuing invoices. Historical documents/attachments require separate completeness assessment.

Cutover checklist: freeze agreed source windows; reconcile TB and subsidiary ledgers, bank/cash, inventory value/quantity, asset accumulated depreciation, taxes and payroll YTD; record exceptions and responsible signoff; take restorable backup; run idempotent import; repeat reconciliation; obtain approval; keep source read-only. Recovery must not overwrite unrelated tenants. All early fixtures are synthetic.
