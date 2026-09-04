# RetailOS Staff Operating Guide

## Cashier

1. Sign in with your own PIN, choose the correct location/register, and open a shift before checkout.
2. Search by barcode, SKU, product name, or approved shorthand such as `1/2 ss n`, `10 ms b`, `p-slip`, or `p sleeve`.
3. Check item, quantity, unit price, discount, payment method, and change before completing the sale.
4. A stock-shortage warning does not reduce the entered quantity. Complete only a genuine physical sale; RetailOS records the shortage for manager follow-up.
5. Use the receipt's Return flow for returns. Never edit an old receipt.
6. Reprint from Receipt History. A reprint creates a print audit entry, not another sale.
7. Count cash and request manager approval when closing a shift. Shortages require the manager acknowledgement shown on the close screen.

## Manager

- Product Management: edit verified product details; deactivate when a product should no longer be sold. Archive/delete only after reviewing the impact summary.
- Batch Update: download the controlled CSV, validate the complete file, review every proposed change, and commit only when every row is valid.
- Purchase receipts: confirm SKU, supplier, Bukku bill number, bill date, location, quantity, actual unit cost, and landed cost. Posting—not catalogue sync—creates FIFO stock.
- FIFO review: investigate negative/unvalued batches and use approved correction workflows with reasons. Never rewrite old FIFO allocations.
- Shift close: review sales, cash, returns, and shortages. Acknowledge shortages only after confirming the follow-up responsibility.
- Review the daily sales, COGS, shortage, and Bukku reconciliation reports before accounting export.

## Accounting

1. Enter the actual purchase cost on each supplier bill in Bukku.
2. Create/import the corresponding RetailOS Purchase Receipt draft using the Bukku bill reference and RetailOS SKU.
3. A manager reviews and posts the draft. Only then do RetailOS inventory and FIFO batches change.
4. One RetailOS SKU maps to one Bukku accounting item. Never create a Bukku item for each FIFO batch, and never approve a mapping based on product name alone.

## Escalation and corrections

Do not edit historical supplier bills, receipts, FIFO batches, audit records, or closed shifts. Stop and notify a manager. Use the documented return, credit-note, void, stock-adjustment, purchase-receipt correction, or opening-float correction workflow so the reason and approver remain auditable.
