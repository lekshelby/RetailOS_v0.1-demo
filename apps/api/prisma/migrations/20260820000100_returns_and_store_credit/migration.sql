-- CreateEnum
CREATE TYPE "ReturnType" AS ENUM ('REFUND', 'DISPOSE', 'EXCHANGE');

-- AlterTable
ALTER TABLE "Return" ADD COLUMN "type" "ReturnType" NOT NULL DEFAULT 'REFUND';
ALTER TABLE "ReturnItem" ADD COLUMN "saleItemId" TEXT;

-- CreateTable
CREATE TABLE "ReturnPayment" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreCredit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT,
    "returnId" TEXT NOT NULL,
    "originalAmount" DECIMAL(14,2) NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreCredit_returnId_key" ON "StoreCredit"("returnId");
CREATE INDEX "StoreCredit_companyId_balance_idx" ON "StoreCredit"("companyId", "balance");

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReturnPayment" ADD CONSTRAINT "ReturnPayment_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreCredit" ADD CONSTRAINT "StoreCredit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreCredit" ADD CONSTRAINT "StoreCredit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreCredit" ADD CONSTRAINT "StoreCredit_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE CASCADE ON UPDATE CASCADE;
