# RetailOS PC operations

The PC is the RetailOS controller and print hub. Cashier phones use the RetailOS web page on the same Wi-Fi; they do not pair with, or install a driver for, the receipt printer.

## Normal daily use

- Start Windows and sign in as `Lek`.
- Wait for Docker Desktop to become ready. `RetailOS-Start-At-Logon` then starts PostgreSQL and RetailOS automatically.
- On the PC, open `http://localhost:31081`.
- On a phone connected to the same Wi-Fi, open `http://192.168.0.150:31081`.
- At shift close, RetailOS syncs queued offline sales, checks Bukku, closes the shift, and prints the shift report. Closed reports remain under **Shift reports** for viewing and reprinting.

## Printer configuration

Only a manager with printer permission changes this in **Settings → Printer settings**.

- LAN thermal printer: set the printer IP and raw TCP port. The current CP-Q6 Plus setup is `192.168.0.21` on port `9100`.
- Windows queue: enter the exact Windows printer queue name.
- Serial: enter the paired COM port and baud rate.

Use **Test PC printer** after any change. The printer itself should retain a DHCP reservation for MAC `00:FB:D3:31:BE:37` so its IP remains stable.

## Manual recovery start

Use this only if the automatic logon task did not start RetailOS. Open PowerShell at:

`C:\Users\Lek\Documents\Codex\2026-08-26\loo\work\RetailOSSource\RetailOS-main`

```powershell
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml up -d postgres
& "$env:APPDATA\npm\pnpm.cmd" start:dev
```

Keep that PowerShell window open while using RetailOS.

## Backups

`RetailOS-Daily-Backup` creates a verified SQL backup at 9:00 PM while `Lek` is signed in. Files are stored in:

`C:\Users\Lek\Documents\RetailOS Backups`

To create and verify an additional backup manually, run from the project folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\backup-retailos.ps1"
```

The script writes to a temporary file, checks that it contains a PostgreSQL dump header, then renames it to the final `.sql` backup file. It does not interrupt RetailOS.

## Check task status

Open an Administrator PowerShell and run:

```powershell
Get-ScheduledTask -TaskName 'RetailOS-Daily-Backup','RetailOS-Start-At-Logon' |
  Select-Object TaskName, State
@('RetailOS-Daily-Backup','RetailOS-Start-At-Logon') |
  ForEach-Object { Get-ScheduledTaskInfo -TaskName $_ } |
  Select-Object TaskName, LastRunTime, LastTaskResult, NextRunTime
```
