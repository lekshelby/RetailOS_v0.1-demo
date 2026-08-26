# RetailOS API

Base URL: `http://localhost:3000/api`

## Health

`GET /health`

## Cashier PIN login

`POST /auth/pin`

```json
{ "companyId": "<company-id>", "pin": "1234" }
```

The response supplies the user's role and permissions. Authentication sessions/tokens are deferred until the deployment model is chosen.

## Product lookup

`GET /products/lookup?companyId=<id>&query=hammer&priceLevelId=<id>&locationId=<id>`

`query` accepts typed product names, exact SKUs, or exact barcode text. Phone-camera scanning later uses this same endpoint after the phone decodes a barcode.

## Product catalogue

`GET /products/catalog?companyId=<company-id>&priceLevelId=<price-level-id>&locationId=<location-id>`

Returns up to 200 active items for the POS item-list view, including selling price, source (Bukku or local), and local stock status.

## POS bootstrap

`GET /pos/bootstrap?companyCode=TH-DEMO`

Returns the available stores, registers, and price lists for the local POS screen. The current pricing policy is tax-free: tax is not included or added to the checkout total. Cashiers cannot alter product prices; every discount requires an authorized manager PIN and a reason.

## Checkout

`POST /sales/checkout`

```json
{
  "companyId": "<company-id>",
  "locationId": "<location-id>",
  "registerId": "<register-id>",
  "cashierId": "<cashier-id>",
  "priceLevelId": "<price-level-id>",
  "shiftId": "<optional-open-shift-id>",
  "offlineId": "phone-a-20260819-0001",
  "deviceId": "cashier-phone-a",
  "items": [
    { "productId": "<product-id>", "uomId": "<uom-id>", "quantity": 2 },
    {
      "productId": "<product-id>", "uomId": "<uom-id>", "quantity": 1,
      "discount": { "type": "PERCENTAGE", "value": 10, "reason": "Damaged packaging", "approvedById": "<manager-id>" }
    }
  ],
  "saleDiscount": { "type": "FIXED", "value": 5, "reason": "Trade customer", "approvedById": "<manager-id>" },
  "payments": [
    { "method": "CARD", "amount": 20, "reference": "terminal-ref" },
    { "method": "CASH", "amount": 40 }
  ]
}
```

The server controls prices, calculates totals in cents, validates approval permissions, converts UOM quantities into base stock, deducts stock, records payment/change, creates the receipt, audit log, and outbound sync event in one serializable database transaction.

Retrying the same `companyId` and `offlineId` returns the original sale instead of creating a duplicate.

## Receipt

`GET /sales/<sale-id>/receipt`

`GET /sales/history?companyId=<company-id>&locationId=<optional-location-id>` returns the 100 most recent completed receipts for the selected store.

## Stock adjustment

`POST /products/<product-id>/stock-adjustment` is manager-only and sets the counted base quantity at a store. A reason is required and the prior/new quantities are saved to the audit log.

```json
{
  "companyId": "<company-id>",
  "locationId": "<location-id>",
  "actorId": "<manager-id>",
  "countedQuantity": 211,
  "reason": "Monthly physical stock count"
}
```

## Register shifts

- `POST /shifts/open` opens a register with a cashier and opening float.
- `GET /shifts/current?registerId=<id>&companyId=<id>` shows the live cash summary.
- `POST /shifts/<id>/movements` records a reasoned `CASH_IN` or `CASH_OUT`.
- `POST /shifts/<id>/close` records the counted cash and returns the expected cash and variance.

Cash reconciliation uses: opening float + net cash sales − cash refunds + cash in − cash out. Every action is recorded in the audit log. Expected cash and variance are manager-only.

## Returns, disposal, and exchanges

`POST /returns` accepts one or more original receipt line IDs and one of three outcomes:

- `REFUND`: restores stock and records the chosen refund method.
- `DISPOSE`: records the bad-condition return without restoring stock. A refund method can optionally still be recorded.
- `EXCHANGE`: restores stock and creates store credit at the original receipt value. The credit can be applied to a replacement checkout as a `STORE_CREDIT` payment with its `storeCreditId`.

Returned value always uses the original receipt line total. Replacement items use their current RetailOS selling price.
