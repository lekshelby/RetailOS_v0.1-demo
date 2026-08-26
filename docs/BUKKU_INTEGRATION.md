# Bukku integration boundary

Bukku product catalogue reads use the configured environment's company subdomain. The connector is currently read-only.

Confirmed by the Bukku development team:

- `GET /products` is a paged screen endpoint only. It must not be used for the catalogue mirror.
- The catalogue master read is `POST /v2/lists` with `product_list`. It returns the complete catalogue, including SKU, barcode, classification code, stock quantity, archived status, sale/buy flags, and UOM conversion data.
- RetailOS stores Bukku's catalogue `version`. A future poll with that value can return `not_changed` without transferring the catalogue again.
- Multiple UOM is available only through Update Product.
- Bukku's catalogue response includes existing barcode values, which RetailOS imports for lookup. RetailOS does not assume a Bukku barcode write endpoint exists, so adding or editing a barcode remains a controlled RetailOS operation until Bukku confirms that API.
- Location stock uses Lists API `stock_balances`.
- Sale and purchase prices use Lists API `product_detail_list`, limited to 50 eligible product IDs per query. RetailOS filters sale and purchase batches independently, sends them sequentially, and isolates a failed record instead of discarding an entire batch.
- RetailOS uses each UOM's `unit_price`; it does not rely on the contact-specific `prices[]` array.
- Bundles are deliberately skipped and logged until their `children` structure is modelled as a RetailOS kit.
- Customers use Contacts API or Lists API.
- Cash invoices use Sales Invoice with `payment_mode` set to `cash`.
- Bukku can record sales/purchase payments but is not the RetailOS payment gateway.
- Sales returns use Sales Credit Note.
- MyInvois fields include `customs_form_no`, `customs_k2_form_no`, `incoterms`, and `myinvois_action` when applicable.

The connector has been exercised for authenticated reads. It uses `POST /v2/lists` for the product catalogue and prices, and `GET /contacts` for the currently confirmed contact read. Access tokens and company subdomains remain server-side environment variables.

For diagnostic or read-only inspection commands, set `BUKKU_AUTO_SYNC_ENABLED=false`. This prevents application startup from scheduling any RetailOS catalogue imports while the diagnostic command runs.

RetailOS intentionally refuses to create Bukku invoices or credit notes until the staging mapping contains the required Bukku contact, account, location, tax-code, product-unit, and status IDs. These accounting mappings must be selected from the staging company rather than invented by the POS.

Walk-in receipts remain individual in RetailOS. Their accounting export can be consolidated into one daily Bukku cash invoice. Intraday available stock is therefore the latest Bukku balance adjusted by local, not-yet-consolidated RetailOS activity.
