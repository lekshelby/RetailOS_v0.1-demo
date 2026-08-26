ALTER TABLE "Company" ADD COLUMN "bukkuProductVersion" TEXT;

ALTER TABLE "Product"
  ADD COLUMN "classificationCode" TEXT,
  ADD COLUMN "bukkuType" TEXT,
  ADD COLUMN "bukkuCatalogHash" TEXT;

CREATE TABLE "ProductPurchasePrice" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "uomId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "ProductPurchasePrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductPurchasePrice_productId_uomId_key" ON "ProductPurchasePrice"("productId", "uomId");

ALTER TABLE "ProductPurchasePrice"
  ADD CONSTRAINT "ProductPurchasePrice_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductPurchasePrice"
  ADD CONSTRAINT "ProductPurchasePrice_uomId_fkey"
  FOREIGN KEY ("uomId") REFERENCES "ProductUOM"("id") ON DELETE CASCADE ON UPDATE CASCADE;
