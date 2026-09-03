ALTER TABLE "Product" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Product_companyId_active_deletedAt_idx"
ON "Product"("companyId", "active", "deletedAt");
