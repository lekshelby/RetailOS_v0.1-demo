ALTER TABLE "Company"
  ADD COLUMN "bukkuDailyInvoiceEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "bukkuDailyInvoiceContactId" TEXT,
  ADD COLUMN "bukkuDailyInvoiceLocationId" TEXT,
  ADD COLUMN "bukkuDailyInvoiceRevenueAccountId" TEXT,
  ADD COLUMN "bukkuDailyInvoiceTaxCodeId" TEXT,
  ADD COLUMN "bukkuDailyInvoicePaymentAccounts" JSONB;
