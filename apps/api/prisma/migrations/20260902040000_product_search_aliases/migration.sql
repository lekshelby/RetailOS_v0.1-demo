CREATE TYPE "ProductAliasSource" AS ENUM ('MANUAL', 'IMPORT', 'GENERATED');

CREATE TABLE "ProductAlias" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedToken" TEXT NOT NULL,
    "normalizedCompact" TEXT NOT NULL,
    "source" "ProductAliasSource" NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductAlias_productId_normalizedToken_key" ON "ProductAlias"("productId", "normalizedToken");
CREATE INDEX "ProductAlias_normalizedToken_idx" ON "ProductAlias"("normalizedToken");
CREATE INDEX "ProductAlias_normalizedCompact_idx" ON "ProductAlias"("normalizedCompact");
CREATE INDEX "ProductAlias_productId_source_idx" ON "ProductAlias"("productId", "source");
ALTER TABLE "ProductAlias" ADD CONSTRAINT "ProductAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductAlias" ADD CONSTRAINT "ProductAlias_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
