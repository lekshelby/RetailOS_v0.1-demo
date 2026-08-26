# RetailOS go-live gates

RetailOS must not be publicly exposed until every required gate below is complete. Work through them in order; each item identifies the information or confirmation needed to continue.

## 1. Production access and secrets — required

Provide:

- The public HTTPS hostname, for example `https://pos.example.com`.
- The approved POS browser origin or origins. These become `CORS_ORIGIN`.
- A random 32-byte-or-longer `AUTH_SESSION_SECRET`, stored only in the deployment secret store.
- A strong PostgreSQL password and the approved maintenance window for changing it.

Do not send passwords or Bukku tokens in chat. Configure them directly in the production secret store or `.env` on the deployment machine. The existing local Docker data volume was initialized with the demo database password, so changing only environment variables is insufficient: the PostgreSQL role password must be changed during the maintenance window and then verified through an API restart.

## 2. HTTPS deployment and recovery drill — required

The deployment machine needs Docker Desktop/Engine and a HTTPS reverse proxy. The POS service should not be exposed directly on port 3000.

Before staff use the system:

1. Take a backup using `OPERATIONS.md`.
2. Restore that backup into an isolated test database.
3. Start the production stack with `NODE_ENV=production`.
4. Confirm `/api/health` returns successfully through HTTPS.
5. Sign in, complete a controlled sale, reprint it, and void or return it.

## 3. Source-control remote — required

Create an empty private GitHub repository and provide its HTTPS or SSH URL. RetailOS already has local branch `main` with baseline and security commits. Adding a remote and pushing it requires access to your GitHub account or a repository URL with configured credentials.

## 4. Bukku accounting mapping — required before outbound exports

Ask the Bukku administrator/accountant to provide the staging IDs and approved values for:

- Walk-in customer/contact
- Cash sales account
- Sales-return / credit-note account
- Store location
- Tax code
- Product and UOM IDs
- Sales invoice and credit-note statuses

Confirm whether walk-in sales should be exported as one consolidated daily cash invoice, as designed, and who approves the daily export. Do not approve an outbound invoice or credit-note test until these choices are supplied in writing.

Current read-only validation succeeded against Bukku: the master catalogue Lists API returned 15,923 products with a version value and recognised product/UOM fields. This validates catalogue access only; it does not validate accounting exports.

## 5. PC Print Hub — required for thermal receipt printing

Connect the actual ESC/POS printer (the Technova MP-80M is the known target) to the RetailOS controller PC or its local LAN. Configure the PC Print Hub as described in `PC_PRINT_HUB.md`; Android phones must not pair with the printer. Then test:

1. A PC-side test receipt for the selected LAN, Windows RAW, or serial transport.
2. Connection/reconnection after the printer or PC Bluetooth adapter is turned off and on.
3. 58 mm and 80 mm plain-text test receipts, followed by the optional raster logo.
4. A real RetailOS receipt with totals and footer from an Android phone.
5. Two simultaneous phone print requests and a failure/retry when the printer is out of paper or disconnected.

LAN ESC/POS is the required choice when the API runs in Docker on a Windows PC. USB Windows queues and Bluetooth serial require the API itself to run natively on that PC.
