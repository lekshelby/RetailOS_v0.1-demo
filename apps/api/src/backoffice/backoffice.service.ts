import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { BackOfficeQueryDto, InventoryLedgerQueryDto } from './dto/backoffice-query.dto';
import { centsMoney, combineCostState, CostState, lineCost, moneyCents, resolveDateRange } from './reporting-domain';

type ProductMetric = { productId: string; sku: string; name: string; quantity: number; revenueCents: number; discountCents: number; cogsCents: number; costStatus: CostState };
type LedgerCostRow = { productId: string; locationId: string; averageUnitCost: Prisma.Decimal | null; costStatus: CostState; createdAt: Date };
type AdjustmentRow = { id: string; referenceId: string; createdAt: Date; reason: string | null; quantityDelta: Prisma.Decimal; valueDelta: Prisma.Decimal | null; costStatus: CostState; productName: string; sku: string; locationName: string; actorName: string | null };
type ReorderRow = { id: string; reorderLevel: Prisma.Decimal | null };
type ProvenanceRow = { id: string; sourceType: string; quantityDelta: Prisma.Decimal; countedQuantity: Prisma.Decimal | null; beforeQuantity: Prisma.Decimal; runningQuantity: Prisma.Decimal; unitCost: Prisma.Decimal | null; valueDelta: Prisma.Decimal | null; runningValue: Prisma.Decimal | null; costStatus: string; referenceType: string; referenceId: string; reason: string | null; createdAt: Date; productId: string; productName: string; sku: string; locationId: string; locationName: string; uomName: string | null; actorId: string | null; actorName: string | null; approvedById: string | null; approvedByName: string | null; batchId: string | null; linkedReceiptNo: string | null };

@Injectable()
export class BackOfficeService {
  constructor(private readonly db: PrismaService) {}

  async dashboard(input: BackOfficeQueryDto) {
    await this.assertAccess(input);
    const period = this.period(input);
    const saleWhere = this.saleWhere(input, period);
    const returnWhere = { companyId: input.companyId, status: 'COMPLETED' as const, createdAt: { gte: period.from, lt: period.to }, ...(input.locationId || input.registerId ? { sale: { ...(input.locationId ? { locationId: input.locationId } : {}), ...(input.registerId ? { registerId: input.registerId } : {}) } } : {}) };
    const [sales, returns, snapshots, shortageLogs, syncJobs, locations, fifoBatches] = await Promise.all([
      this.db.sale.findMany({ where: saleWhere, orderBy: { completedAt: 'asc' }, include: { location: { select: { id: true, name: true } }, register: { select: { id: true, name: true } }, cashier: { select: { id: true, name: true } }, items: { include: { product: { select: { id: true, sku: true, name: true, basePurchaseCost: true } } } }, payments: { where: { status: 'COMPLETED' } } } }),
      this.db.return.findMany({ where: returnWhere, orderBy: { createdAt: 'asc' }, include: { sale: { select: { receiptNo: true, locationId: true, registerId: true } }, items: { include: { product: { select: { id: true, sku: true, name: true, basePurchaseCost: true } }, saleItem: true } }, payments: true } }),
      this.db.stockSnapshot.findMany({ where: { location: { companyId: input.companyId }, ...(input.locationId ? { locationId: input.locationId } : {}) }, include: { location: { select: { name: true } }, product: { select: { id: true, sku: true, name: true, active: true, trackStock: true, basePurchaseCost: true } } }, orderBy: [{ quantity: 'asc' }, { product: { name: 'asc' } }] }),
      this.db.auditLog.findMany({ where: { companyId: input.companyId, action: 'STOCK_SHORTAGE_SOLD', createdAt: { gte: period.from, lt: period.to } }, select: { entityId: true, after: true } }),
      this.db.syncJob.findMany({ where: { companyId: input.companyId, provider: 'BUKKU', createdAt: { gte: period.from, lt: period.to } }, select: { id: true, entityType: true, action: true, status: true, attempts: true, lastError: true, createdAt: true, finishedAt: true }, orderBy: { createdAt: 'desc' }, take: 250 }),
      this.db.location.findMany({ where: { companyId: input.companyId }, include: { registers: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } }),
      this.db.inventoryBatch.findMany({ where: { companyId: input.companyId, ...(input.locationId ? { locationId: input.locationId } : {}), status: { in: ['POSTED', 'SHORTAGE'] } }, select: { productId: true, locationId: true, remainingQuantity: true, finalUnitCost: true, displayBatchId: true, receivedAt: true, supplier: true, bukkuReference: true }, orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { displayBatchId: 'asc' }] }),
    ]);

