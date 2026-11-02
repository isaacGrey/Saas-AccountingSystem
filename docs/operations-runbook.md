# Local operations and future deployment/recovery

No deployment authorized. Run npm run setup, npm ci, npm run services, npm run db:migrate, then npm run dev. API binds loopback 4000; Next proxies /api from port 3000. Database/Redis ports bind loopback only. Configure APP_ORIGIN exactly for the actual local browser origin. Do not set NODE_ENV=production on plain HTTP; production cookies require HTTPS. The local environment has no MFA or hardened production hosting.

Generated secrets live in ignored .env (0600). Runtime DATABASE_URL uses tala_app; MIGRATION_DATABASE_URL is a separate elevated connection used only by migration tools. Do not run the API with the migration URL. Keep secrets out of logs and version control. npm uses a workspace-local cache to avoid managed-home permissions. Do not disable TLS verification. Cloud Docker builds that download packages must follow the platform's proxy CA guidance; no application Docker build is included yet.

Migrations are ordered, transactional, checksummed and serialized by advisory lock. Never edit an applied migration; add a forward migration. Rollback app releases only when compatible with the resulting schema. Preserve volumes during normal stop: docker compose stop. docker compose down -v is destructive and not part of ordinary setup or testing.

Local backup example: docker compose exec -T postgres pg_dump -U postgres -Fc tala > /secure/location/tala.dump. Restrict the file permissions and store it outside source control. Restore only into an isolated empty database after confirming the target; do not restore over active books. Validate roles, migrations, RLS, counts, TB and subsidiary reconciliations after restoration. Restore drill, encrypted offsite backups, PITR, tenant-specific recovery and attachment backup are not yet implemented or tested. RPO/RTO targets require business approval; no recovery guarantees are made.

Operational backlog: redacted structured logs, request IDs, metrics/error alerting, worker retries/dead letters, outbox processing, attachment malware scanning, secret rotation, account recovery/MFA, encrypted hosting/backup policy, dependency review, staging/prod separation and release approval evidence. Audit append-only behavior protects against the runtime role, not a privileged database administrator; tamper-evident offsite archival is pending.

Health: GET /api/health checks PostgreSQL. Redis is available but currently unused. Financial state resides in PostgreSQL. Outbox rows persist without delivering any external message.
