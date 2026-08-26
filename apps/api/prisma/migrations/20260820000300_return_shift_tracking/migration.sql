ALTER TABLE "Return" ADD COLUMN "shiftId" TEXT;

ALTER TABLE "Return"
  ADD CONSTRAINT "Return_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Return_shiftId_idx" ON "Return"("shiftId");
