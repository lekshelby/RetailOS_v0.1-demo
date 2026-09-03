import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PurchaseReceiptService } from './purchase-receipt.service';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const manager = { id: 'manager', status: 'ACTIVE', role: { permissions: ['backoffice.view'] } };
const cashier = { id: 'cashier', status: 'ACTIVE', role: { permissions: ['checkout'] } };

describe('Purchase receipt permissions and posting', () => {
  it.each(['list', 'get', 'post', 'batches', 'shortages', 'settle'])('returns 403 to a cashier for %s', async (operation) => {
    const db = { user: { findFirst: jest.fn().mockResolvedValue(cashier) } } as unknown as PrismaService;
    const service = new PurchaseReceiptService(db);
    const input = { companyId: 'company', actorId: 'cashier' };
    const action = operation === 'list' ? service.list(input)
      : operation === 'get' ? service.get('receipt', input)
        : operation === 'post' ? service.post('receipt', { ...input, confirmed: true, negativeStockAcknowledged: false, managerId: 'cashier' })
          : operation === 'batches' ? service.productBatches('product', input)
            : operation === 'shortages' ? service.shortages(input)
              : service.settleShortage('shortage', { ...input, confirmed: true, negativeStockAcknowledged: false, managerId: 'cashier', targetBatchId: 'posted', quantity: 1, reason: 'Review' });
    await expect(action).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks posting into negative stock without explicit manager acknowledgement', async () => {
    const receipt = receiptFixture();
    const tx = transactionFixture(receipt, d(-1));
    const db = {
      user: { findFirst: jest.fn().mockResolvedValue(manager) },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    } as unknown as PrismaService;
    const service = new PurchaseReceiptService(db);

    await expect(service.post('purchase-receipt', { companyId: 'company', actorId: 'manager', managerId: 'manager', confirmed: true, negativeStockAcknowledged: false })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.stockSnapshot.upsert).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('persists posted FIFO costs, approving manager, and immutable audit detail', async () => {
    const receipt = receiptFixture();
    const tx = transactionFixture(receipt, d(10));
    const postedReceipt = { ...receipt, status: 'POSTED', approvedBy: { id: 'manager', name: 'Manager' }, approvedById: 'manager', postedAt: new Date(), negativeStockAcknowledged: false };
    const db = {
      user: { findFirst: jest.fn().mockResolvedValue(manager) },
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
      purchaseReceipt: { findFirst: jest.fn().mockResolvedValue(postedReceipt) },
      stockSnapshot: { findMany: jest.fn().mockResolvedValue([{ locationId: 'location', productId: 'product', quantity: d(30) }]) },
    } as unknown as PrismaService;
    const service = new PurchaseReceiptService(db);

    await service.post('purchase-receipt', { companyId: 'company', actorId: 'manager', managerId: 'manager', confirmed: true, negativeStockAcknowledged: false });

    expect(tx.inventoryBatch.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'POSTED', approvedById: 'manager' }) }));
    expect(tx.productPurchasePrice.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { amount: receipt.batches[0].purchaseUnitCost } }));
    expect(tx.purchaseReceipt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'POSTED', approvedById: 'manager' }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'FIFO_PURCHASE_RECEIPT_POSTED', metadata: expect.objectContaining({ importingUserId: 'uploader', approvingManagerId: 'manager', bukkuReference: 'PI-2026-002' }) }) });
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('requires explicit manager confirmation to settle a shortage', async () => {
    const db = { user: { findFirst: jest.fn().mockResolvedValue(manager) } } as unknown as PrismaService;
    const service = new PurchaseReceiptService(db);
    await expect(service.settleShortage('shortage', { companyId: 'company', actorId: 'manager', managerId: 'manager', confirmed: false, negativeStockAcknowledged: true, targetBatchId: 'posted', quantity: 1, reason: 'Match later purchase' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function receiptFixture() {
  const batch = {
    id: 'batch-2', companyId: 'company', locationId: 'location', purchaseReceiptId: 'purchase-receipt', productId: 'product', uomId: 'uom', displayBatchId: 'PI-2026-002', bukkuReference: 'PI-2026-002', supplier: 'ABC Supplier',
    receivedQuantity: d(20), remainingQuantity: d(0), purchaseUnitCost: d('3.70'), landedCostPerUnit: d(0), finalUnitCost: d('3.70'), totalBatchValue: d('74.00'), billDate: new Date('2026-09-03'), receivedAt: new Date('2026-09-03T12:00:00Z'), status: 'DRAFT', sourceType: 'BUKKU_PURCHASE', importedById: 'uploader', approvedById: null, postedAt: null, voidedAt: null, createdAt: new Date(), product: { id: 'product', sku: 'SKU-1', name: 'Product', fifoEnabledAt: new Date() }, uom: { id: 'uom', code: 'EA', name: 'Each', conversionFactor: d(1) }, events: [], saleAllocations: [],
  };
  return { id: 'purchase-receipt', companyId: 'company', locationId: 'location', bukkuReference: 'PI-2026-002', supplier: 'ABC Supplier', purchaseDate: new Date('2026-09-03'), status: 'DRAFT', sourceFileName: 'purchase.csv', batchId: 'import-1', importedById: 'uploader', approvedById: null, negativeStockAcknowledged: false, createdAt: new Date(), postedAt: null, location: { id: 'location', name: 'Main', code: 'MAIN' }, importedBy: { id: 'uploader', name: 'Uploader' }, approvedBy: null, batches: [batch] };
}

function transactionFixture(receipt: ReturnType<typeof receiptFixture>, stock: Prisma.Decimal) {
  return {
    $queryRaw: jest.fn().mockResolvedValueOnce([{ status: 'DRAFT' }]).mockResolvedValueOnce([{ quantity: stock }]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    purchaseReceipt: { findUnique: jest.fn().mockResolvedValue(receipt), update: jest.fn().mockResolvedValue(undefined) },
    inventoryLedgerEntry: { findFirst: jest.fn().mockResolvedValue({ runningValue: d('55.90') }) },
    stockSnapshot: { upsert: jest.fn().mockResolvedValue(undefined), findUnique: jest.fn().mockResolvedValue({ quantity: stock.add(20) }) },
    inventoryBatch: { update: jest.fn().mockResolvedValue(undefined), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: { remainingQuantity: stock.add(20) } }) },
    inventoryBatchEvent: { create: jest.fn().mockResolvedValue(undefined) },
    product: { update: jest.fn().mockResolvedValue(undefined), findUnique: jest.fn().mockResolvedValue({ fifoEnabledAt: new Date() }) },
    productPurchasePrice: { upsert: jest.fn().mockResolvedValue(undefined) },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  };
}
