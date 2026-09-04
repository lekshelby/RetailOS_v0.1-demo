-- Operational staff may open shifts and run the safe catalogue/contact sync.
-- Only managers may close shifts. This changes permissions only; it does not
-- touch sales, stock, Bukku mappings, printer profiles, or print jobs.
UPDATE "Role" AS role
SET "permissions" = (
  SELECT jsonb_agg(permission ORDER BY permission)
  FROM (
    SELECT DISTINCT value AS permission
    FROM jsonb_array_elements_text(role."permissions" || '["shift.open","sync.run"]'::jsonb) AS combined(value)
    WHERE value <> 'shift.close'
  ) AS allowed
)
WHERE lower(role."name") = 'cashier';

UPDATE "Role" AS role
SET "permissions" = (
  SELECT jsonb_agg(permission ORDER BY permission)
  FROM (
    SELECT DISTINCT value AS permission
    FROM jsonb_array_elements_text(role."permissions" || '["shift.open","shift.close","sync.run"]'::jsonb) AS combined(value)
  ) AS allowed
)
WHERE lower(role."name") = 'manager';
