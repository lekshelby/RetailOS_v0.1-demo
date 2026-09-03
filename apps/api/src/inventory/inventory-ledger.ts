import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type InventoryCostState = 'FINAL' | 'PROVISIONAL' | 'UNVALUED';
export type InventoryLedgerKind = 'SALE' | 'RETURN' | 'VOID' | 'ADJUSTMENT';
export type InventorySource = 'BUKKU_PURCHASE' | 'STAFF_COUNT' | 'STAFF_ADJUSTMENT' | 'POS_SALE' | 'RETURN' | 'TRANSFER' | 'OPENING_BALANCE';
export type LatestInventoryCost = { averageUnitCost: Prisma.Decimal | null; runningValue: Prisma.Decimal | null; costStatus: InventoryCostState };

export async function latestInventoryCost(tx: Prisma.TransactionClient, companyId: string, locationId: string, productId: string) {
  const rows = await tx.$queryRaw<LatestInventoryCost[]>(Prisma.sql`
    SELECT "averageUnitCost", "runningValue", "costStatus"
    FROM "InventoryLedgerEntry"
    WHERE "companyId" = ${companyId} AND "locationId" = ${locationId} AND "productId" = ${productId}
    ORDER BY "createdAt" DESC, "id" DESC LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function setSaleItemCost(tx: Prisma.TransactionClient, saleItemId: string, unitCost: Prisma.Decimal | null, cogs: Prisma.Decimal | null, status: InventoryCostState) {
  await tx.$executeRaw(Prisma.sql`UPDATE "SaleItem" SET "unitCost" = ${unitCost}, "cogs" = ${cogs}, "costStatus" = ${status}::"InventoryCostStatus" WHERE "id" = ${saleItemId}`);
}

export async function recordInventoryLedger(tx: Prisma.TransactionClient, input: {
  companyId: string; locationId: string; productId: string; saleItemId?: string; returnItemId?: string; actorId?: string;
  batchId?: string; batchRowId?: string; approvedById?: string; uomId?: string; countedQuantity?: Prisma.Decimal | null;
  sourceType?: InventorySource;
  type: InventoryLedgerKind; quantityDelta: Prisma.Decimal; unitCost: Prisma.Decimal | null; valueDelta: Prisma.Decimal | null;
  runningQuantity: Prisma.Decimal; runningValue: Prisma.Decimal | null; averageUnitCost: Prisma.Decimal | null; costStatus: InventoryCostState;
  referenceType: string; referenceId: string; reason?: string | null; createdAt?: Date;
}) {
  const id = randomUUID(); const createdAt = input.createdAt ?? new Date();
  const sourceType: InventorySource = input.sourceType ?? (input.type === 'SALE' ? 'POS_SALE' : input.type === 'RETURN' || input.type === 'VOID' ? 'RETURN' : input.referenceType === 'INITIAL_STOCK' ? 'OPENING_BALANCE' : 'STAFF_ADJUSTMENT');
  const beforeQuantity = input.runningQuantity.sub(input.quantityDelta);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "InventoryLedgerEntry" ("id","companyId","locationId","productId","saleItemId","returnItemId","actorId","approvedById","uomId","batchId","batchRowId","type","sourceType","quantityDelta","countedQuantity","beforeQuantity","unitCost","valueDelta","runningQuantity","runningValue","averageUnitCost","costStatus","referenceType","referenceId","reason","createdAt")
    VALUES (${id},${input.companyId},${input.locationId},${input.productId},${input.saleItemId ?? null},${input.returnItemId ?? null},${input.actorId ?? null},${input.approvedById ?? null},${input.uomId ?? null},${input.batchId ?? null},${input.batchRowId ?? null},${input.type}::"InventoryLedgerType",${sourceType}::"InventorySourceType",${input.quantityDelta},${input.countedQuantity ?? null},${beforeQuantity},${input.unitCost},${input.valueDelta},${input.runningQuantity},${input.runningValue},${input.averageUnitCost},${input.costStatus}::"InventoryCostStatus",${input.referenceType},${input.referenceId},${input.reason ?? null},${createdAt})
  `);
  return id;
}