    const shortageSaleIds = new Set(shortageLogs.map((log) => log.entityId).filter((id): id is string => Boolean(id)));
    const products = new Map<string, ProductMetric>();
    const payments = new Map<string, number>();
    const trend = new Map<string, { salesCents: number; transactions: Set<string> }>();
    let grossSalesCents = 0;
    let discountCents = 0;
    let cogsCents = 0;
    let units = 0;
    let costStatus: CostState = 'FINAL';
    let unvaluedSales = 0;
    let provisionalSales = 0;
    const salesCogsReview: Array<{ receiptNo: string; completedAt: Date | null; productId: string; sku: string; product: string; quantity: number; cogs: number | null; costStatus: CostState; reason: string }> = [];

    for (const sale of sales) {
      const saleDiscountCents = moneyCents(sale.discountTotal);
      const lineGrossCents = sale.items.reduce((sum, item) => sum + moneyCents(item.lineTotal), 0);
      let saleState: CostState = 'FINAL';
      for (let index = 0; index < sale.items.length; index++) {
        const item = sale.items[index];
        const persisted = item as typeof item & { cogs: Prisma.Decimal | null; unitCost: Prisma.Decimal | null; costStatus: CostState };
        const allocatedSaleDiscount = index === sale.items.length - 1
          ? saleDiscountCents - sale.items.slice(0, index).reduce((sum, previous) => sum + Math.round(saleDiscountCents * moneyCents(previous.lineTotal) / Math.max(1, lineGrossCents)), 0)
          : Math.round(saleDiscountCents * moneyCents(item.lineTotal) / Math.max(1, lineGrossCents));
        const revenue = moneyCents(item.lineTotal) - allocatedSaleDiscount;
        const cost = lineCost({ persistedCogs: persisted.cogs, persistedUnitCost: persisted.unitCost, persistedStatus: persisted.costStatus, baseQuantity: item.baseQuantity, fallbackUnitCost: item.product.basePurchaseCost, negativeStock: shortageSaleIds.has(sale.id) });
        if (cost.status !== 'FINAL') salesCogsReview.push({ receiptNo: sale.receiptNo, completedAt: sale.completedAt, productId: item.productId, sku: item.product.sku, product: item.product.name, quantity: Number(item.baseQuantity), cogs: cost.status === 'UNVALUED' ? null : centsMoney(cost.cents), costStatus: cost.status, reason: cost.status === 'UNVALUED' ? 'No valid immutable unit cost is available' : shortageSaleIds.has(sale.id) ? 'Sale created or extended negative stock' : 'Legacy/fallback cost requires review' });
        const metric = products.get(item.productId) ?? { productId: item.productId, sku: item.product.sku, name: item.product.name, quantity: 0, revenueCents: 0, discountCents: 0, cogsCents: 0, costStatus: 'FINAL' };
        metric.quantity += Number(item.baseQuantity);
        metric.revenueCents += revenue;
        metric.discountCents += moneyCents(item.lineDiscount) + allocatedSaleDiscount;
        metric.cogsCents += cost.cents;
        metric.costStatus = combineCostState(metric.costStatus, cost.status);
        products.set(item.productId, metric);
        cogsCents += cost.cents;
        units += Number(item.quantity);
        saleState = combineCostState(saleState, cost.status);
      }
      if (saleState === 'UNVALUED') unvaluedSales++;
      else if (saleState === 'PROVISIONAL') provisionalSales++;
      costStatus = combineCostState(costStatus, saleState);
      grossSalesCents += moneyCents(sale.grandTotal);
      discountCents += sale.items.reduce((sum, item) => sum + moneyCents(item.lineDiscount), saleDiscountCents);
      for (const payment of sale.payments) payments.set(payment.method, (payments.get(payment.method) ?? 0) + (payment.method === 'CASH' ? moneyCents(payment.tenderedAmount) - moneyCents(payment.changeAmount) : moneyCents(payment.amount)));
      const key = this.trendKey(sale.completedAt ?? sale.createdAt, period.range);
      const point = trend.get(key) ?? { salesCents: 0, transactions: new Set<string>() };
      point.salesCents += moneyCents(sale.grandTotal); point.transactions.add(sale.id); trend.set(key, point);
    }

