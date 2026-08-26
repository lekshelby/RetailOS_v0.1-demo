ALTER TABLE "Company"
  ADD COLUMN "tin" TEXT,
  ADD COLUMN "brnNew" TEXT,
  ADD COLUMN "brnOld" TEXT;

ALTER TABLE "Customer"
  ADD COLUMN "contactCode" TEXT,
  ADD COLUMN "entityType" TEXT NOT NULL DEFAULT 'MALAYSIAN_COMPANY',
  ADD COLUMN "contactTypes" TEXT[] NOT NULL DEFAULT ARRAY['CUSTOMER']::TEXT[],
  ADD COLUMN "registrationNoType" TEXT,
  ADD COLUMN "registrationNo" TEXT,
  ADD COLUMN "oldRegistrationNo" TEXT,
  ADD COLUMN "sstRegistrationNo" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "postcode" TEXT,
  ADD COLUMN "countryCode" TEXT DEFAULT 'MY',
  ADD COLUMN "remarks" TEXT;

CREATE UNIQUE INDEX "Customer_companyId_contactCode_key" ON "Customer"("companyId", "contactCode");
