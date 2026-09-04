-- The shop requires cashier product creation and editing to match manager
-- product management. This grants only the product-catalogue capability;
-- Back Office, printer, Bukku, FIFO, stock adjustment, staff, and company
-- capabilities remain unchanged.
UPDATE "Role" AS role
SET "permissions" = (
  SELECT jsonb_agg(permission ORDER BY permission)
  FROM (
    SELECT DISTINCT value AS permission
    FROM jsonb_array_elements_text(role."permissions" || '["catalog.manage"]'::jsonb) AS combined(value)
  ) AS allowed
)
WHERE lower(role."name") = 'cashier';
