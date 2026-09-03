ALTER TABLE "Product" ADD COLUMN "fifoEnabledAt" TIMESTAMP(3);

CREATE TABLE "PurchaseReceipt" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "bukkuReference" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "purchaseDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sourceFileName" TEXT,
  "batchId" TEXT,
  "importedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "negativeStockAcknowledged" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postedAt" TIMESTAMP(3),
  CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryBatch" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "purchaseReceiptId" TEXT,
  "productId" TEXT NOT NULL,
  "uomId" TEXT NOT NULL,
  "displayBatchId" TEXT NOT NULL,
  "bukkuReference" TEXT,
  "supplier" TEXT,
  "receivedQuantity" DECIMAL(14,4) NOT NULL,
  "remainingQuantity" DECIMAL(14,4) NOT NULL,
  "purchaseUnitCost" DECIMAL(16,4),
  "landedCostPerUnit" DECIMAL(16,4) NOT NULL DEFAULT 0,
  "finalUnitCost" DECIMAL(16,4),
  "totalBatchValue" DECIMAL(18,4),
  "billDate" DATE,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sourceType" TEXT NOT NULL,
  "importedById" TEXT,
  "approvedById" TEXT,
  "postedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryBatchEvent" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "inventoryBatchId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "quantityDelta" DECIMAL(14,4) NOT NULL,
  "beforeRemaining" DECIMAL(14,4) NOT NULL,
  "afterRemaining" DECIMAL(14,4) NOT NULL,
  "actorId" TEXT,
  "approvedById" TEXT,
  "reason" TEXT,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryBatchEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleBatchAllocation" (
  "id" TEXT NOT NULL,
  "saleItemId" TEXT NOT NULL,
  "returnItemId" TEXT,
  "inventoryBatchId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "quantity" DECIMAL(14,4) NOT NULL,
  "unitCost" DECIMAL(16,4),
  "cogs" DECIMAL(18,4),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleBatchAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseReceipt_companyId_bukkuReference_key" ON "PurchaseReceipt"("companyId", "bukkuReference");
CREATE INDEX "PurchaseReceipt_companyId_status_createdAt_idx" ON "PurchaseReceipt"("companyId", "status", "createdAt");
CREATE UNIQUE INDEX "InventoryBatch_companyId_locationId_displayBatchId_productId_key" ON "InventoryBatch"("companyId", "locationId", "displayBatchId", "productId");
CREATE INDEX "InventoryBatch_productId_createdAt_idx" ON "InventoryBatch"("productId", "createdAt");
CREATE INDEX "InventoryBatch_companyId_locationId_productId_status_receivedAt_idx" ON "InventoryBatch"("companyId", "locationId", "productId", "status", "receivedAt");
CREATE INDEX "InventoryBatchEvent_inventoryBatchId_createdAt_idx" ON "InventoryBatchEvent"("inventoryBatchId", "createdAt");
CREATE UNIQUE INDEX "InventoryBatchEvent_referenceType_referenceId_inventoryBatchId_type_key" ON "InventoryBatchEvent"("referenceType", "referenceId", "inventoryBatchId", "type");
CREATE INDEX "SaleBatchAllocation_saleItemId_createdAt_idx" ON "SaleBatchAllocation"("saleItemId", "createdAt");
CREATE INDEX "SaleBatchAllocation_inventoryBatchId_createdAt_idx" ON "SaleBatchAllocation"("inventoryBatchId", "createdAt");

ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "ProductUOM"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryBatchEvent" ADD CONSTRAINT "InventoryBatchEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryBatchEvent" ADD CONSTRAINT "InventoryBatchEvent_inventoryBatchId_fkey" FOREIGN KEY ("inventoryBatchId") REFERENCES "InventoryBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryBatchEvent" ADD CONSTRAINT "InventoryBatchEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryBatchEvent" ADD CONSTRAINT "InventoryBatchEvent_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleBatchAllocation" ADD CONSTRAINT "SaleBatchAllocation_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleBatchAllocation" ADD CONSTRAINT "SaleBatchAllocation_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "ReturnItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleBatchAllocation" ADD CONSTRAINT "SaleBatchAllocation_inventoryBatchId_fkey" FOREIGN KEY ("inventoryBatchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing stock is represented, not recosted. These DRAFT legacy batches must
-- be reviewed by a manager before FIFO is enabled for the product.
INSERT INTO "InventoryBatch" (
  "id","companyId","locationId","productId","uomId","displayBatchId","receivedQuantity","remainingQuantity",
  "purchaseUnitCost","landedCostPerUnit","finalUnitCost","totalBatchValue","receivedAt","status","sourceType","createdAt"
)
SELECT
  'legacy-' || md5(snapshot."locationId" || ':' || snapshot."productId"),
  product."companyId", snapshot."locationId", snapshot."productId", base_uom."id",
  'LEGACY-' || product."sku" || '-' || location."code",
  snapshot."quantity", snapshot."quantity",
  COALESCE(latest."averageUnitCost", product."basePurchaseCost", 0), 0,
  COALESCE(latest."averageUnitCost", product."basePurchaseCost", 0),
  snapshot."quantity" * COALESCE(latest."averageUnitCost", product."basePurchaseCost", 0),
  snapshot."capturedAt", 'DRAFT', 'OPENING_LEGACY', CURRENT_TIMESTAMP
FROM "StockSnapshot" snapshot
JOIN "Product" product ON product."id" = snapshot."productId"
JOIN "Location" location ON location."id" = snapshot."locationId"
JOIN LATERAL (
  SELECT uom."id" FROM "ProductUOM" uom WHERE uom."productId" = product."id"
  ORDER BY uom."isBase" DESC, uom."id" ASC LIMIT 1
) base_uom ON TRUE
LEFT JOIN LATERAL (
  SELECT ledger."averageUnitCost" FROM "InventoryLedgerEntry" ledger
  WHERE ledger."locationId" = snapshot."locationId" AND ledger."productId" = snapshot."productId"
  ORDER BY ledger."createdAt" DESC, ledger."id" DESC LIMIT 1
) latest ON TRUE
WHERE snapshot."quantity" <> 0;
