-- Search-only catalogue vocabulary extension. In this catalogue P/SLEEVE and
-- PIPE SLEEVE are the products cashiers refer to as p-slip / pipe slip.
-- No printer, receipt, inventory, sale, shift, or accounting table is touched.
UPDATE "Product"
SET "searchProductTypes" = array_append("searchProductTypes", 'PIPE_SLIP')
WHERE NOT ('PIPE_SLIP' = ANY("searchProductTypes"))
  AND CONCAT_WS(' ', "name", "supplierDescription", "category") ~*
      '(^|[^[:alnum:]])(pipe[[:space:]]+(slip|sleeve)|p[[:space:]]*[-/]?[[:space:]]*(slip|sleeve)|p(slip|sleeve))([^[:alnum:]]|$)';

INSERT INTO "ProductAlias" (
  "id", "productId", "text", "normalizedToken", "normalizedCompact",
  "source", "createdAt", "updatedAt"
)
SELECT
  'gen_' || md5(p."id" || ':' || a.normalized_token), p."id",
  a.alias_text, a.normalized_token, a.normalized_compact,
  'GENERATED'::"ProductAliasSource", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" p
CROSS JOIN (VALUES
  ('p sleeve',   'p sleeve',   'psleeve'),
  ('p/sleeve',   'p sleeve',   'psleeve'),
  ('psleeve',    'psleeve',    'psleeve'),
  ('pipe sleeve','pipe sleeve','pipesleeve'),
  ('p-slip',    'p slip',    'pslip'),
  ('pslip',     'pslip',     'pslip'),
  ('pipe slip', 'pipe slip', 'pipeslip')
) AS a(alias_text, normalized_token, normalized_compact)
WHERE 'PIPE_SLIP' = ANY(p."searchProductTypes")
ON CONFLICT ("productId", "normalizedToken") DO NOTHING;
