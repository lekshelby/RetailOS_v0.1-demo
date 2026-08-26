ALTER TABLE "Company"
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "registrationNo" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "receiptFooter" TEXT,
  ADD COLUMN "receiptPaperWidthMm" INTEGER NOT NULL DEFAULT 80;

ALTER TABLE "Customer" ADD COLUMN "organization" TEXT;
