import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BackOfficeService } from './backoffice.service';

const decimal = (value: number) => new Prisma.Decimal(value);

function database(permission = 'shift.report.view') {
  return {
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'manager', role: { permissions: [permission] } }) },
    sale: { findMany: jest.fn().mockResolvedValue([]) },
    return: { findMany: jest.fn().mockResolvedValue([]) },
    stockSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    syncJob: { findMany: jest.fn().mockResolvedValue([]) },
    location: { findMany: jest.fn().mockResolvedValue([]) },
    inventoryBatch: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

describe('BackOfficeService', () => {
  const query = { companyId: 'company', actorId: 'manager', range: 'TODAY' as const };

  it('rejects a cashier before reading any financial report data', async () => {
    const db = database('checkout'); const service = new BackOfficeService(db as never);
    await expect(service.dashboard(query)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.sale.findMany).not.toHaveBeenCalled();
  });

  it('returns a real empty state without invented metrics', async () => {
    const service = new BackOfficeService(database() as never);
    const result = await service.dashboard(query);
    expect(result.kpis).toMatchObject({ netSales: 0, transactions: 0, cogs: 0, stockValue: 0 });
    expect(result.charts.salesTrend).toEqual([]);
    expect(result.reports.products).toEqual([]);
  });

  it('nets returns and discounts, settles multi-payments, and marks legacy negative-stock COGS provisional', async () => {
    const db = database();
    db.sale.findMany.mockResolvedValue([{ id: 'sale-1', receiptNo: 'R-1', completedAt: new Date(), createdAt: new Date(), grandTotal: decimal(90), discountTotal: decimal(10), location: { id: 'loc', name: 'Main' }, register: { id: 'reg', name: 'Till 1' }, cashier: { id: 'cashier', name: 'Cashier' }, items: [{ id: 'line-1', productId: 'product', quantity: decimal(2), baseQuantity: decimal(2), lineTotal: decimal(100), lineDiscount: decimal(0), cogs: null, unitCost: null, costStatus: 'UNVALUED', product: { id: 'product', sku: 'SKU-1', name: 'Pipe', basePurchaseCost: decimal(40) } }], payments: [{ method: 'CASH', amount: decimal(50), tenderedAmount: decimal(60), changeAmount: decimal(10) }, { method: 'DUITNOW', amount: decimal(40), tenderedAmount: decimal(40), changeAmount: decimal(0) }] }]);
    db.return.findMany.mockResolvedValue([{ id: 'return-1', type: 'REFUND', total: decimal(10), createdAt: new Date(), sale: { receiptNo: 'R-1', locationId: 'loc', registerId: 'reg' }, payments: [{ method: 'CASH', amount: decimal(10) }], items: [{ productId: 'product', baseQuantity: decimal(0.25), amount: decimal(10), product: { id: 'product', sku: 'SKU-1', name: 'Pipe', basePurchaseCost: decimal(40) }, saleItem: null }] }]);
    db.auditLog.findMany.mockResolvedValue([{ entityId: 'sale-1', after: { shortageIntroduced: '1' } }]);
    const result = await new BackOfficeService(db as never).dashboard(query);
    expect(result.kpis).toMatchObject({ netSales: 80, transactions: 1, cogs: 70, grossProfit: 10, exceptionCount: 1 });
    expect(result.charts.paymentMethods).toEqual(expect.arrayContaining([{ method: 'CASH', amount: 40 }, { method: 'DUITNOW', amount: 40 }]));
    expect(result.costing.status).toBe('PROVISIONAL');
    expect(result.reports.products[0]).toMatchObject({ quantity: 1.75, revenue: 80, discount: 10, cogs: 70, grossProfit: 10 });
  });
});