    let returnsCents = 0;
    for (const record of returns) {
      returnsCents += moneyCents(record.total);
      for (const payment of record.payments) payments.set(payment.method, (payments.get(payment.method) ?? 0) - moneyCents(payment.amount));
      for (const item of record.items) {
        const metric = products.get(item.productId) ?? { productId: item.productId, sku: item.product.sku, name: item.product.name, quantity: 0, revenueCents: 0, discountCents: 0, cogsCents: 0, costStatus: 'FINAL' };
        metric.quantity -= Number(item.baseQuantity);
        metric.revenueCents -= moneyCents(item.amount);
        if (record.type !== 'DISPOSE') {
          const original = item.saleItem as (typeof item.saleItem & { unitCost: Prisma.Decimal | null; costStatus: CostState }) | null;
          const cost = lineCost({ persistedUnitCost: original?.unitCost, persistedCogs: original?.unitCost == null ? null : new Prisma.Decimal(original.unitCost).mul(item.baseQuantity), persistedStatus: original?.costStatus, baseQuantity: item.baseQuantity, fallbackUnitCost: item.product.basePurchaseCost });
          metric.cogsCents -= cost.cents; cogsCents -= cost.cents; metric.costStatus = combineCostState(metric.costStatus, cost.status); costStatus = combineCostState(costStatus, cost.status);
        }
        products.set(item.productId, metric);
      }
    }

    const [latestCosts, reorderRows] = await Promise.all([this.latestLedgerCosts(input.companyId, input.locationId), this.db.$queryRaw<ReorderRow[]>(Prisma.sql`SELECT "id","reorderLevel" FROM "Product" WHERE "companyId"=${input.companyId}`).catch(() => [] as ReorderRow[])]);
    const reorderLevels = new Map(reorderRows.map((row) => [row.id, row.reorderLevel]));
    const fifoByProductLocation = new Map<string, typeof fifoBatches>(); for (const batch of fifoBatches) { const key = `${batch.locationId}:${batch.productId}`; const rows = fifoByProductLocation.get(key) ?? []; rows.push(batch); fifoByProductLocation.set(key, rows); }
    const inventory = snapshots.filter((row) => row.product.active && row.product.trackStock).map((row) => {
      const ledger = latestCosts.get(`${row.locationId}:${row.productId}`);
      const batches = fifoByProductLocation.get(`${row.locationId}:${row.productId}`) ?? []; const fifoValue = batches.reduce<Prisma.Decimal | null>((sum, batch) => sum == null || batch.finalUnitCost == null ? null : sum.add(batch.remainingQuantity.mul(batch.finalUnitCost)), new Prisma.Decimal(0));
      const quantity = Number(row.quantity); const unitCost = batches.length ? (fifoValue == null || quantity === 0 ? null : Number(fifoValue.div(row.quantity))) : ledger?.averageUnitCost == null ? (row.product.basePurchaseCost == null ? null : Number(row.product.basePurchaseCost)) : Number(ledger.averageUnitCost);
      const rowStatus: CostState = unitCost == null ? 'UNVALUED' : quantity < 0 || batches.some((batch) => batch.finalUnitCost == null || batch.remainingQuantity.isNegative()) ? 'PROVISIONAL' : batches.length ? 'FINAL' : !ledger ? 'PROVISIONAL' : ledger.costStatus;
      const reorderLevel = Number(reorderLevels.get(row.productId) ?? 5);
      return { productId: row.productId, locationId: row.locationId, sku: row.product.sku, name: row.product.name, location: row.location.name, quantity, unitCost, stockValue: fifoValue == null ? (unitCost == null ? null : centsMoney(Math.round(quantity * unitCost * 100))) : Number(fifoValue), costStatus: rowStatus, reorderLevel, reorderStatus: quantity < 0 ? 'NEGATIVE' : quantity <= reorderLevel ? 'LOW' : 'OK', lastMovementAt: ledger?.createdAt ?? row.capturedAt, activeBatches: batches.map((batch) => ({ batchId: batch.displayBatchId, remainingQuantity: Number(batch.remainingQuantity), finalUnitCost: batch.finalUnitCost == null ? null : Number(batch.finalUnitCost), value: batch.finalUnitCost == null ? null : Number(batch.remainingQuantity.mul(batch.finalUnitCost)), supplier: batch.supplier, bukkuReference: batch.bukkuReference })) };
    });
    const stockValueCents = inventory.reduce((sum, row) => sum + (row.stockValue == null ? 0 : moneyCents(row.stockValue)), 0);
    const transactionCount = sales.length;
    const netSalesCents = grossSalesCents - returnsCents;
    const grossProfitCents = netSalesCents - cogsCents;
    const productRows = [...products.values()].map((row) => ({ ...row, revenue: centsMoney(row.revenueCents), discount: centsMoney(row.discountCents), cogs: centsMoney(row.cogsCents), grossProfit: centsMoney(row.revenueCents - row.cogsCents), marginPercent: row.revenueCents ? Math.round((row.revenueCents - row.cogsCents) * 10_000 / row.revenueCents) / 100 : 0 })).sort((a, b) => b.revenueCents - a.revenueCents);
    const syncCounts = syncJobs.reduce<Record<string, number>>((counts, job) => { counts[job.status] = (counts[job.status] ?? 0) + 1; return counts; }, {});
    const salesCogsReviewCount = new Set(salesCogsReview.map((row) => row.receiptNo)).size;
    const inventoryExceptions = inventory.filter((row) => row.quantity < 0 || row.costStatus === 'UNVALUED');

