# RetailOS

RetailOS is a Bukku-agnostic retail POS backend for a Malaysian hardware store. It keeps checkout operational when Bukku or the network is unavailable, then records idempotent sync jobs for later accounting integration.

## Current capabilities

- Cashier PIN verification and permission-based discount approval
- Manual SKU, product-name, or barcode-value lookup
- Multiple UOMs with base-unit stock conversion
- Price levels and server-authoritative pricing
- Line and whole-sale discounts with reason and approver audit
- Tax-free checkout totals (tax is currently not added or included)
- Cash, card, DuitNow, bank transfer, store credit, other, and mixed payments
- Cash tender/change calculation
- Exact-total split payments across cash, DuitNow QR, and bank transfer
- Static DuitNow QR and Public Bank transfer-payment screens with cashier verification
- Atomic receipt numbering and stock deduction
- Receipt history, receipt reprint, manager-only shift reports, and reasoned stock adjustments
- Company receipt profile with TIN and new/old BRN, separate 58/80 mm printer settings, plus cashier-accessible local product and Bukku-style contact tools
- Responsive desktop/phone layout, optional phone-camera barcode scanning, and saved-cart recovery after refresh
- Offline checkout replay protection through `offlineId`
- Receipt retrieval, sync jobs, external references, and audit logs
- Bukku staging reads for products and contacts, plus safe sync boundaries for accounting exports

Dedicated barcode hardware is not required. A cashier can type a SKU or product name, or use supported phone-camera barcode scanning. Phone browsers normally require HTTPS when RetailOS is opened through a LAN address.

## Docker setup

1. Copy `.env.example` to `.env`.
2. Ensure Docker Desktop reports that its engine is running.
3. Run `docker compose up --build`.
4. Check `http://localhost:3000/api/health`.

The API container applies committed database migrations before it starts, and the one-shot seed container loads the demo store after the API becomes healthy.

## Local development

```text
pnpm install
pnpm --filter @retailos/api db:generate
pnpm --filter @retailos/api build
pnpm --filter @retailos/api test
pnpm --filter @retailos/api start:dev
```

Start PostgreSQL separately and set `DATABASE_URL` before running migrations or seed data:

```text
pnpm --filter @retailos/api db:migrate
pnpm --filter @retailos/api db:seed
```

The demo creates cashier PIN `1234` and manager approval PIN `2468`. These credentials are development-only.

Manager-created products and contacts are clearly marked **Local only**. They are deliberately not pushed to Bukku until Bukku confirms the product/contact write payloads and mappings. Existing Bukku products will remain the master catalogue when the catalogue API issue is resolved.

See `docs/API.md` for endpoint examples and `docs/BUKKU_INTEGRATION.md` for confirmed integration boundaries.
See `docs/DEMO.md` for the complete walkthrough, `docs/DEMO_CHECKLIST.md` for final acceptance testing, and the live-Bukku handoff point.
See `docs/GO_LIVE_GATES.md` for the production deployment, Bukku, and printer gates that require external access or approval.
For a single dedicated Windows POS PC with no LAN or public access, see `docs/WINDOWS_LOCAL_DEPLOYMENT.md`.
For Android phones operating a printer connected to the PC, see `docs/PC_PRINT_HUB.md`. The PC API owns the physical printer; phones never need a printer app, USB permission, or Bluetooth pairing.
