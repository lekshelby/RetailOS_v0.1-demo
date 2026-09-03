CREATE TYPE "InventoryLedgerType" AS ENUM ('SALE', 'RETURN', 'VOID', 'ADJUSTMENT');
CREATE TYPE "InventoryCostStatus" AS ENUM ('FINAL', 'PROVISIONAL', 'UNVALUED');

ALTER TABLE "SaleItem"
  ADD COLUMN "unitCost" DECIMAL(16,4),
  ADD COLUMN "cogs" DECIMAL(16,4),
  ADD COLUMN "costStatus" "InventoryCostStatus" NOT NULL DEFAULT 'UNVALUED';

CREATE TABLE "InventoryLedgerEntry" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "saleItemId" TEXT,
  "returnItemId" TEXT,
  "actorId" TEXT,
  "type" "InventoryLedgerType" NOT NULL,
  "quantityDelta" DECIMAL(14,4) NOT NULL,
  "unitCost" DECIMAL(16,4),
  "valueDelta" DECIMAL(18,4),
  "runningQuantity" DECIMAL(14,4) NOT NULL,
  "runningValue" DECIMAL(18,4),
  "averageUnitCost" DECIMAL(16,4),
  "costStatus" "InventoryCostStatus" NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryLedgerEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryLedgerEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryLedgerEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryLedgerEntry_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "InventoryLedgerEntry_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "ReturnItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "InventoryLedgerEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InventoryLedgerEntry_referenceType_referenceId_productId_key" ON "InventoryLedgerEntry"("referenceType", "referenceId", "productId");
CREATE INDEX "InventoryLedgerEntry_companyId_createdAt_idx" ON "InventoryLedgerEntry"("companyId", "createdAt");
CREATE INDEX "InventoryLedgerEntry_locationId_productId_createdAt_idx" ON "InventoryLedgerEntry"("locationId", "productId", "createdAt");
CREATE INDEX "InventoryLedgerEntry_costStatus_createdAt_idx" ON "InventoryLedgerEntry"("costStatus", "createdAt");

-- Historical sale lines remain UNVALUED. The Back Office read model may label
-- them provisional when a trustworthy product cost exists, but this migration
-- never rewrites completed financial history.
