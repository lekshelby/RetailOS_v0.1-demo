ALTER TABLE "Sale" ADD COLUMN "eInvoiceRequestToken" TEXT;
CREATE UNIQUE INDEX "Sale_eInvoiceRequestToken_key" ON "Sale"("eInvoiceRequestToken");

CREATE TYPE "EInvoiceRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'VALIDATED', 'REJECTED');
CREATE TABLE "EInvoiceRequest" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "status" "EInvoiceRequestStatus" NOT NULL DEFAULT 'PENDING',
  "entityType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "registrationNoType" TEXT,
  "registrationNo" TEXT,
  "tin" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "notes" TEXT,
  CONSTRAINT "EInvoiceRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EInvoiceRequest_token_key" ON "EInvoiceRequest"("token");
CREATE INDEX "EInvoiceRequest_companyId_status_submittedAt_idx" ON "EInvoiceRequest"("companyId", "status", "submittedAt");
ALTER TABLE "EInvoiceRequest" ADD CONSTRAINT "EInvoiceRequest_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EInvoiceRequest" ADD CONSTRAINT "EInvoiceRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
