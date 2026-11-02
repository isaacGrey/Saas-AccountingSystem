# Philippine compliance research register

**All statutory verification is pending.** No rules below are claimed current or approved. The local example uses an explicitly unverified 12% VAT fixture and explicit withholding amounts. No tax rate or withholding applicability is inferred from a party name. No BIR-compliant issuance, filing, accreditation or acceptance is implemented.

The supplied AccountingSuite manual is unavailable on this cloud Linux machine. Its page references are user-supplied only. The current environment permits package/repository hosts; official Philippine government domains are not in the enforced allowlist. Official source documents were not fetched or authenticated in this milestone. No circular numbers or effective dates are invented.

| Topic | Official source to obtain | Required evidence / decision | Implementation |
|---|---|---|---|
| VAT/non-VAT/exempt/zero-rated, rates, discounts, tax bases, registration thresholds | BIR (https://www.bir.gov.ph/) laws, revenue regulations and circulars | Effective dates, taxpayer profile, worked examples, applicability signoff | Unverified demo VAT/no-VAT only |
| EOPT invoicing and payment/receipt distinctions | BIR official EOPT implementation issuances | Mandatory fields, taxpayer/branch series, invoice correction, transition rules | DEV source records only; not legally issued invoices |
| Expanded withholding, ATCs and 2307 | BIR official regulations/forms | Payor/payee applicability, tax base, rates, certificates and reconciliation | Explicit settlement allocation only; no rate calculation or certificate issuance |
| 2307, 2316, 1601-C, 0619-E, 1601-EQ, 1604-C/E, 2550Q, 2551Q, applicable 1701/1702 | Current BIR forms and instructions | Applicability, revisions, field mappings, reconciliation, accepted file schemas, approvals | Pending |
| QAP, SAWT, SLSP, alphalists | BIR official utilities/specifications | Versioned export schemas, official validators and acceptance evidence | Pending |
| CAS/CBA books and registration | BIR official registration requirements | System description, books/export layouts, retention, authorization and branch scope | Architecture/audit foundations only; no registration claim |
| E-invoicing, EIS, PTI, electronic sales reporting, ESP | Current BIR issuances and official provider lists | Separate taxpayer permissions/system certifications/provider accreditation, timelines and real integration contract | Pending; no fabricated adapters or API |
| Payroll income tax and benefits | BIR withholding tables and benefit regulations | Effective brackets, annualization, de minimis, prior employment, 2316 | Specification only |
| SSS/EC/provident fund | SSS (https://www.sss.gov.ph/) official contribution schedules | Salary base, brackets, ceilings, shares, effective dates | Pending |
| PhilHealth | PhilHealth (https://www.philhealth.gov.ph/) official circulars | Separate contribution base, floor/ceiling, shares and rounding | Pending |
| Pag-IBIG | Pag-IBIG (https://www.pagibigfund.gov.ph/) official circulars | Base, caps, mandatory/voluntary shares | Pending |
| Labour/holiday/overtime/minimum wage/final pay | DOLE (https://www.dole.gov.ph/), NWPC (https://nwpc.dole.gov.ph/) and relevant regional boards | Coverage exceptions, region/date/worker class, combined premiums, statutory benefit rules | Pending |
| Data privacy and breach reporting | NPC (https://privacy.gov.ph/) official rules | Controller/processor duties, residency/subprocessors, applicability-specific notices, retention and breach triggers | Local access controls only |
| PFRS / PFRS for SMEs / PFRS for Small Entities | Authorized standard setter materials, SEC and accountant review | Entity applicability, supported recognition/measurement/disclosure policies | Basic double-entry ledger, no blanket PFRS claim |

For every verified rule record: issuer, title/identifier, authentic source URL, publication and effective dates, retrieved date, applicability, supersession, exact excerpts/pages, reviewer, independent fixture inputs/outputs and implementation version. Keep rejected interpretations and unresolved questions. Production tax/profile activation must be separate from demonstration configuration. Withholding never automatically reduces sales or VAT in this milestone.
