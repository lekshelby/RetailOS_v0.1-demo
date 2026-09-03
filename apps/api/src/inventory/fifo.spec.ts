import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { adjustFifoInventory, allocateFifoSale, restoreFifoReturn } from './fifo';

const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

describe('FIFO inventory allocation', () => {
  it('allocates 10 × RM5.59 plus 2 × RM3.70 as RM63.30 and preserves batch balances', async () => {
    const batches = [
      { id: 'pi-001', remainingQuantity: decimal(10), finalUnitCost: decimal('5.59') },
      { id: 'pi-002', remainingQuantity: decimal(20), finalUnitCost: decimal('3.70') },
    ];
    const updates: Array<{ id: string; remaining: string; status: string }> = [];
    const allocations: Array<{ inventoryBatchId: string; quantity: Prisma.Decimal; cogs: Prisma.Decimal | null }> = [];
    const tx = {
      product: { findUnique: jest.fn().mockResolvedValue({ fifoEnabledAt: new Date(), sku: 'SKU-1' }) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'pi-001' }, { id: 'pi-002' }]),
      inventoryBatch: {
        findMany: jest.fn().mockResolvedValue(batches),
        update: jest.fn().mockImplementation(({ where, data }) => {
          updates.push({ id: where.id, remaining: data.remainingQuantity.toFixed(2), status: data.status });
          return Promise.resolve();
        }),
        create: jest.fn(),
      },
      saleBatchAllocation: { create: jest.fn().mockImplementation(({ data }) => { allocations.push(data); return Promise.resolve(); }) },
      inventoryBatchEvent: { create: jest.fn().mockResolvedValue(undefined) },
    } as unknown as Prisma.TransactionClient;

    const result = await allocateFifoSale(tx, {
      companyId: 'company', locationId: 'location', productId: 'product', uomId: 'uom', saleItemId: 'sale-item',
      quantity: decimal(12), actorId: 'cashier', receiptNo: 'R-1', occurredAt: new Date('2026-09-03T10:00:00Z'), fallbackUnitCost: null,
    });

    expect(result.cogs?.toFixed(2)).toBe('63.30');
    expect(result.blendedUnitCost?.toFixed(4)).toBe('5.2750');
    expect(result.status).toBe('FINAL');
    expect(result.shortageQuantity.isZero()).toBe(true);
    expect(updates).toEqual([
      { id: 'pi-001', remaining: '0.00', status: 'FULLY_CONSUMED' },
      { id: 'pi-002', remaining: '18.00', status: 'POSTED' },
    ]);
    expect(allocations.map((row) => [row.inventoryBatchId, row.quantity.toFixed(2), row.cogs?.toFixed(2)])).toEqual([
      ['pi-001', '10.00', '55.90'],
      ['pi-002', '2.00', '7.40'],
    ]);
  });

  it('creates an auditable shortage layer without rewriting prior allocations', async () => {
    const allocationCreate = jest.fn().mockResolvedValue(undefined);
    const batchCreate = jest.fn().mockResolvedValue(undefined);
    const tx = {
      product: { findUnique: jest.fn().mockResolvedValue({ fifoEnabledAt: new Date(), sku: 'SKU-1' }) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      inventoryBatch: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), create: batchCreate },
      saleBatchAllocation: { create: allocationCreate },
      inventoryBatchEvent: { create: jest.fn().mockResolvedValue(undefined) },
    } as unknown as Prisma.TransactionClient;

    const result = await allocateFifoSale(tx, {
      companyId: 'company', locationId: 'location', productId: 'product', uomId: 'uom', saleItemId: 'sale-item',
      quantity: decimal(4), actorId: 'cashier', receiptNo: 'R-2', occurredAt: new Date(), fallbackUnitCost: decimal('3.70'),
    });

    expect(result.shortageQuantity.toFixed(2)).toBe('4.00');
    expect(result.cogs?.toFixed(2)).toBe('14.80');
    expect(result.status).toBe('PROVISIONAL');
    expect(batchCreate.mock.calls[0][0].data).toMatchObject({ status: 'SHORTAGE', sourceType: 'SALE_SHORTAGE' });
    expect(batchCreate.mock.calls[0][0].data.remainingQuantity.toFixed(2)).toBe('-4.00');
    expect(allocationCreate.mock.calls[0][0].data.type).toBe('SHORTAGE');
  });

  it('uses a manager-approved override first and records its approver and reason', async () => {
    const allocations: Array<Record<string, unknown>> = [];
    const events: Array<Record<string, unknown>> = [];
    const tx = {
      product: { findUnique: jest.fn().mockResolvedValue({ fifoEnabledAt: new Date(), sku: 'SKU-1' }) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'oldest' }, { id: 'selected' }]),
      inventoryBatch: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'oldest', remainingQuantity: decimal(10), finalUnitCost: decimal(5) },
          { id: 'selected', remainingQuantity: decimal(10), finalUnitCost: decimal(7) },
        ]),
        update: jest.fn().mockResolvedValue(undefined), create: jest.fn(),
      },
      saleBatchAllocation: { create: jest.fn().mockImplementation(({ data }) => { allocations.push(data); return Promise.resolve(); }) },
      inventoryBatchEvent: { create: jest.fn().mockImplementation(({ data }) => { events.push(data); return Promise.resolve(); }) },
    } as unknown as Prisma.TransactionClient;

    const result = await allocateFifoSale(tx, { companyId: 'company', locationId: 'location', productId: 'product', uomId: 'uom', saleItemId: 'sale-item', quantity: decimal(2), actorId: 'cashier', receiptNo: 'R-3', occurredAt: new Date(), fallbackUnitCost: null, override: { batchId: 'selected', reason: 'Use reserved dated stock', approvedById: 'manager' } });
    expect(result.cogs?.toFixed(2)).toBe('14.00');
    expect(allocations[0]).toMatchObject({ inventoryBatchId: 'selected', type: 'FIFO_OVERRIDE' });
    expect(events[0]).toMatchObject({ type: 'FIFO_OVERRIDE_CONSUMED', approvedById: 'manager', reason: 'Use reserved dated stock' });
  });

  it('restores a return to its original sale batch and rejects an unallocatable remainder', async () => {
    const updates: unknown[] = [];
    const tx = {
      saleBatchAllocation: {
        findMany: jest.fn().mockResolvedValue([{ inventoryBatchId: 'pi-002', quantity: decimal(2), unitCost: decimal('3.70'), inventoryBatch: { status: 'POSTED', receivedAt: new Date('2026-09-03'), createdAt: new Date('2026-09-03'), displayBatchId: 'PI-002' } }]),
        groupBy: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(undefined),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ remainingQuantity: decimal(18) }]),
      inventoryBatch: { update: jest.fn().mockImplementation((value) => { updates.push(value); return Promise.resolve(); }) },
      inventoryBatchEvent: { create: jest.fn().mockResolvedValue(undefined) },
    } as unknown as Prisma.TransactionClient;

    const restored = await restoreFifoReturn(tx, { companyId: 'company', saleItemId: 'sale-item', returnItemId: 'return-item', quantity: decimal(2), actorId: 'manager', occurredAt: new Date() });
    expect(restored.map((row) => ({ batch: row.inventoryBatchId, quantity: row.quantity.toFixed(2), unitCost: row.unitCost?.toFixed(2), value: row.value?.toFixed(2) }))).toEqual([{ batch: 'pi-002', quantity: '2.00', unitCost: '3.70', value: '7.40' }]);
    expect((updates[0] as { data: { remainingQuantity: Prisma.Decimal } }).data.remainingQuantity.toFixed(2)).toBe('20.00');

    await expect(restoreFifoReturn(tx, { companyId: 'company', saleItemId: 'sale-item', returnItemId: 'return-2', quantity: decimal(3), actorId: 'manager', occurredAt: new Date() })).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a valued posted batch for a positive manager-approved FIFO adjustment', async () => {
    const tx = { inventoryBatch: { create: jest.fn() }, inventoryBatchEvent: { create: jest.fn() } } as unknown as Prisma.TransactionClient;
    const result = await adjustFifoInventory(tx, { companyId: 'company', locationId: 'location', productId: 'product', uomId: 'uom', delta: decimal(5), unitCost: decimal('3.70'), actorId: 'manager', approvedById: 'manager', reason: 'Count correction', referenceId: 'row-1', shortageAcknowledged: false, occurredAt: new Date() });
    expect(result.valueDelta?.toFixed(2)).toBe('18.50');
    expect((tx.inventoryBatch.create as jest.Mock).mock.calls[0][0].data).toMatchObject({ status: 'POSTED', sourceType: 'STOCK_ADJUSTMENT', approvedById: 'manager' });
  });

  it('consumes FIFO batches for a negative adjustment and requires acknowledgement for the shortage remainder', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'old' }, { id: 'new' }]),
      inventoryBatch: { findMany: jest.fn().mockResolvedValue([{ id: 'old', remainingQuantity: decimal(3), finalUnitCost: decimal(5) }, { id: 'new', remainingQuantity: decimal(2), finalUnitCost: decimal(7) }]), update: jest.fn(), create: jest.fn() },
      inventoryBatchEvent: { create: jest.fn() },
    } as unknown as Prisma.TransactionClient;
    const input = { companyId: 'company', locationId: 'location', productId: 'product', uomId: 'uom', delta: decimal(-6), unitCost: null, actorId: 'manager', approvedById: 'manager', reason: 'Damaged stock', referenceId: 'row-2', shortageAcknowledged: false, occurredAt: new Date() };
    await expect(adjustFifoInventory(tx, input)).rejects.toBeInstanceOf(UnprocessableEntityException);
    const result = await adjustFifoInventory(tx, { ...input, shortageAcknowledged: true });
    expect(result.shortageQuantity.toFixed(2)).toBe('1.00');
    expect(result.allocations.map((row) => [row.inventoryBatchId, row.quantity.toFixed(2)])).toEqual([['old', '3.00'], ['new', '2.00'], [expect.any(String), '1.00']]);
    expect((tx.inventoryBatch.create as jest.Mock).mock.calls.at(-1)?.[0].data).toMatchObject({ status: 'SHORTAGE', sourceType: 'STOCK_ADJUSTMENT_SHORTAGE' });
  });
});
