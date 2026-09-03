import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type FifoAllocationResult = { cogs: Prisma.Decimal | null; blendedUnitCost: Prisma.Decimal | null; status: 'FINAL' | 'PROVISIONAL' | 'UNVALUED'; shortageQuantity: Prisma.Decimal };
type FifoOverride = { batchId: string; reason: string; approvedById: string };
export type FifoRestoredAllocation = { inventoryBatchId: string; quantity: Prisma.Decimal; unitCost: Prisma.Decimal | null; value: Prisma.Decimal | null };
export type FifoAdjustmentAllocation = { inventoryBatchId: string; quantity: Prisma.Decimal; unitCost: Prisma.Decimal | null; value: Prisma.Decimal | null; override: boolean };

export async function assertFifoStockInvariant(tx: Prisma.TransactionClient, input: { companyId: string; locationId: string; productId: string }) {
  const product = await tx.product.findUnique({ where: { id: input.productId }, select: { fifoEnabledAt: true } });
  if (!product?.fifoEnabledAt) return;
  const [snapshot, aggregate] = await Promise.all([
    tx.stockSnapshot.findUnique({ where: { locationId_productId: { locationId: input.locationId, productId: input.productId } }, select: { quantity: true } }),
    tx.inventoryBatch.aggregate({ where: { companyId: input.companyId, locationId: input.locationId, productId: input.productId, status: { in: ['POSTED', 'SHORTAGE'] } }, _sum: { remainingQuantity: true } }),
  ]);
  const snapshotQuantity = snapshot?.quantity ?? new Prisma.Decimal(0);
  const batchQuantity = aggregate._sum.remainingQuantity ?? new Prisma.Decimal(0);
  if (!snapshotQuantity.equals(batchQuantity)) throw new ConflictException(`FIFO stock invariant failed: snapshot ${snapshotQuantity.toFixed(4)} does not equal batch balance ${batchQuantity.toFixed(4)}`);
}