    return {
      generatedAt: new Date().toISOString(), period: { range: period.range, from: period.fromDate, to: period.toDate }, filters: { locationId: input.locationId ?? null, registerId: input.registerId ?? null, locations },
      costing: { method: 'FIFO', status: costStatus, final: costStatus === 'FINAL', provisionalSales, unvaluedSales, note: costStatus === 'FINAL' ? 'COGS is final from persisted FIFO sale-to-batch allocations.' : costStatus === 'PROVISIONAL' ? 'Provisional COGS includes legacy stock or shortage layers requiring manager review.' : 'Unvalued stock or sales exist and require manager review.' },
      kpis: { netSales: centsMoney(netSalesCents), transactions: transactionCount, averageOrderValue: transactionCount ? centsMoney(Math.round(netSalesCents / transactionCount)) : 0, unitsPerOrder: transactionCount ? Math.round(units * 100 / transactionCount) / 100 : 0, grossProfit: centsMoney(grossProfitCents), cogs: centsMoney(cogsCents), grossMarginPercent: netSalesCents ? Math.round(grossProfitCents * 10_000 / netSalesCents) / 100 : 0, stockValue: centsMoney(stockValueCents), salesCogsReviewCount, inventoryExceptionCount: inventoryExceptions.length, exceptionCount: salesCogsReviewCount, bukkuSyncStatus: (syncCounts.FAILED || syncCounts.DEAD_LETTER) ? 'NEEDS_REVIEW' : syncCounts.PENDING || syncCounts.RUNNING ? 'PENDING' : 'SYNCED' },
      charts: { salesTrend: [...trend.entries()].map(([label, value]) => ({ label, sales: centsMoney(value.salesCents), transactions: value.transactions.size })), paymentMethods: [...payments.entries()].map(([method, value]) => ({ method, amount: centsMoney(value) })).sort((a, b) => b.amount - a.amount), topSelling: productRows.slice().sort((a, b) => b.quantity - a.quantity).slice(0, 10), topGrossProfit: productRows.slice().sort((a, b) => b.grossProfit - a.grossProfit).slice(0, 10), stockExceptions: inventory.filter((row) => row.reorderStatus !== 'OK').slice(0, 20) },
      reports: { sales: sales.map((sale) => ({ receiptNo: sale.receiptNo, completedAt: sale.completedAt, location: sale.location.name, register: sale.register.name, cashier: sale.cashier.name, total: Number(sale.grandTotal), discount: Number(sale.discountTotal), paymentMethods: sale.payments.map((payment) => payment.method) })), products: productRows, inventory, bukku: { counts: syncCounts, entries: syncJobs } },
      drilldowns: { salesCogsReview, inventoryExceptions },
    };
  }

  async sales(input: BackOfficeQueryDto) { return (await this.dashboard(input)).reports.sales; }
  async products(input: BackOfficeQueryDto) { return (await this.dashboard(input)).reports.products; }
  async inventory(input: BackOfficeQueryDto) { return (await this.dashboard(input)).reports.inventory; }
  async bukku(input: BackOfficeQueryDto) { return (await this.dashboard(input)).reports.bukku; }

  async inventoryLedger(productId: string, input: InventoryLedgerQueryDto) {
    await this.assertAccess(input);
    const product = await this.db.product.findFirst({ where: { id: productId, companyId: input.companyId }, include: { uoms: { orderBy: [{ isBase: 'desc' }, { name: 'asc' }] }, stockSnapshots: { where: input.locationId ? { locationId: input.locationId } : undefined, include: { location: { select: { id: true, name: true } } } } } });
    if (!product) throw new BadRequestException('Product was not found for this company');
    const rows = await this.db.$queryRaw<ProvenanceRow[]>(Prisma.sql`
      SELECT entry."id", entry."sourceType"::text, entry."quantityDelta", entry."countedQuantity", entry."beforeQuantity", entry."runningQuantity",
        entry."unitCost", entry."valueDelta", entry."runningValue", entry."costStatus"::text, entry."referenceType", entry."referenceId", entry."reason", entry."createdAt",
        product."id" AS "productId", product."name" AS "productName", product."sku", location."id" AS "locationId", location."name" AS "locationName",
        uom."name" AS "uomName", actor."id" AS "actorId", actor."name" AS "actorName", approver."id" AS "approvedById", approver."name" AS "approvedByName", entry."batchId", sale."receiptNo" AS "linkedReceiptNo"
      FROM "InventoryLedgerEntry" entry
      JOIN "Product" product ON product."id"=entry."productId"
      JOIN "Location" location ON location."id"=entry."locationId"
      LEFT JOIN "ProductUOM" uom ON uom."id"=entry."uomId"
      LEFT JOIN "User" actor ON actor."id"=entry."actorId"
      LEFT JOIN "User" approver ON approver."id"=entry."approvedById"
      LEFT JOIN "Sale" sale ON sale."id"=entry."referenceId" AND entry."referenceType" IN ('SALE','VOID')
      WHERE entry."companyId"=${input.companyId} AND entry."productId"=${productId}
        ${input.locationId ? Prisma.sql`AND entry."locationId"=${input.locationId}` : Prisma.empty}
        ${input.sourceType ? Prisma.sql`AND entry."sourceType"=${input.sourceType}::"InventorySourceType"` : Prisma.empty}
      ORDER BY entry."createdAt" DESC, entry."id" DESC LIMIT ${input.limit ?? 200}
    `);
    const summaries = await this.db.$queryRaw<Array<{ sourceType: string; createdAt: Date; referenceType: string; referenceId: string }>>(Prisma.sql`
      SELECT DISTINCT ON ("sourceType") "sourceType"::text AS "sourceType", "createdAt", "referenceType", "referenceId"
      FROM "InventoryLedgerEntry" WHERE "companyId"=${input.companyId} AND "productId"=${productId}
      ${input.locationId ? Prisma.sql`AND "locationId"=${input.locationId}` : Prisma.empty}
      AND "sourceType"::text IN ('BUKKU_PURCHASE','STAFF_COUNT','STAFF_ADJUSTMENT','POS_SALE')
      ORDER BY "sourceType", "createdAt" DESC, "id" DESC
    `);
    const last = (types: string[]) => summaries.find((row) => types.includes(row.sourceType)) ?? null;
    return {
      product: { id: product.id, sku: product.sku, name: product.name, baseUom: product.uoms[0]?.name ?? null },
      summary: {
        currentStock: product.stockSnapshots.reduce((total, snapshot) => total + Number(snapshot.quantity), 0),
        byLocation: product.stockSnapshots.map((snapshot) => ({ locationId: snapshot.location.id, location: snapshot.location.name, quantity: Number(snapshot.quantity) })),
        lastBukkuPurchase: last(['BUKKU_PURCHASE']), lastStaffAdjustment: last(['STAFF_COUNT', 'STAFF_ADJUSTMENT']), lastPosSale: last(['POS_SALE']),
      },
      rows: rows.map((row) => ({ ...row, quantityDelta: Number(row.quantityDelta), countedQuantity: row.countedQuantity == null ? null : Number(row.countedQuantity), beforeQuantity: Number(row.beforeQuantity), afterQuantity: Number(row.runningQuantity), unitCost: row.unitCost == null ? null : Number(row.unitCost), valuationEffect: row.valueDelta == null ? null : Number(row.valueDelta), afterValue: row.runningValue == null ? null : Number(row.runningValue), linkedDocument: { type: row.referenceType, id: row.referenceId, receiptNo: row.linkedReceiptNo } })),
    };
  }

  async adjustments(input: BackOfficeQueryDto) {
    await this.assertAccess(input);
    const period = this.period(input);
    const [rows, legacy] = await Promise.all([
      this.db.$queryRaw<AdjustmentRow[]>(Prisma.sql`
        SELECT entry."id", entry."referenceId", entry."createdAt", entry."reason", entry."quantityDelta", entry."valueDelta", entry."costStatus", product."name" AS "productName", product."sku", location."name" AS "locationName", actor."name" AS "actorName"
        FROM "InventoryLedgerEntry" entry
        JOIN "Product" product ON product."id" = entry."productId"
        JOIN "Location" location ON location."id" = entry."locationId"
        LEFT JOIN "User" actor ON actor."id" = entry."actorId"
        WHERE entry."companyId" = ${input.companyId} AND entry."type" = 'ADJUSTMENT'::"InventoryLedgerType" AND entry."createdAt" >= ${period.from} AND entry."createdAt" < ${period.to} ${input.locationId ? Prisma.sql`AND entry."locationId" = ${input.locationId}` : Prisma.empty}
        ORDER BY entry."createdAt" DESC LIMIT 500
      `).catch(() => [] as AdjustmentRow[]),
      this.db.auditLog.findMany({ where: { companyId: input.companyId, action: 'STOCK_COUNT_SET', createdAt: { gte: period.from, lt: period.to }, ...(input.locationId ? { after: { path: ['locationId'], equals: input.locationId } } : {}) }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 500 }),
    ]);
    const ledgerReferences = new Set(rows.map((row) => row.referenceId));
    return [
      ...rows.map((row) => ({ id: row.id, createdAt: row.createdAt, action: 'STOCK_ADJUSTMENT', product: row.productName, sku: row.sku, location: row.locationName, quantityDelta: Number(row.quantityDelta), costImpact: row.valueDelta == null ? null : Number(row.valueDelta), costStatus: row.costStatus, reason: row.reason, user: row.actorName ?? 'System', managerApproved: Boolean(row.actorName) })),
      ...legacy.filter((log) => !ledgerReferences.has(log.id)).map((log) => ({ id: log.id, createdAt: log.createdAt, action: 'LEGACY_STOCK_COUNT', product: null, sku: null, location: null, quantityDelta: null, costImpact: null, costStatus: 'UNVALUED' as const, reason: log.reason, user: log.actor?.name ?? 'System', managerApproved: Boolean(log.actorId) })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  private period(input: BackOfficeQueryDto) {
    try { return resolveDateRange(input); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid date range'); }
  }

  private saleWhere(input: BackOfficeQueryDto, period: ReturnType<typeof resolveDateRange>) {
    return { companyId: input.companyId, status: 'COMPLETED' as const, completedAt: { gte: period.from, lt: period.to }, ...(input.locationId ? { locationId: input.locationId } : {}), ...(input.registerId ? { registerId: input.registerId } : {}) };
  }

  private async assertAccess(input: BackOfficeQueryDto) {
    const actor = await this.db.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } });
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!actor || !permissions.some((permission) => ['backoffice.view', 'company.manage', 'shift.report.view'].includes(String(permission)))) throw new ForbiddenException('Manager access is required for Back Office reports');
  }

  private trendKey(date: Date, range: string) {
    return new Intl.DateTimeFormat(range === 'TODAY' ? 'en-MY' : 'en-CA', { timeZone: 'Asia/Kuala_Lumpur', ...(range === 'TODAY' ? { hour: '2-digit', hour12: false } : { month: 'short', day: '2-digit' }) }).format(date);
  }

  private async latestLedgerCosts(companyId: string, locationId?: string) {
    const rows = await this.db.$queryRaw<LedgerCostRow[]>(Prisma.sql`
      SELECT DISTINCT ON ("productId", "locationId") "productId", "locationId", "averageUnitCost", "costStatus", "createdAt"
      FROM "InventoryLedgerEntry"
      WHERE "companyId" = ${companyId} ${locationId ? Prisma.sql`AND "locationId" = ${locationId}` : Prisma.empty}
      ORDER BY "productId", "locationId", "createdAt" DESC, "id" DESC
    `).catch(() => [] as LedgerCostRow[]);
    return new Map(rows.map((row) => [`${row.locationId}:${row.productId}`, row]));
  }
}
