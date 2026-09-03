ALTER TABLE "Product" ADD COLUMN "reorderLevel" DECIMAL(14,4);

CREATE TABLE "BatchUpdate" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "rawFile" BYTEA NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PREVIEWED',
  "createdById" TEXT NOT NULL,
  "confirmedById" TEXT,
  "approvedById" TEXT,
  "rowCount" INTEGER NOT NULL,
  "validRowCount" INTEGER NOT NULL,
  "invalidRowCount" INTEGER NOT NULL,
  "duplicateRowCount" INTEGER NOT NULL,
  "highRisk" BOOLEAN NOT NULL DEFAULT false,
  "summary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "committedAt" TIMESTAMP(3),
  CONSTRAINT "BatchUpdate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BatchUpdateRow" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "productId" TEXT,
  "locationId" TEXT,
  "input" JSONB NOT NULL,
  "valid" BOOLEAN NOT NULL,
  "duplicate" BOOLEAN NOT NULL DEFAULT false,
  "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "beforeQuantity" DECIMAL(14,4),
  "requestedQuantity" DECIMAL(14,4),
  "afterQuantity" DECIMAL(14,4),
  "beforeValue" DECIMAL(18,4),
  "afterValue" DECIMAL(18,4),
  "costStatus" TEXT,
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BatchUpdateRow_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InventoryLedgerEntry" ADD COLUMN "batchId" TEXT;
ALTER TABLE "InventoryLedgerEntry" ADD COLUMN "batchRowId" TEXT;
CREATE TYPE "InventorySourceType" AS ENUM ('BUKKU_PURCHASE', 'STAFF_COUNT', 'STAFF_ADJUSTMENT', 'POS_SALE', 'RETURN', 'TRANSFER', 'OPENING_BALANCE');
ALTER TABLE "InventoryLedgerEntry" ADD COLUMN "sourceType" "InventorySourceType";
ALTER TABLE "InventoryLedgerEntry" ADD COLUMN "countedQuantity" DECIMAL(14,4);
ALTER TABLE "InventoryLedgerEntry" ADD COLUMN "beforeQuantity" DECIMAL(14,4);
ALTER TABLE "InventoryLedgerEntry" ADD COLUMN "uomId" TEXT;
ALTER TABLE "InventoryLedgerEntry" ADD COLUMN "approvedById" TEXT;
UPDATE "InventoryLedgerEntry"
SET "sourceType" = CASE
  WHEN "type" = 'SALE' THEN 'POS_SALE'::"InventorySourceType"
  WHEN "type" = 'RETURN' OR "type" = 'VOID' THEN 'RETURN'::"InventorySourceType"
  WHEN "referenceType" = 'INITIAL_STOCK' THEN 'OPENING_BALANCE'::"InventorySourceType"
  ELSE 'STAFF_ADJUSTMENT'::"InventorySourceType"
END,
"beforeQuantity" = "runningQuantity" - "quantityDelta";
ALTER TABLE "InventoryLedgerEntry" ALTER COLUMN "sourceType" SET NOT NULL;
ALTER TABLE "InventoryLedgerEntry" ALTER COLUMN "beforeQuantity" SET NOT NULL;

CREATE UNIQUE INDEX "BatchUpdate_companyId_type_checksum_key" ON "BatchUpdate"("companyId", "type", "checksum");
CREATE INDEX "BatchUpdate_companyId_createdAt_idx" ON "BatchUpdate"("companyId", "createdAt");
CREATE UNIQUE INDEX "BatchUpdateRow_batchId_rowNumber_key" ON "BatchUpdateRow"("batchId", "rowNumber");
CREATE INDEX "BatchUpdateRow_productId_locationId_idx" ON "BatchUpdateRow"("productId", "locationId");
CREATE UNIQUE INDEX "InventoryLedgerEntry_batchRowId_key" ON "InventoryLedgerEntry"("batchRowId");
CREATE INDEX "InventoryLedgerEntry_batchId_idx" ON "InventoryLedgerEntry"("batchId");

ALTER TABLE "BatchUpdate" ADD CONSTRAINT "BatchUpdate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatchUpdate" ADD CONSTRAINT "BatchUpdate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchUpdate" ADD CONSTRAINT "BatchUpdate_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BatchUpdate" ADD CONSTRAINT "BatchUpdate_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BatchUpdateRow" ADD CONSTRAINT "BatchUpdateRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BatchUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatchUpdateRow" ADD CONSTRAINT "BatchUpdateRow_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BatchUpdateRow" ADD CONSTRAINT "BatchUpdateRow_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BatchUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_batchRowId_fkey" FOREIGN KEY ("batchRowId") REFERENCES "BatchUpdateRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "ProductUOM"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "InventoryLedgerEntry_sourceType_createdAt_idx" ON "InventoryLedgerEntry"("sourceType", "createdAt");