export async function adjustFifoInventory(tx: Prisma.TransactionClient, input: { companyId: string; locationId: string; productId: string; uomId: string; delta: Prisma.Decimal; unitCost: Prisma.Decimal | null; actorId: string; approvedById: string; reason: string; referenceId: string; reference?: string | null; supplier?: string | null; override?: FifoOverride; shortageAcknowledged: boolean; occurredAt: Date }) {
  if (input.delta.greaterThan(0)) {
    if (input.unitCost == null || input.unitCost.isNegative()) throw new UnprocessableEntityException('A non-negative approved unit cost is required for a positive FIFO stock adjustment');
    const id = randomUUID(); const value = input.delta.mul(input.unitCost);
    await tx.inventoryBatch.create({ data: { id, companyId: input.companyId, locationId: input.locationId, productId: input.productId, uomId: input.uomId, displayBatchId: `ADJ-${input.referenceId}`, bukkuReference: input.reference ?? null, supplier: input.supplier ?? null, receivedQuantity: input.delta, remainingQuantity: input.delta, purchaseUnitCost: input.unitCost, landedCostPerUnit: 0, finalUnitCost: input.unitCost, totalBatchValue: value, receivedAt: input.occurredAt, status: 'POSTED', sourceType: 'STOCK_ADJUSTMENT', importedById: input.actorId, approvedById: input.approvedById, postedAt: input.occurredAt } });
    await tx.inventoryBatchEvent.create({ data: { id: randomUUID(), companyId: input.companyId, inventoryBatchId: id, type: 'STOCK_ADJUSTMENT_CREATED', quantityDelta: input.delta, beforeRemaining: 0, afterRemaining: input.delta, actorId: input.actorId, approvedById: input.approvedById, reason: input.reason, referenceType: 'BATCH_UPDATE_ROW', referenceId: input.referenceId, createdAt: input.occurredAt } });
    return { allocations: [{ inventoryBatchId: id, quantity: input.delta, unitCost: input.unitCost, value, override: false }], valueDelta: value, status: 'FINAL' as const, shortageQuantity: new Prisma.Decimal(0) };
  }
  const requested = input.delta.abs();
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "InventoryBatch" WHERE "companyId"=${input.companyId} AND "locationId"=${input.locationId} AND "productId"=${input.productId} AND "status"='POSTED' AND "remainingQuantity">0 ORDER BY "receivedAt" ASC,"createdAt" ASC,"displayBatchId" ASC FOR UPDATE`);
  if (input.override && !locked.some((row) => row.id === input.override!.batchId)) throw new ConflictException('The approved FIFO adjustment override batch is not active for this product and location');
  const order = input.override ? [locked.find((row) => row.id === input.override!.batchId)!, ...locked.filter((row) => row.id !== input.override!.batchId)] : locked;
  const batches = locked.length ? await tx.inventoryBatch.findMany({ where: { id: { in: locked.map((row) => row.id) } } }) : [];
  const byId = new Map(batches.map((batch) => [batch.id, batch])); let needed = requested; let totalValue = new Prisma.Decimal(0); let valued = true; const allocations: FifoAdjustmentAllocation[] = [];
  for (const row of order) {
    if (needed.isZero()) break; const batch = byId.get(row.id); if (!batch) throw new ConflictException('A FIFO batch changed during stock adjustment');
    const quantity = Prisma.Decimal.min(needed, batch.remainingQuantity); const after = batch.remainingQuantity.sub(quantity); const value = batch.finalUnitCost == null ? null : quantity.mul(batch.finalUnitCost); if (value == null) valued = false; else totalValue = totalValue.add(value); const overridden = input.override?.batchId === batch.id;
    await tx.inventoryBatch.update({ where: { id: batch.id }, data: { remainingQuantity: after, status: after.isZero() ? 'FULLY_CONSUMED' : 'POSTED' } });
    await tx.inventoryBatchEvent.create({ data: { id: randomUUID(), companyId: input.companyId, inventoryBatchId: batch.id, type: overridden ? 'STOCK_ADJUSTMENT_OVERRIDE_CONSUMED' : 'STOCK_ADJUSTMENT_CONSUMED', quantityDelta: quantity.negated(), beforeRemaining: batch.remainingQuantity, afterRemaining: after, actorId: input.actorId, approvedById: input.approvedById, reason: overridden ? input.override!.reason : input.reason, referenceType: 'BATCH_UPDATE_ROW', referenceId: input.referenceId, createdAt: input.occurredAt } });
    allocations.push({ inventoryBatchId: batch.id, quantity, unitCost: batch.finalUnitCost, value, override: overridden }); needed = needed.sub(quantity);
  }
  if (needed.greaterThan(0)) {
    if (!input.shortageAcknowledged) throw new UnprocessableEntityException('Manager acknowledgement is required because this adjustment creates a FIFO shortage');
    const id = randomUUID();
    await tx.inventoryBatch.create({ data: { id, companyId: input.companyId, locationId: input.locationId, productId: input.productId, uomId: input.uomId, displayBatchId: `SHORT-ADJ-${input.referenceId}`, receivedQuantity: needed.negated(), remainingQuantity: needed.negated(), landedCostPerUnit: 0, receivedAt: input.occurredAt, status: 'SHORTAGE', sourceType: 'STOCK_ADJUSTMENT_SHORTAGE', importedById: input.actorId, approvedById: input.approvedById, postedAt: input.occurredAt } });
    await tx.inventoryBatchEvent.create({ data: { id: randomUUID(), companyId: input.companyId, inventoryBatchId: id, type: 'STOCK_ADJUSTMENT_SHORTAGE_CREATED', quantityDelta: needed.negated(), beforeRemaining: 0, afterRemaining: needed.negated(), actorId: input.actorId, approvedById: input.approvedById, reason: input.reason, referenceType: 'BATCH_UPDATE_ROW', referenceId: input.referenceId, createdAt: input.occurredAt } });
    allocations.push({ inventoryBatchId: id, quantity: needed, unitCost: null, value: null, override: false }); valued = false;
  }
  return { allocations, valueDelta: valued ? totalValue.negated() : null, status: !valued ? 'UNVALUED' as const : needed.greaterThan(0) ? 'PROVISIONAL' as const : 'FINAL' as const, shortageQuantity: needed };
}

export async function allocateFifoSale(tx: Prisma.TransactionClient, input: { companyId: string; locationId: string; productId: string; uomId: string; saleItemId: string; quantity: Prisma.Decimal; actorId: string; receiptNo: string; occurredAt: Date; fallbackUnitCost: Prisma.Decimal | null; override?: FifoOverride }): Promise<FifoAllocationResult> {
  const product = await tx.product.findUnique({ where: { id: input.productId }, select: { fifoEnabledAt: true, sku: true } });
  if (!product?.fifoEnabledAt) return { cogs: input.fallbackUnitCost == null ? null : input.quantity.mul(input.fallbackUnitCost), blendedUnitCost: input.fallbackUnitCost, status: input.fallbackUnitCost == null ? 'UNVALUED' : 'PROVISIONAL', shortageQuantity: new Prisma.Decimal(0) };

  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "InventoryBatch" WHERE "companyId"=${input.companyId} AND "locationId"=${input.locationId} AND "productId"=${input.productId} AND "status"='POSTED' AND "remainingQuantity">0 ORDER BY "receivedAt" ASC,"createdAt" ASC,"displayBatchId" ASC FOR UPDATE`);
  if (input.override && !locked.some((row) => row.id === input.override!.batchId)) throw new ConflictException('The approved FIFO override batch is not an active posted batch for this product and location');
  const allocationOrder = input.override ? [locked.find((row) => row.id === input.override!.batchId)!, ...locked.filter((row) => row.id !== input.override!.batchId)] : locked;
  const batches = locked.length ? await tx.inventoryBatch.findMany({ where: { id: { in: locked.map((row) => row.id) } } }) : [];
  const byId = new Map(batches.map((batch) => [batch.id, batch]));
  let needed = new Prisma.Decimal(input.quantity);
  let cogs = new Prisma.Decimal(0);
  let valued = true;

  for (const row of allocationOrder) {
    if (needed.isZero()) break;
    const batch = byId.get(row.id);
    if (!batch) throw new ConflictException('A FIFO inventory batch changed during checkout');
    const consumed = Prisma.Decimal.min(needed, batch.remainingQuantity);
    const after = batch.remainingQuantity.sub(consumed);
    const lineCogs = batch.finalUnitCost == null ? null : consumed.mul(batch.finalUnitCost);
    if (lineCogs == null) valued = false; else cogs = cogs.add(lineCogs);
    const overridden = input.override?.batchId === batch.id;
    await tx.inventoryBatch.update({ where: { id: batch.id }, data: { remainingQuantity: after, status: after.isZero() ? 'FULLY_CONSUMED' : 'POSTED' } });
    await tx.saleBatchAllocation.create({ data: { id: randomUUID(), saleItemId: input.saleItemId, inventoryBatchId: batch.id, type: overridden ? 'FIFO_OVERRIDE' : 'FIFO_CONSUMPTION', quantity: consumed, unitCost: batch.finalUnitCost, cogs: lineCogs, createdAt: input.occurredAt } });
    await tx.inventoryBatchEvent.create({ data: { id: randomUUID(), companyId: input.companyId, inventoryBatchId: batch.id, type: overridden ? 'FIFO_OVERRIDE_CONSUMED' : 'SALE_CONSUMED', quantityDelta: consumed.negated(), beforeRemaining: batch.remainingQuantity, afterRemaining: after, actorId: input.actorId, approvedById: overridden ? input.override!.approvedById : null, referenceType: 'SALE_ITEM', referenceId: input.saleItemId, reason: overridden ? input.override!.reason : `FIFO allocation for receipt ${input.receiptNo}`, createdAt: input.occurredAt } });
    needed = needed.sub(consumed);
  }

  if (needed.greaterThan(0)) {
    const shortageId = randomUUID();
    const estimated = input.fallbackUnitCost;
    const shortageCogs = estimated == null ? null : needed.mul(estimated);
    if (shortageCogs == null) valued = false; else cogs = cogs.add(shortageCogs);
    await tx.inventoryBatch.create({ data: { id: shortageId, companyId: input.companyId, locationId: input.locationId, productId: input.productId, uomId: input.uomId, displayBatchId: `SHORT-${input.saleItemId}`, receivedQuantity: needed.negated(), remainingQuantity: needed.negated(), purchaseUnitCost: estimated, landedCostPerUnit: 0, finalUnitCost: estimated, totalBatchValue: shortageCogs?.negated() ?? null, receivedAt: input.occurredAt, status: 'SHORTAGE', sourceType: 'SALE_SHORTAGE', importedById: input.actorId } });
    await tx.saleBatchAllocation.create({ data: { id: randomUUID(), saleItemId: input.saleItemId, inventoryBatchId: shortageId, type: 'SHORTAGE', quantity: needed, unitCost: estimated, cogs: shortageCogs, createdAt: input.occurredAt } });
    await tx.inventoryBatchEvent.create({ data: { id: randomUUID(), companyId: input.companyId, inventoryBatchId: shortageId, type: 'SHORTAGE_CREATED', quantityDelta: needed.negated(), beforeRemaining: 0, afterRemaining: needed.negated(), actorId: input.actorId, referenceType: 'SALE_ITEM', referenceId: input.saleItemId, reason: `Unsettled stock shortage for receipt ${input.receiptNo}`, createdAt: input.occurredAt } });
  }

  return { cogs: valued ? cogs : null, blendedUnitCost: valued ? cogs.div(input.quantity) : null, status: needed.greaterThan(0) ? 'PROVISIONAL' : valued ? 'FINAL' : 'UNVALUED', shortageQuantity: needed };
}

