-- Search-only additive fields. This migration does not read or update Company,
-- printer profiles, receipt settings, print jobs, or printer audit history.
ALTER TABLE "Product"
  ADD COLUMN "searchDimensions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "searchMaterials" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "searchProductTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "Product_searchDimensions_idx" ON "Product" USING GIN ("searchDimensions");
CREATE INDEX "Product_searchMaterials_idx" ON "Product" USING GIN ("searchMaterials");
CREATE INDEX "Product_searchProductTypes_idx" ON "Product" USING GIN ("searchProductTypes");

-- Backfill the initial managed hardware vocabulary without changing display data.
UPDATE "Product"
SET
  "searchDimensions" = ARRAY_REMOVE(ARRAY[
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^0-9])(1[[:space:]]*/[[:space:]]*2|½)([[:space:]]*("|″|''{1,2}|inch(es)?))?([^0-9]|$)' THEN '1/2"' END,
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^0-9])10[[:space:]]*("|″|''{1,2}|inch(es)?)([^0-9]|$)' THEN '10"' END
  ], NULL),
  "searchMaterials" = ARRAY_REMOVE(ARRAY[
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^[:alnum:]])(ss|s[[:space:]]*\.[[:space:]]*s|s[[:space:]]*/[[:space:]]*steel|stainless[[:space:]]+steel)([^[:alnum:]]|$)' THEN 'STAINLESS_STEEL' END,
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^[:alnum:]])(ms|m[[:space:]]*\.[[:space:]]*s|m[[:space:]]*/[[:space:]]*s|m[[:space:]]+steel|mild[[:space:]]+steel)([^[:alnum:]]|$)' THEN 'MILD_STEEL' END
  ], NULL),
  "searchProductTypes" = ARRAY_REMOVE(ARRAY[
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^[:alnum:]])(n|nipple)([^[:alnum:]]|$)' THEN 'NIPPLE' END,
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^[:alnum:]])(b|bend)([^[:alnum:]]|$)' THEN 'BEND' END,
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^[:alnum:]])(reducing([[:space:]]+bush)?|r[[:space:]]*/?[[:space:]]*bush|rbush)([^[:alnum:]]|$)' THEN 'REDUCING_BUSH' END,
    CASE WHEN CONCAT_WS(' ', "name", "supplierDescription", "category") ~* '(^|[^[:alnum:]])(pipe[[:space:]]+slip|p[[:space:]]*[-/]?[[:space:]]*slip|pslip)([^[:alnum:]]|$)' THEN 'PIPE_SLIP' END
  ], NULL);
