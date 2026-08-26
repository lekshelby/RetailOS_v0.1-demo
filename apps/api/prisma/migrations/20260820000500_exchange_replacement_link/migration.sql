ALTER TABLE "Return" ADD COLUMN "replacementSaleId" TEXT;

CREATE UNIQUE INDEX "Return_replacementSaleId_key" ON "Return"("replacementSaleId");

ALTER TABLE "Return"
  ADD CONSTRAINT "Return_replacementSaleId_fkey"
  FOREIGN KEY ("replacementSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
