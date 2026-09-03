-- Search-only repair. This migration deliberately does not reference printer,
-- receipt, print-job, inventory, sales, shift, or accounting tables.

-- Rebuild the managed facets with boundary-safe definitions. A one-letter
-- catalogue token such as CLASS B is not a BEND; n/b are query shorthand only.
UPDATE "Product"
SET
  "searchMaterials" = ARRAY_REMOVE(ARRAY[
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^[:alnum:]])(ss|s[[:space:]]*\.[[:space:]]*s|s[[:space:]]*/[[:space:]]*steel|stainless[[:space:]]+steel)([^[:alnum:]]|$)' THEN 'STAINLESS_STEEL' END,
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^[:alnum:]])(ms|m[[:space:]]*\.[[:space:]]*s|m[[:space:]]*/[[:space:]]*s|m[[:space:]]+steel|mild[[:space:]]+steel)([^[:alnum:]]|$)' THEN 'MILD_STEEL' END
  ], NULL),
  "searchProductTypes" = ARRAY_REMOVE(ARRAY[
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^[:alnum:]])nipple([^[:alnum:]]|$)' THEN 'NIPPLE' END,
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^[:alnum:]])bend([^[:alnum:]]|$)' THEN 'BEND' END,
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^[:alnum:]])(reducing[[:space:]]+bush|r[[:space:]]*/?[[:space:]]*bush|rbush|valve[[:space:]]+socket)([^[:alnum:]]|$)' THEN 'REDUCING_BUSH' END,
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^[:alnum:]])(pipe[[:space:]]+slip|p[[:space:]]*[-/]?[[:space:]]*slip|pslip)([^[:alnum:]]|$)' THEN 'PIPE_SLIP' END
  ], NULL);

-- Remove the false half-inch facet nested inside mixed fractions, while
-- preserving a separate real 1/2-inch dimension elsewhere in the same name.
UPDATE "Product"
SET "searchDimensions" =
  array_remove(array_remove("searchDimensions", '1/2"'), '10"')
  || CASE WHEN regexp_replace(
       CONCAT_WS(' ', "name", "supplierDescription", "category"),
       '(^|[^0-9])([0-9]+)[[:space:]]+1[[:space:]]*/[[:space:]]*2',
       '\1 MIXED_FRACTION', 'gi'
     ) ~* '(^|[^0-9])1[[:space:]]*/[[:space:]]*2([[:space:]]*("|″|''{1,2}|inch(es)?))?([^0-9]|$)'
     THEN ARRAY['1/2"'] ELSE ARRAY[]::TEXT[] END
  || CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^0-9])10[[:space:]]*("|″|''{1,2}|inch(es)?)([^0-9]|$)'
     THEN ARRAY['10"'] ELSE ARRAY[]::TEXT[] END;

-- The previous substring-based generator attached short aliases such as ss/ms
-- to words like BRASS, CLASS and SYSTEMS. Generated aliases are derived data,
-- so rebuild only that source; MANUAL and IMPORT aliases remain untouched.
DELETE FROM "ProductAlias" WHERE "source" = 'GENERATED';

INSERT INTO "ProductAlias" (
  "id", "productId", "text", "normalizedToken", "normalizedCompact",
  "source", "createdAt", "updatedAt"
)
SELECT
  'gen_' || md5(p."id" || ':' || a.normalized_token), p."id",
  a.alias_text, a.normalized_token, a.normalized_compact,
  'GENERATED'::"ProductAliasSource", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" p
CROSS JOIN LATERAL (
  SELECT * FROM (VALUES
    ('STAINLESS_STEEL', 'ss',              'ss',              'ss'),
    ('STAINLESS_STEEL', 's.s',             's s',             'ss'),
    ('STAINLESS_STEEL', 's/steel',         's steel',         'ssteel'),
    ('STAINLESS_STEEL', 'stainless steel', 'stainless steel', 'stainlesssteel'),
    ('MILD_STEEL',      'ms',              'ms',              'ms'),
    ('MILD_STEEL',      'm/s',             'm s',             'ms'),
    ('MILD_STEEL',      'm steel',         'm steel',         'msteel'),
    ('MILD_STEEL',      'mild steel',      'mild steel',      'mildsteel'),
    ('REDUCING_BUSH',   'reducing',        'reducing',        'reducing'),
    ('REDUCING_BUSH',   'r/bush',          'r bush',          'rbush'),
    ('REDUCING_BUSH',   'rbush',           'rbush',           'rbush'),
    ('REDUCING_BUSH',   'valve socket',    'valve socket',    'valvesocket'),
    ('PIPE_SLIP',       'p-slip',           'p slip',          'pslip'),
    ('PIPE_SLIP',       'pslip',            'pslip',           'pslip'),
    ('PIPE_SLIP',       'pipe slip',        'pipe slip',       'pipeslip')
  ) AS aliases(facet, alias_text, normalized_token, normalized_compact)
) a
WHERE a.facet = ANY(p."searchMaterials") OR a.facet = ANY(p."searchProductTypes")
ON CONFLICT ("productId", "normalizedToken") DO NOTHING;
