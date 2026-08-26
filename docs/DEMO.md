# RetailOS demo walkthrough

Open `http://localhost:3000/` after Docker Compose has started.

## Cashier demo

Sign in as the demo cashier with company code `TH-DEMO` and PIN `1234`.

1. The seeded cashier shift is already open. The header shows the opening time; use **Close shift** only when you want to demonstrate cash counting.
2. Find an item by SKU, barcode number, item name, or the camera scanner on a supported phone.
3. Choose a selling UOM. The pipe demo shows `LEN`, `FT`, `METER`, and `INCH` while reducing stock from the base `LEN` stock.
4. Add a discount. RetailOS requires a manager approval PIN and a reason.
5. Complete a sale with cash, card, DuitNow QR, bank transfer, or an exact-total split payment. Cash now opens an in-app tendered-cash panel; card completes directly.
6. After completion, RetailOS opens the printable receipt automatically. Use **Print receipt** or close the receipt panel when done.
7. In **Receipts**, type any part of a receipt number or its date to filter immediately. Select **View**, then use **Return / exchange** from the printable receipt.
8. For an exchange, select replacement items directly in the return popup. A higher-priced replacement collects the difference during checkout; a lower-priced replacement can be kept as credit or refunded by the selected method.

For an exchange, RetailOS places the returned value on store credit and applies it to the selected replacement items. The replacement sale and requested exchange-difference refund are recorded together, so a failed refund cannot leave a half-completed exchange.

Cashiers cannot see expected cash or shift variance. Their saved cart is restored after an accidental browser refresh, while checkout always revalidates stock and prices with the server.

## Manager demo

Sign in with PIN `2468`.

- Open **Shift report** to view expected cash, payment totals, cash movements, returns, and variance.
- Managers can open **Settings** from the persistent navigation panel, then choose **Company details** or **Printer settings**. Company details holds legal name, TIN, BRN (new/old), address, office/phone/email details shown on receipts. Printer settings selects the controller PC's LAN, Windows RAW, or serial ESC/POS transport; it also has 58, 76, 80, 82, and 110 mm paper widths, footer, and a PC printer test. Phones submit print jobs to the PC and do not open a print dialog.
- Closing a shift requires a manager PIN and opens a printable shift report immediately after closing.
- **Products** and **Contacts** are also available from the persistent navigation panel for cashiers. **Company settings** stays manager-only.

Local products require a product name, SKU, selling unit, and sale price; barcode, LHDN classification code (default `022`), supplier description, purchase price, initial stock, and category can also be recorded. Contacts follow Bukku's entity type, legal name, contact-code, and contact-type structure. A Bukku-imported product or contact is not edited in RetailOS until Bukku's write mapping is confirmed.

## Desktop and phone views

The same address provides both views automatically.

- Desktop: two-column item search and cart workflow.
- Phone: single-column, touch-sized controls, sticky checkout action, responsive payment panels, and phone-camera scanner controls.

When opening the POS from a phone on the store network, use the PC's LAN address rather than `localhost`. Phone camera use requires a secure HTTPS address; manual typing remains available without HTTPS.

## Live Bukku handoff

RetailOS is ready to treat Bukku as the catalogue master, using Bukku's `POST /v2/lists` `product_list` cache endpoint. The current production response still reports only one accessible product while the Bukku UI shows thousands. Do not bulk-import or write accounting transactions until Bukku resolves that account-data discrepancy. The current Bukku connection is read-only.

## MyInvois QR code

RetailOS deliberately does not generate a fake MyInvois QR. A valid QR requires the UUID/validation URL returned after Bukku/MyInvois accepts the e-Invoice. The printable receipt shows a clear pending area until Bukku provides that accepted-document data and its API mapping is confirmed.
