CREATE TYPE "PrintJobStatus" AS ENUM ('QUEUED', 'SENDING', 'PRINTED', 'FAILED', 'RETRYING');

ALTER TABLE "Company"
  ADD COLUMN "printerProfileName" TEXT NOT NULL DEFAULT 'Main receipt printer',
  ADD COLUMN "printerFallbackMethod" TEXT,
  ADD COLUMN "printerFallbackLanHost" TEXT,
  ADD COLUMN "printerFallbackLanPort" INTEGER,
  ADD COLUMN "receiptTemplate" TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "receiptDividerStyle" TEXT NOT NULL DEFAULT 'DASHED',
  ADD COLUMN "receiptShowLogo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "receiptShowSku" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "receiptChineseMode" TEXT NOT NULL DEFAULT 'AUTO';

CREATE TABLE "PrintJob" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "saleId" TEXT,
  "shiftId" TEXT,
  "printerProfile" TEXT NOT NULL,
  "transport" TEXT NOT NULL,
  "status" "PrintJobStatus" NOT NULL DEFAULT 'QUEUED',
  "kind" TEXT NOT NULL,
  "reprint" BOOLEAN NOT NULL DEFAULT false,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sendingAt" TIMESTAMP(3),
  "printedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdById" TEXT,
  CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrintJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PrintJob_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PrintJob_companyId_status_queuedAt_idx" ON "PrintJob"("companyId", "status", "queuedAt");
CREATE INDEX "PrintJob_saleId_queuedAt_idx" ON "PrintJob"("saleId", "queuedAt");
