# Structured hardware search release verification

Date: 2026-09-02

## Printer protection baseline (before deployment)

- Profile: Main receipt printer
- Transport: LAN_ESC_POS
- LAN endpoint: 192.168.0.200:9100
- Windows queue retained: CP-Q6 Plus
- Serial port: not configured; baud rate 9600
- Paper: 80 mm
- Template/divider/CJK: STANDARD / DASHED / AUTO
- Logo/SKU: logo enabled; SKU disabled
- Footer and fallback printer: not configured
- Pending print jobs (`QUEUED`, `SENDING`, `RETRYING`): 0
- Non-printing TCP connection probe: unreachable before deployment
- Mocked print-transport integration: passed; one job payload, no hardware connection
- Physical test print: not sent

The migration `20260902050000_structured_hardware_search` changes only the
`Product` table and adds search indexes. It does not reference `Company`,
`PrintJob`, receipt settings, printer settings, or audit history.

## Search verification before deployment

- Prisma migration rehearsal: all 23 migrations passed in a disposable database
- TypeScript: passed with `--noEmit --incremental false`
- Production build: passed
- Jest: 20 suites and 104 tests passed

## After deployment

Pending the required Administrator PowerShell deployment. Record the printer
profile comparison and second non-printing connection probe here immediately
after deployment. If the profile values change or the mocked print integration
regresses, do not approve this release.