export async function restoreFifoReturn(tx: Prisma.TransactionClient, input: { companyId: string; saleItemId: string; returnItemId: string; quantity: Prisma.Decimal; actorId: string; occurredAt: Date; reason?: string | null }): Promise<FifoRestoredAllocation[]> {
  const allocations = await tx.saleBatchAllocation.findMany({ where: { saleItemId: input.saleItemId, type: { in: ['FIFO_CONSUMPTION', 'FIFO_OVERRIDE', 'SHORTAGE'] } }, include: { inventoryBatch: true } });
  allocations.sort((left, right) => right.inventoryBatch.receivedAt.getTime() - left.inventoryBatch.receivedAt.getTime() || right.inventoryBatch.createdAt.getTime() - left.inventoryBatch.createdAt.getTime() || right.inventoryBatch.displayBatchId.localeCompare(left.inventoryBatch.displayBatchId));
  const previousReturns = await tx.saleBatchAllocation.groupBy({ by: ['inventoryBatchId'], where: { saleItemId: input.saleItemId, type: 'RETURN_RESTORE' }, _sum: { quantity: true } });
  const restored = new Map(previousReturns.map((row) => [row.inventoryBatchId, row._sum.quantity ?? new Prisma.Decimal(0)]));
  let needed = new Prisma.Decimal(input.quantity); const result: FifoRestoredAllocation[] = [];
  for (const allocation of allocations) {
    if (needed.isZero()) break;
    const available = allocation.quantity.sub(restored.get(allocation.inventoryBatchId) ?? 0);
    if (!available.greaterThan(0)) continue;
    const quantity = Prisma.Decimal.min(needed, available);
    const locked = await tx.$queryRaw<Array<{ remainingQuantity: Prisma.Decimal }>>(Prisma.sql`SELECT "remainingQuantity" FROM "InventoryBatch" WHERE "id"=${allocation.inventoryBatchId} FOR UPDATE`);
    if (!locked[0]) throw new ConflictException('Original FIFO batch is no longer available for return');
    const before = locked[0].remainingQuantity;
    const after = before.add(quantity);
    const shortage = allocation.inventoryBatch.status === 'SHORTAGE';
    await tx.inventoryBatch.update({ where: { id: allocation.inventoryBatchId }, data: { remainingQuantity: after, status: shortage ? (after.isZero() ? 'FULLY_CONSUMED' : 'SHORTAGE') : 'POSTED' } });
    const value = allocation.unitCost == null ? null : quantity.mul(allocation.unitCost);
    await tx.saleBatchAllocation.create({ data: { id: randomUUID(), saleItemId: input.saleItemId, returnItemId: input.returnItemId, inventoryBatchId: allocation.inventoryBatchId, type: 'RETURN_RESTORE', quantity, unitCost: allocation.unitCost, cogs: value, createdAt: input.occurredAt } });
    await tx.inventoryBatchEvent.create({ data: { id: randomUUID(), companyId: input.companyId, inventoryBatchId: allocation.inventoryBatchId, type: 'RETURN_RESTORED', quantityDelta: quantity, beforeRemaining: before, afterRemaining: after, actorId: input.actorId, reason: input.reason, referenceType: 'RETURN_ITEM', referenceId: input.returnItemId, createdAt: input.occurredAt } });
    result.push({ inventoryBatchId: allocation.inventoryBatchId, quantity, unitCost: allocation.unitCost, value }); needed = needed.sub(quantity);
  }
  if (needed.greaterThan(0)) throw new ConflictException('The original FIFO allocation cannot fully receive this return; manager review is required');
  return result;
}
