# Company access milestone

Owners can create a separate legal company under the same tenant from Settings. A fresh main branch, calendar fiscal year, account chart and unverified sample tax rules are initialized. Transactions, balances and other users' memberships are not copied. Creation requires a scoped idempotency key. Owners of one company gain no automatic membership in other companies in the tenant.

The header selector explicitly chooses authorized company context and remembers that choice per user on the device. The server checks membership on every request; the saved browser value is never an authorization grant. During switching, old financial content is cleared and the selector is disabled until loading completes. A saved company that is no longer authorized falls back to an authorized company on reload.

Settings lets owners list members and grant/change/revoke access by registered email. Roles: owner (company administration and financial writes), accountant (financial writes), auditor (read and export). Changes are company-specific and audited. No email is sent; the person must register first. Invitation acceptance, MFA, recovery and granular workflow permissions remain pending. New users currently receive their own development company during signup.

Runtime credentials cannot directly alter memberships. Narrow SECURITY DEFINER functions use a fixed search path, revoked PUBLIC execution, authenticated actor context, a company row lock, and owner rechecks. Self-role changes are rejected, preventing accidental last-owner removal. Another owner can change an owner's role or revoke access. Revocation affects subsequent requests; already-authorized in-flight work is not cancelled. Records and actor identities remain intact.

Update Windows without deleting data: stop the app with Ctrl+C; git pull --ff-only origin codex/accounting-foundation; npm.cmd ci; npm.cmd run services; npm.cmd run db:migrate; npm.cmd run dev. Migration 003 is additive; do not recreate .env or remove Docker volumes.

Review: create a second company in Settings; switch back and verify original documents; reload to check company selection; have another registered development user granted auditor access, then accountant access, then revoked. The other user's independent company remains accessible throughout.
