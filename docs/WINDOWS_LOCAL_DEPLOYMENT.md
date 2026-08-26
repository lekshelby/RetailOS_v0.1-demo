# Local-only deployment on a dedicated Windows PC

This profile is for one Windows POS PC only. RetailOS and PostgreSQL bind to `127.0.0.1`, so no other device on the LAN can reach them. It does not need a domain, HTTPS certificate, or inbound router rule.

## Prepare the PC

1. Install Docker Desktop and ensure it is running in Linux-container mode.
2. Install Git for Windows.
3. Clone the private repository into a non-synchronised folder, for example `C:\RetailOS`.
4. In that folder, copy `.env.local.example` to `.env.local`.
5. Set a strong `POSTGRES_PASSWORD` and the same URL-encoded value in `DATABASE_URL`.
6. Generate `AUTH_SESSION_SECRET` in PowerShell and paste it into `.env.local`:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

Keep `.env.local` on the POS PC only. Never commit, email, or upload it.

## Start and verify

Run PowerShell in the repository folder:

```powershell
$env:RETAILOS_ENV_FILE = '.env.local'
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
Invoke-WebRequest http://localhost:31080/api/health | Select-Object -ExpandProperty Content
```

Open `http://localhost:31080` in the browser on that PC. Sign in with the demo account only for initial acceptance testing, then create real staff users and remove/replace demo credentials before operational use.

## Daily operation

- Start Docker Desktop before opening RetailOS.
- Use `http://localhost:31080` only from the POS PC. This deliberately avoids the common local development and printer-service ports such as 3000 and 3001.
- Back up the database daily using `OPERATIONS.md`; copy backups to encrypted removable or off-machine storage.
- Leave `BUKKU_AUTO_SYNC_ENABLED=false` until a manager approves live Bukku mapping and sync testing.

## Stop and update

To stop RetailOS without deleting its database:

```powershell
$env:RETAILOS_ENV_FILE = '.env.local'
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

For an update, take a backup first, run `git pull`, then start with the same `up --build -d` command. Do not run `docker compose down --volumes`; that deletes the local database volume.

## Later LAN or phone access

Do not change the local-only profile casually. LAN access requires a separate risk review: a fixed private IP, Windows Firewall allow-list, HTTPS for camera scanning, a LAN-aware `CORS_ORIGIN`, and a device/session policy.
