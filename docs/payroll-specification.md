# Payroll specification — not implemented

Keep employee and payroll data separate from general-party records. Authorized payroll roles only; self-service can read only the subject employee's approved documents. Company/branch/period context and employee eligibility must be explicit.

Model employee, employment history, compensation version, work schedule, attendance segment, leave, earning/deduction definition, statutory rule version, pay run, employee calculation snapshot, contribution reconciliation, payslip, remittance batch and adjustment linkage. Do not hide payroll journals in JSON. Snapshot rule versions, bases, hours, rates and intermediate rounding.

Run flow: draft -> validated calculation -> exceptions resolved -> independent approval -> immutable finalized run -> balanced posting -> payment/remittance evidence. Corrections use linked adjustment runs. Duplicate payroll periods and retries cannot duplicate employee liabilities or contributions. Closed-period corrections need approved later-period treatment.

Fixtures required before implementation: each SSS salary-credit boundary; EC and provident-fund differences; PhilHealth/Pag-IBIG floor/ceiling and legal salary-base differences; semi-monthly plus off-cycle reconciliation; eligible/exempt employees; overtime/night/rest-day/holiday combinations; overnight boundary and break handling; phased regional minimum wages; hires/terminations; thirteenth-month accrual; benefit tax thresholds; prior-employer YTD; annualized withholding; retroactive adjustments; final pay and statutory coverage exceptions. Obtain independent official/legal expected values; none are asserted here.

Bank files, government forms, employee communications and actual salary payments remain unavailable until verified integration, permissions and separate live-use instruction exist.
