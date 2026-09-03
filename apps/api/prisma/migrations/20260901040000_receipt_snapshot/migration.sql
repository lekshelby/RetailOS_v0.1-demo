-- Added separately because the earlier professional-print-jobs migration was
-- already applied before receipt snapshots were introduced. Existing receipts
-- remain readable through the legacy-data fallback in ReceiptDocument.
ALTER TABLE "Sale" ADD COLUMN "receiptSnapshot" JSONB;
