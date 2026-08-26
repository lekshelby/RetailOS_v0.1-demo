import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly db: PrismaService) {}
  async catalog(companyId: string, priceLevelId?: string, locationId?: string, offset = 0, limit = 250) {
    const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 250;
    const where = { companyId, active: true };
    const [products, total] = await this.db.$transaction([
      this.db.product.findMany({
      where,
      include: { uoms: { orderBy: [{ isBase: 'desc' }, { name: 'asc' }] }, barcodes: true, prices: { where: priceLevelId ? { priceLevelId } : undefined }, stockSnapshots: { where: locationId ? { locationId } : undefined } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: safeOffset, take: safeLimit,
      }),
      this.db.product.count({ where }),
    ]);
    const references = await this.db.externalReference.findMany({ where: { companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: { in: products.map((product) => product.id) } }, select: { localId: true } });
    const bukkuProductIds = new Set(references.map((reference) => reference.localId));
    return { items: products.map((product) => ({ id: product.id, sku: product.sku, name: product.name, supplierDescription: product.supplierDescription, supplierName: product.supplierName, lastPurchasedAt: product.lastPurchasedAt, barcodes: product.barcodes.map((barcode) => barcode.barcode), nominalLengthMeters: product.nominalLengthMeters == null ? null : Number(product.nominalLengthMeters), basePurchaseCost: product.basePurchaseCost == null ? null : Number(product.basePurchaseCost), trackStock: product.trackStock, source: bukkuProductIds.has(product.id) ? 'BUKKU' : 'LOCAL', uoms: product.uoms.map((uom) => ({ id: uom.id, code: uom.code, name: uom.name, conversionFactor: Number(uom.conversionFactor), purchaseCost: product.basePurchaseCost == null ? null : Number(product.basePurchaseCost) * Number(uom.conversionFactor) })), prices: product.prices.map((price) => ({ uomId: price.uomId, amount: Number(price.amount) })), stock: product.stockSnapshots[0] ? Number(product.stockSnapshots[0].quantity) : null })), total, offset: safeOffset, nextOffset: safeOffset + products.length < total ? safeOffset + products.length : null };
  }
  lookup(companyId: string, query: string, priceLevelId?: string, locationId?: string) {
    const term = query.trim();
    return this.db.product.findMany({
      where: {
        companyId, active: true,
        OR: [
          { sku: { equals: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
          { supplierDescription: { contains: term, mode: 'insensitive' } },
          { barcodes: { some: { barcode: term } } },
        ],
      },
      include: {
        uoms: { orderBy: [{ isBase: 'desc' }, { name: 'asc' }] },
        barcodes: true,
        prices: { where: priceLevelId ? { priceLevelId } : undefined },
        stockSnapshots: { where: locationId ? { locationId } : undefined },
      },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }

  async adjustStock(productId: string, input: StockAdjustmentDto) {
    const [actor, product, location] = await Promise.all([
      this.db.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
      this.db.product.findFirst({ where: { id: productId, companyId: input.companyId } }),
      this.db.location.findFirst({ where: { id: input.locationId, companyId: input.companyId } }),
    ]);
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!actor || !permissions.includes('stock.adjust')) throw new NotFoundException('Manager access is required for stock adjustment');
    if (!product || !location) throw new BadRequestException('Product or store was not found');
    if (!product.trackStock) throw new BadRequestException('This product does not track stock');
    if (!input.reason.trim()) throw new BadRequestException('A stock-adjustment reason is required');

    return this.db.$transaction(async (tx) => {
      const existing = await tx.stockSnapshot.findUnique({ where: { locationId_productId: { locationId: location.id, productId: product.id } } });
      const snapshot = await tx.stockSnapshot.upsert({
        where: { locationId_productId: { locationId: location.id, productId: product.id } },
        update: { quantity: input.countedQuantity, capturedAt: new Date() },
        create: { locationId: location.id, productId: product.id, quantity: input.countedQuantity },
      });
      await tx.auditLog.create({ data: { companyId: input.companyId, actorId: actor.id, action: 'STOCK_COUNT_SET', entityType: 'StockSnapshot', entityId: snapshot.id, reason: input.reason.trim(), before: { quantity: Number(existing?.quantity ?? 0) }, after: { quantity: input.countedQuantity, productId: product.id, locationId: location.id } } });
      return { productId: product.id, productName: product.name, previousQuantity: Number(existing?.quantity ?? 0), countedQuantity: Number(snapshot.quantity), location: location.name };
    });
  }
}
