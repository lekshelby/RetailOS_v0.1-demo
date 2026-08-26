# RetailOS deployment, backup, and recovery

## Before production

1. Put a HTTPS reverse proxy in front of RetailOS and expose only that proxy publicly.
2. Set a strong, non-default PostgreSQL password and store it outside Git. Update `DATABASE_URL` in the production environment to match it; URL-encode any reserved characters in the password.
3. Set `NODE_ENV=production`, `PUBLIC_APP_URL` to the public HTTPS URL, `CORS_ORIGIN` to the permitted HTTPS POS origin, and the Bukku credentials only in the deployment secret store. Set `AUTH_SESSION_SECRET` to a random 32-byte secret and keep it in the secret store. RetailOS will refuse to start in production without `CORS_ORIGIN` or `AUTH_SESSION_SECRET`.
4. Run `docker compose up --build -d`, then check `https://your-retailos-host/api/health`.
5. Run the acceptance flows in `DEMO_CHECKLIST.md` on the actual register and printer before opening the system to staff.

The committed `.env.example` is safe to copy as a starting point. The real `.env` must never be committed or copied into a support ticket.

## Backup procedure

Back up PostgreSQL before each release and once daily while the store is operating. Keep at least 30 daily copies in storage separate from the POS machine. Periodically test a restore; a backup that has not been restored is unverified.

From the directory containing `docker-compose.yml`, create a dated SQL backup:

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
docker compose exec -T postgres pg_dump --no-owner --no-privileges -U retailos retailos | Set-Content -NoNewline -Encoding utf8 "backups\retailos-$stamp.sql"
```

Copy the resulting file to encrypted off-machine storage. Do not put `backups/` into Git.

## Restore drill

Restoring replaces the selected database. Do this first in an isolated test environment and never against a live store while sales are being processed.

```powershell
$backup = Resolve-Path '.\backups\retailos-YYYYMMDD-HHMMSS.sql'
Get-Content -Raw $backup | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U retailos -d retailos
```

For a full production recovery, stop cashier access, preserve a final backup of the failed state, restore to a clean database, start the API, and reconcile the last receipts, payments, shift totals, and Bukku sync jobs before resuming sales.

## Release checklist

1. Ensure CI is green: API tests and build must pass.
2. Take and verify a database backup.
3. Review pending Bukku sync jobs and ensure failed jobs have an owner.
4. Deploy with `docker compose up --build -d`.
5. Check the health endpoint, sign in with a non-demo account, complete a controlled test sale, print a receipt, then void or return it.
6. Record the deployed Git commit, deployment time, operator, and rollback decision in the change log.
