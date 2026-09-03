-- Remove management capabilities that were accidentally seeded onto cashier
-- roles. Operational checkout, returns and cash-movement permissions are
-- intentionally preserved. This migration changes no sale, stock, accounting,
-- receipt, print-job or printer-profile data.
UPDATE "Role" AS role
SET "permissions" = COALESCE((
  SELECT jsonb_agg(permission ORDER BY permission)
  FROM (
    SELECT DISTINCT value AS permission
    FROM jsonb_array_elements_text(role."permissions") AS existing(value)
    WHERE value NOT IN (
      'backoffice.view', 'catalog.manage', 'company.manage', 'contact.manage',
      'printer.manage', 'sale.void', 'shift.report.view', 'stock.adjust'
    )
  ) AS retained
), '[]'::jsonb)
WHERE lower(role."name") = 'cashier';

-- Existing manager roles receive the complete management capability set.
UPDATE "Role" AS role
SET "permissions" = (
  SELECT jsonb_agg(permission ORDER BY permission)
  FROM (
    SELECT DISTINCT value AS permission
    FROM jsonb_array_elements_text(
      role."permissions" ||
      '["backoffice.view","catalog.manage","company.manage","contact.manage","printer.manage","sale.void","shift.report.view","stock.adjust"]'::jsonb
    ) AS combined(value)
  ) AS complete
)
WHERE lower(role."name") = 'manager';
