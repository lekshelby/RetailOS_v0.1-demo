import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { latestInventoryCost, recordInventoryLedger } from '../inventory/inventory-ledger';
import { adjustFifoInventory, assertFifoStockInvariant } from '../inventory/fifo';
import { expandedSearchTerms, fuzzyProduct, matchesStructuredProduct, normalizeProductText, parseStructuredHardwareQuery, rankProduct, structuredMatchSpecificity, structuredRelatedScore } from './product-search';

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
      include: { uoms: { orderBy: [{ isBase: 'desc' }, { name: 'asc' }] }, barcodes: true, aliases: true, prices: { where: priceLevelId ? { priceLevelId } : undefined }, stockSnapshots: { where: locationId ? { locationId } : undefined } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: safeOffset, take: safeLimit,
      }),
      this.db.product.count({ where }),
    ]);
    const references = await this.db.externalReference.findMany({ where: { companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: { in: products.map((product) => product.id) } }, select: { localId: true } });
    const bukkuProductIds = new Set(references.map((reference) => reference.localId));
    return { items: products.map((product) => ({ id: product.id, sku: product.sku, name: product.name, supplierDescription: product.supplierDescription, supplierName: product.supplierName, category: product.category, aliases: product.aliases.map((alias) => ({ text: alias.text, normalizedToken: alias.normalizedToken, normalizedCompact: alias.normalizedCompact })), searchDimensions: product.searchDimensions, searchMaterials: product.searchMaterials, searchProductTypes: product.searchProductTypes, lastPurchasedAt: product.lastPurchasedAt, barcodes: product.barcodes.map((barcode) => barcode.barcode), nominalLengthMeters: product.nominalLengthMeters == null ? null : Number(product.nominalLengthMeters), basePurchaseCost: product.basePurchaseCost == null ? null : Number(product.basePurchaseCost), trackStock: product.trackStock, source: bukkuProductIds.has(product.id) ? 'BUKKU' : 'LOCAL', uoms: product.uoms.map((uom) => ({ id: uom.id, code: uom.code, name: uom.name, conversionFactor: Number(uom.conversionFactor), purchaseCost: product.basePurchaseCost == null ? null : Number(product.basePurchaseCost) * Number(uom.conversionFactor) })), prices: product.prices.map((price) => ({ uomId: price.uomId, amount: Number(price.amount) })), stock: product.stockSnapshots[0] ? Number(product.stockSnapshots[0].quantity) : null })), total, offset: safeOffset, nextOffset: safeOffset + products.length < total ? safeOffset + products.length : null };
  }
  async lookup(companyId: string, query: string, priceLevelId?: string, locationId?: string, includeStructure = false, related = false) {
    const term = query.trim();
    if (!term) return includeStructure ? { items: [], interpretation: null, exact: true, relatedAvailable: false } : [];
    const include = {
      uoms: { orderBy: [{ isBase: 'desc' as const }, { name: 'asc' as const }] }, barcodes: true, aliases: true,
      prices: { where: priceLevelId ? { priceLevelId } : undefined }, stockSnapshots: { where: locationId ? { locationId } : undefined },
    } satisfies Prisma.ProductInclude;
      // Barcode is intentionally checked before SKU. Keeping these as separate
      // queries makes the documented precedence deterministic when identifiers
      // happen to collide across products.
      const exactBarcode = await this.db.product.findFirst({
        where: { companyId, active: true, barcodes: { some: { barcode: term } } }, include,
      });
      const exactIdentifier = exactBarcode ?? await this.db.product.findFirst({
        where: { companyId, active: true, sku: { equals: term, mode: 'insensitive' } }, include,
      });
    if (exactIdentifier) {
      const items = [{ ...exactIdentifier, matchedAlias: null }];
      return includeStructure ? { items, interpretation: null, exact: true, relatedAvailable: false } : items;
    }
    const interpretation = parseStructuredHardwareQuery(term);
    if (interpretation.unsafeShorthandOnly) return includeStructure ? { items: [], interpretation, exact: true, relatedAvailable: false } : [];
    if (interpretation.structured) {
      const exactConditions: Prisma.ProductWhereInput[] = [];
      if (interpretation.dimension) exactConditions.push({ searchDimensions: { has: interpretation.dimension } });
      if (interpretation.material) exactConditions.push({ searchMaterials: { has: interpretation.material } });
      if (interpretation.productType) exactConditions.push({ searchProductTypes: { has: interpretation.productType } });
      const relatedConditions = exactConditions;
      const candidates = await this.db.product.findMany({
        where: { companyId, active: true, ...(related ? { OR: relatedConditions } : { AND: exactConditions }) }, include,
        orderBy: [{ name: 'asc' }, { id: 'asc' }], take: related ? 100 : 50,
      });
        const normalizedQuery = normalizeProductText(term).token;
        const scored = candidates.map((product) => ({ product, score: structuredRelatedScore(product, interpretation), specificity: structuredMatchSpecificity(product, interpretation), exactName: normalizeProductText(product.name).token === normalizedQuery }));
      const minimumRelatedScore = Math.max(1, [interpretation.dimension, interpretation.material, interpretation.productType].filter(Boolean).length - 1);
      const matched = (related
          ? scored.filter((entry) => entry.score >= minimumRelatedScore).sort((left, right) => right.score - left.score || left.specificity - right.specificity || left.product.name.localeCompare(right.product.name))
          : scored.filter((entry) => matchesStructuredProduct(entry.product, interpretation)).sort((left, right) => Number(right.exactName) - Number(left.exactName) || left.specificity - right.specificity || left.product.name.localeCompare(right.product.name)))
        .slice(0, 20).map((entry) => ({ ...entry.product, matchedAlias: null }));
      if (!includeStructure) return matched;
      if (related) return { items: matched, interpretation, exact: false, relatedAvailable: false };
      if (matched.length) return { items: matched, interpretation, exact: true, relatedAvailable: false };
      const relatedCandidate = await this.db.product.findFirst({ where: { companyId, active: true, OR: relatedConditions }, select: { id: true } });
      return { items: [], interpretation, exact: true, relatedAvailable: Boolean(relatedCandidate) };
    }
    const expanded = expandedSearchTerms(term);
    const normalized = expanded.map(normalizeProductText);
    if (!normalized[0].token) return [];
    let products = await this.db.product.findMany({
      where: {
        companyId, active: true,
        OR: expanded.flatMap((value, index) => [
          { sku: { equals: value, mode: 'insensitive' as const } },
          { name: { contains: value, mode: 'insensitive' as const } },
          { supplierDescription: { contains: value, mode: 'insensitive' as const } },
          { category: { contains: value, mode: 'insensitive' as const } },
          { barcodes: { some: { barcode: value } } },
          { aliases: { some: { OR: [
            { normalizedToken: { contains: normalized[index].token } },
            { normalizedCompact: { contains: normalized[index].compact } },
          ] } } },
        ]),
      },
      include,
      take: 100,
    });
    let ranked = products.map((product) => {
      const direct = rankProduct(product, term);
      const expandedMatch = direct ? null : expanded.map((value) => ({ value, result: rankProduct(product, value) })).filter((match) => match.result).sort((a, b) => a.result!.rank - b.result!.rank)[0];
      const result = direct ?? expandedMatch?.result;
      return result ? { product, rank: result.rank, matchedAlias: result.matchedAlias ?? (expandedMatch ? term : null) } : null;
    }).filter((result): result is { product: typeof products[number]; rank: number; matchedAlias: string | null } => Boolean(result));
    if (!ranked.length && normalized[0].compact.length >= 4) {
      products = await this.db.product.findMany({ where: { companyId, active: true }, include, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 250 });
      ranked = products.map((product) => { const result = fuzzyProduct(product, term); return result ? { product, rank: result.rank, matchedAlias: result.matchedAlias } : null; }).filter((result): result is { product: typeof products[number]; rank: number; matchedAlias: string | null } => Boolean(result));
    }
    const items = ranked.sort((a, b) => a.rank - b.rank || a.product.name.localeCompare(b.product.name) || a.product.id.localeCompare(b.product.id))
      .slice(0, 20)
      .map(({ product, matchedAlias }) => ({ ...product, matchedAlias }));
    return includeStructure ? { items, interpretation: null, exact: true, relatedAvailable: false } : items;
  }

  async adjustStock(productId: string, input: StockAdjustmentDto) {
    const [actor, product, location] = await Promise.all([
      this.db.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
      this.db.product.findFirst({ where: { id: productId, companyId: input.companyId }, include: { uoms: true } }),
      this.db.location.findFirst({ where: { id: input.locationId, companyId: input.companyId } }),
    ]);
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!actor || !permissions.includes('stock.adjust')) throw new ForbiddenException('Manager access is required for stock adjustment');
    if (!product || !location) throw new BadRequestException('Product or store was not found');
    if (!product.trackStock) throw new BadRequestException('This product does not track stock');
    if (!input.reason.trim()) throw new BadRequestException('A stock-adjustment reason is required');

    return this.db.$transaction(async (tx) => {
      const existing = await tx.stockSnapshot.findUnique({ where: { locationId_productId: { locationId: location.id, productId: product.id } } });
      const previousQuantity = existing?.quantity ?? new Prisma.Decimal(0);
      const countedQuantity = new Prisma.Decimal(input.countedQuantity);
      const quantityDelta = countedQuantity.sub(previousQuantity);
      const uom = product.uoms.find((candidate) => candidate.isBase) ?? product.uoms[0];
      if (!uom) throw new BadRequestException('This product has no stock unit');
      if (product.fifoEnabledAt && quantityDelta.greaterThan(0) && input.unitCost == null) throw new BadRequestException('An explicit unit cost is required when a FIFO stock count increases inventory');
      if (input.fifoOverrideBatchId && (!quantityDelta.isNegative() || !input.fifoOverrideReason?.trim())) throw new BadRequestException('A negative FIFO override requires a selected batch and reason');
      const adjustmentReference = `COUNT-${product.id}-${Date.now()}`;
      const fifo = product.fifoEnabledAt ? await adjustFifoInventory(tx, { companyId: input.companyId, locationId: location.id, productId: product.id, uomId: uom.id, delta: quantityDelta, unitCost: input.unitCost == null ? null : new Prisma.Decimal(input.unitCost), actorId: actor.id, approvedById: actor.id, reason: input.reason.trim(), referenceId: adjustmentReference, override: input.fifoOverrideBatchId ? { batchId: input.fifoOverrideBatchId, reason: input.fifoOverrideReason!.trim(), approvedById: actor.id } : undefined, shortageAcknowledged: Boolean(input.stockShortageAcknowledged), occurredAt: new Date() }) : null;
      const snapshot = await tx.stockSnapshot.upsert({
        where: { locationId_productId: { locationId: location.id, productId: product.id } },
        update: { quantity: input.countedQuantity, capturedAt: new Date() },
        create: { locationId: location.id, productId: product.id, quantity: input.countedQuantity },
      });
      const audit = await tx.auditLog.create({ data: { companyId: input.companyId, actorId: actor.id, action: 'STOCK_COUNT_SET', entityType: 'StockSnapshot', entityId: snapshot.id, reason: input.reason.trim(), before: { quantity: Number(previousQuantity) }, after: { quantity: input.countedQuantity, productId: product.id, locationId: location.id, fifoAllocations: fifo?.allocations.map((allocation) => ({ inventoryBatchId: allocation.inventoryBatchId, quantity: allocation.quantity.toFixed(4), unitCost: allocation.unitCost?.toFixed(4) ?? null, value: allocation.value?.toFixed(4) ?? null, override: allocation.override })) ?? null } } });
      const latest = await latestInventoryCost(tx, input.companyId, location.id, product.id);
      const unitCost = fifo ? (fifo.valueDelta == null || quantityDelta.isZero() ? null : fifo.valueDelta.abs().div(quantityDelta.abs())) : latest?.averageUnitCost ?? product.basePurchaseCost;
      const valueDelta = fifo ? fifo.valueDelta : unitCost == null ? null : quantityDelta.mul(unitCost);
      const priorValue = latest?.runningValue ?? (unitCost == null ? null : previousQuantity.mul(unitCost));
      const status = fifo?.status ?? (unitCost == null ? 'UNVALUED' : countedQuantity.lessThan(0) ? 'PROVISIONAL' : 'FINAL');
      await recordInventoryLedger(tx, { companyId: input.companyId, locationId: location.id, productId: product.id, actorId: actor.id, approvedById: actor.id, type: 'ADJUSTMENT', sourceType: 'STAFF_COUNT', countedQuantity, quantityDelta, unitCost, valueDelta, runningQuantity: countedQuantity, runningValue: priorValue == null || valueDelta == null ? null : priorValue.add(valueDelta), averageUnitCost: product.fifoEnabledAt ? null : unitCost, costStatus: status, referenceType: 'ADJUSTMENT', referenceId: audit.id, reason: input.reason.trim() });
      if (fifo) await assertFifoStockInvariant(tx, { companyId: input.companyId, locationId: location.id, productId: product.id });
      return { productId: product.id, productName: product.name, previousQuantity: Number(existing?.quantity ?? 0), countedQuantity: Number(snapshot.quantity), location: location.name };
    });
  }
}
