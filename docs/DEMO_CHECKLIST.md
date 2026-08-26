# RetailOS final demo checklist

Run this after each Docker rebuild. The demo is complete when every checked flow behaves as stated.

## Start

- Open RetailOS and sign in with company code `TH-DEMO` and cashier PIN `1234`.
- Confirm the header says `Shift: open since` followed by a time.
- Confirm **Cash** is the selected payment method.

## Selling items

- Search `hammer`, `screw`, and `PVC` without pressing Find.
- Add the PVC pipe and change the cart unit between Length, Foot, Meter, and Inch.
- Apply a line or sale discount with a reason and manager PIN `2468`.
- Complete one cash sale through the on-screen cash-received panel and confirm RetailOS opens the printable receipt automatically.

## Payments

- Select **DuitNow**: the QR and a single **Payment received — complete sale** button appear immediately; no second checkout button is visible.
- Select **Bank transfer**: the Public Bank account details and a single **Transfer received — complete sale** button appear immediately.
- Select **Split payment**: enter cash, DuitNow, and/or bank amounts. Confirm completion is blocked until their exact total equals the sale amount.

## Receipts and returns

- Open **Receipts**, type part of a receipt number or date, select **View** on a past receipt, then select **Return / exchange**.
- Test **Refund and return**; stock should be restored.
- Test **Dispose (bad condition)**; stock should not be restored.
- Test **Exchange for other item(s)**; select replacement items inside the exchange popup and confirm that the credit is automatically used, with any difference collected or refunded.

## Products, contacts, and company

- Open **Products** and confirm the fixed `+` button opens the separate product form. Try a duplicate SKU or barcode and confirm an error is shown.
- Confirm LHDN classification defaults to `022 — Others` and can be changed from the official list.
- Open **Contacts** and create a customer using entity type, legal name, a contact type, and optional MyInvois details. Leave contact code blank once to confirm automatic generation.
- Sign in as manager with PIN `2468`; open **Settings → Company details**, save TIN/new BRN/old BRN, and confirm the receipt displays `BRN: new (old)` with TIN on the next line.
- Open **Settings → Printer settings**, choose the required paper width, add a footer, and use Print on a receipt.
- Close the shift using manager PIN `2468`, then print the automatically opened shift report.

## Phone check

- Open the same RetailOS address on a phone.
- Confirm the bottom navigation remains reachable when scrolling.
- Confirm product search, cart quantity buttons, payment panels, receipt history, and the `+` buttons remain usable.
- Camera barcode scanning requires HTTPS on a LAN address; typed barcode/SKU search is always available.

## Bukku handoff

- Do not run a bulk catalogue import until Bukku returns the full product catalogue rather than one item.
- Keep Bukku as the product master. RetailOS local products and contacts remain clearly marked local-only until Bukku confirms safe create/update payload mappings.
- A genuine MyInvois QR can be added only after Bukku/MyInvois supplies an accepted-document UUID or validation URL. Do not use a locally generated QR as an e-Invoice QR.
