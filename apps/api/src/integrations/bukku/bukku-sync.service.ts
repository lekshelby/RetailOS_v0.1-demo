import { Injectable } from '@nestjs/common';
import { Product, ProductUOM } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BukkuAdapter } from './bukku.adapter';
import { BukkuProductCatalogue, BukkuProductPriceType } from './bukku.types';
import { generatedAliasesForProduct, normalizeProductText, structuredSearchFieldsForProduct } from '../../products/product-search';

type DetailUnit = { id?: number | string; unit_id?: number | string; unit_price?: number | string };
type ProductDetail = { id?: number | string; product_id?: number | string; base_unit_id?: number | string; units?: DetailUnit[] };
type ImportedProduct = { product: Product; units: Map<string, ProductUOM>; refreshPrices: boolean };

@Injectable()
export class BukkuSyncService {
  constructor(private readonly db: PrismaService, private readonly bukku: BukkuAdapter) {}

  async importProducts(companyId: string) {
    const company = await this.db.company.findUniqueOrThrow({ where: { id: companyId }, include: { locations: true } });
    const catalogue = await this.bukku.pullProductCatalogue(company.bukkuProductVersion ?? undefined);
    if (catalogue.notChanged) {
      await this.db.auditLog.create({ data: { companyId, action: 'BUKKU_PRODUCTS_UNCHANGED', entityType: 'BukkuSync', after: { version: company.bukkuProductVersion } } });
      return { notChanged: true, version: company.bukkuProductVersion, created: 0, updated: 0, deactivated: 0, bundlesSkipped: 0, priceRequests: 0, priceFailures: 0, stockImported: false };
    }

    const priceLevel = await this.db.priceLevel.upsert({ where: { companyId_code: { companyId, code: 'RETAIL' } }, update: { name: 'Retail' }, create: { companyId, name: 'Retail', code: 'RETAIL' } });
    const stockLocation = company.locations.length === 1 ? company.locations[0] : undefined;
    const imported = new Map<string, ImportedProduct>();
    let created = 0; let updated = 0; let deactivated = 0; let bundlesSkipped = 0; let barcodeConflicts = 0;

    for (const item of catalogue.products) {
      const result = await this.upsertCatalogueProduct(companyId, item, stockLocation?.id);
      if (result.kind === 'bundle') { bundlesSkipped++; continue; }
      if (result.kind === 'deactivated') { deactivated++; continue; }
      if (result.kind === 'created') created++; else updated++;
      barcodeConflicts += result.barcodeConflicts;
      imported.set(item.externalId, { product: result.product, units: result.units, refreshPrices: result.refreshPrices });
    }

    const saleIds = catalogue.products.filter((item) => item.isSelling && !item.archived && !item.bundle && imported.get(item.externalId)?.refreshPrices).map((item) => item.externalId);
    const purchaseIds = catalogue.products.filter((item) => item.isBuying && !item.archived && !item.bundle && imported.get(item.externalId)?.refreshPrices).map((item) => item.externalId);
    const sale = await this.importPrices(priceLevel.id, saleIds, 'SALE', imported);
    const purchase = await this.importPrices(priceLevel.id, purchaseIds, 'PURCHASE', imported);
    await this.db.company.update({ where: { id: companyId }, data: { bukkuProductVersion: catalogue.version ?? company.bukkuProductVersion } });
    const after = { created, updated, deactivated, bundlesSkipped, barcodeConflicts, salePriceRequests: sale.requests, purchasePriceRequests: purchase.requests, priceFailures: sale.failures + purchase.failures, version: catalogue.version, stockImported: Boolean(stockLocation) };
    await this.db.auditLog.create({ data: { companyId, action: 'BUKKU_PRODUCTS_IMPORTED', entityType: 'BukkuSync', after } });
    return { notChanged: false, ...after };
  }

  async importContacts(companyId: string) {
    const contacts = await this.allContacts(); let created = 0; let updated = 0;
    for (const item of contacts) {
      const raw = item.raw as { email?: string; phone_no?: string; display_name?: string; legal_name?: string };
      const existingRef = await this.db.externalReference.findUnique({ where: { companyId_provider_entityType_externalId: { companyId, provider: 'BUKKU', entityType: 'CUSTOMER', externalId: item.externalId } } });
      const existing = existingRef ? await this.db.customer.findUnique({ where: { id: existingRef.localId } }) : null;
      const customer = existing
        ? await this.db.customer.update({ where: { id: existing.id }, data: { name: item.name ?? existing.name, email: raw.email, phone: raw.phone_no } })
        : await this.db.customer.create({ data: { companyId, name: item.name ?? 'Unnamed Bukku contact', email: raw.email, phone: raw.phone_no } });
      if (existing) updated++; else created++;
      await this.db.externalReference.upsert({ where: { companyId_provider_entityType_localId: { companyId, provider: 'BUKKU', entityType: 'CUSTOMER', localId: customer.id } }, update: { externalId: item.externalId, syncedAt: new Date() }, create: { companyId, provider: 'BUKKU', entityType: 'CUSTOMER', localId: customer.id, externalId: item.externalId } });
    }
    await this.db.auditLog.create({ data: { companyId, action: 'BUKKU_CONTACTS_IMPORTED', entityType: 'BukkuSync', after: { created, updated } } });
    return { created, updated };
  }

  private async upsertCatalogueProduct(companyId: string, item: BukkuProductCatalogue['products'][number], stockLocationId?: string) {
    const ref = await this.db.externalReference.findUnique({ where: { companyId_provider_entityType_externalId: { companyId, provider: 'BUKKU', entityType: 'PRODUCT', externalId: item.externalId } } });
    if (item.bundle) {
      if (ref) await this.db.product.update({ where: { id: ref.localId }, data: { active: false, bukkuType: item.type } });
      return { kind: 'bundle' as const };
    }
    const requestedSku = item.sku?.trim() || `BUKKU-${item.externalId}`;
    const skuMatch = ref ? undefined : await this.db.product.findFirst({ where: { companyId, sku: requestedSku } });
    const skuReference = skuMatch ? await this.db.externalReference.findFirst({ where: { companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: skuMatch.id } }) : undefined;
    const product = ref ? await this.db.product.findUniqueOrThrow({ where: { id: ref.localId } }) : (!skuReference || skuReference.externalId === item.externalId ? skuMatch : undefined);
    if (product) {
      const pending = await this.db.syncJob.findFirst({ where: { companyId, entityType: 'PRODUCT', entityId: product.id, action: 'BUKKU_PRODUCT_UPDATE_PENDING', status: { in: ['PENDING', 'RUNNING'] } } });
      if (pending) {
        const uoms = await this.db.productUOM.findMany({ where: { productId: product.id } });
        const unitRefs = await this.db.externalReference.findMany({ where: { companyId, provider: 'BUKKU', entityType: 'PRODUCT_UNIT', localId: { in: uoms.map((unit) => unit.id) } } });
        const byId = new Map(uoms.map((unit) => [unit.id, unit]));
        return { kind: 'updated' as const, product, units: new Map(unitRefs.flatMap((unit) => { const local = byId.get(unit.localId); return local ? [[unit.externalId, local] as const] : []; })), barcodeConflicts: 0, refreshPrices: false };
      }
    }
    const sku = product?.sku ?? await this.availableProductSku(companyId, requestedSku, item.externalId);
    const catalogHash = this.catalogHash(item);
    const active = !item.archived && item.isSelling !== false;
    const name = item.name?.trim() || product?.name || `Bukku product ${item.externalId}`;
    const category = item.type ?? product?.category;
    const data = { sku, name, category, classificationCode: item.classificationCode, bukkuType: item.type, bukkuCatalogHash: catalogHash, trackStock: item.trackInventory ?? product?.trackStock ?? true, active, ...structuredSearchFieldsForProduct([name, product?.supplierDescription, category]) };
    const saved = product ? await this.db.product.update({ where: { id: product.id }, data }) : await this.db.product.create({ data: { companyId, ...data } });
    await this.refreshGeneratedAliases(saved.id, [saved.name, saved.supplierDescription, saved.category]);
    await this.db.externalReference.upsert({ where: { companyId_provider_entityType_localId: { companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: saved.id } }, update: { externalId: item.externalId, syncedAt: new Date() }, create: { companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: saved.id, externalId: item.externalId } });
    const units = await this.upsertUnits(companyId, saved.id, item.units);
    const barcodeConflicts = await this.upsertBarcodes(saved.id, item.barcode, units);
    if (stockLocationId && saved.trackStock && item.quantity != null) await this.db.stockSnapshot.upsert({ where: { locationId_productId: { locationId: stockLocationId, productId: saved.id } }, update: { quantity: item.quantity, capturedAt: new Date() }, create: { locationId: stockLocationId, productId: saved.id, quantity: item.quantity } });
    return { kind: product ? (active ? 'updated' as const : 'deactivated' as const) : 'created' as const, product: saved, units, barcodeConflicts, refreshPrices: !product || product.bukkuCatalogHash !== catalogHash };
  }

  private async upsertUnits(companyId: string, productId: string, units: BukkuProductCatalogue['products'][number]['units']) {
    const mapped = new Map<string, ProductUOM>();
    for (const unit of units) {
      const ref = await this.db.externalReference.findUnique({ where: { companyId_provider_entityType_externalId: { companyId, provider: 'BUKKU', entityType: 'PRODUCT_UNIT', externalId: unit.externalId } } });
      const existing = ref ? await this.db.productUOM.findUnique({ where: { id: ref.localId } }) : undefined;
      const preferred = this.unitCode(unit.label, unit.externalId);
      const code = existing?.code ?? await this.availableUnitCode(productId, preferred, unit.externalId);
      const uom = existing ? await this.db.productUOM.update({ where: { id: existing.id }, data: { name: unit.label ?? existing.name, conversionFactor: unit.rate ?? existing.conversionFactor, isBase: Boolean(unit.isBase) } }) : await this.db.productUOM.create({ data: { productId, code, name: unit.label ?? `Unit ${unit.externalId}`, conversionFactor: unit.rate ?? 1, isBase: Boolean(unit.isBase) } });
      await this.db.externalReference.upsert({ where: { companyId_provider_entityType_localId: { companyId, provider: 'BUKKU', entityType: 'PRODUCT_UNIT', localId: uom.id } }, update: { externalId: unit.externalId, syncedAt: new Date() }, create: { companyId, provider: 'BUKKU', entityType: 'PRODUCT_UNIT', localId: uom.id, externalId: unit.externalId } });
      mapped.set(unit.externalId, uom);
    }
    return mapped;
  }

  private async upsertBarcodes(productId: string, value: string | string[] | undefined, units: Map<string, ProductUOM>) {
    const codes = (Array.isArray(value) ? value : value ? [value] : []).map((barcode) => barcode.trim()).filter(Boolean);
    let conflicts = 0;
    for (const barcode of new Set(codes)) {
      const existing = await this.db.productBarcode.findUnique({ where: { barcode } });
      if (existing && existing.productId !== productId) { conflicts++; continue; }
      const defaultUnit = [...units.values()].find((unit) => unit.isBase) ?? [...units.values()][0];
      if (existing) await this.db.productBarcode.update({ where: { id: existing.id }, data: { uomId: defaultUnit?.id } });
      else await this.db.productBarcode.create({ data: { productId, barcode, uomId: defaultUnit?.id } });
    }
    return conflicts;
  }

  private async refreshGeneratedAliases(productId: string, values: Array<string | null | undefined>) {
    const aliases = generatedAliasesForProduct(values);
    await this.db.$transaction(async (tx) => {
      await tx.productAlias.deleteMany({ where: { productId, source: 'GENERATED' } });
      if (aliases.length) await tx.productAlias.createMany({
        data: aliases.map((text) => {
          const normalized = normalizeProductText(text);
          return { productId, text, normalizedToken: normalized.token, normalizedCompact: normalized.compact, source: 'GENERATED' as const };
        }),
        skipDuplicates: true,
      });
    });
  }

  private async importPrices(priceLevelId: string, ids: string[], type: BukkuProductPriceType, imported: Map<string, ImportedProduct>) {
    let requests = 0; let failures = 0;
    for (const idsInBatch of this.chunks(ids, 50)) {
      const outcome = await this.detailsWithIsolation(idsInBatch, type); requests += outcome.requests; failures += outcome.failures;
      for (const detailResponse of outcome.details) {
        const externalId = detailResponse.externalProductId;
        const importedProduct = externalId ? imported.get(externalId) : undefined;
        if (!importedProduct) continue;
        const detail = detailResponse.raw as ProductDetail;
        const baseUnit = importedProduct.units.get(String(detail.base_unit_id ?? ''));
        if (baseUnit && !baseUnit.isBase) {
          await this.db.productUOM.updateMany({ where: { productId: importedProduct.product.id }, data: { isBase: false } });
          const updatedBase = await this.db.productUOM.update({ where: { id: baseUnit.id }, data: { isBase: true } });
          importedProduct.units.set(String(detail.base_unit_id), updatedBase);
        }
        for (const unit of detail.units ?? []) {
          const uom = importedProduct.units.get(String(unit.unit_id ?? unit.id ?? ''));
          const amount = Number(unit.unit_price);
          if (!uom || !Number.isFinite(amount) || amount < 0) continue;
          if (type === 'SALE') await this.db.productPrice.upsert({ where: { productId_priceLevelId_uomId: { productId: importedProduct.product.id, priceLevelId, uomId: uom.id } }, update: { amount }, create: { productId: importedProduct.product.id, priceLevelId, uomId: uom.id, amount } });
          // Bukku purchase prices are accounting-source data, not an inventory receipt.
          // RetailOS stock and FIFO batches change only through an approved
          // PurchaseReceipt, so catalogue sync deliberately does not persist COST here.
        }
      }
      await this.pause(125);
    }
    return { requests, failures };
  }

  private async detailsWithIsolation(ids: string[], type: BukkuProductPriceType): Promise<{ details: Awaited<ReturnType<BukkuAdapter['pullProductDetails']>>; requests: number; failures: number }> {
    try { return { details: await this.bukku.pullProductDetails(ids, type), requests: 1, failures: 0 }; }
    catch {
      if (ids.length === 1) return { details: [], requests: 1, failures: 1 };
      const midpoint = Math.ceil(ids.length / 2);
      const left = await this.detailsWithIsolation(ids.slice(0, midpoint), type);
      const right = await this.detailsWithIsolation(ids.slice(midpoint), type);
      return { details: [...left.details, ...right.details], requests: 1 + left.requests + right.requests, failures: left.failures + right.failures };
    }
  }

  private async allContacts() { const all = []; let cursor: string | undefined; do { const page = await this.bukku.pullContacts({ cursor, limit: 50 }); all.push(...page.items); cursor = page.nextCursor; } while (cursor); return all; }
  private chunks<T>(items: T[], size: number) { return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size)); }
  private async availableProductSku(companyId: string, preferred: string, externalId: string) {
    const safePreferred = preferred.slice(0, 100);
    const found = await this.db.product.findFirst({ where: { companyId, sku: safePreferred } });
    if (!found) return safePreferred;
    return `BUKKU-${externalId}`;
  }
  private async availableUnitCode(productId: string, preferred: string, externalId: string) { const found = await this.db.productUOM.findUnique({ where: { productId_code: { productId, code: preferred } } }); return found ? `${preferred.slice(0, 22)}_${externalId}`.slice(0, 32) : preferred; }
  private unitCode(label: string | undefined, externalId: string) { const normalized = (label ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32); return normalized || `UNIT_${externalId}`; }
  private catalogHash(item: BukkuProductCatalogue['products'][number]) { return JSON.stringify({ sku: item.sku, name: item.name, barcode: item.barcode, classificationCode: item.classificationCode, trackInventory: item.trackInventory, isSelling: item.isSelling, isBuying: item.isBuying, type: item.type, archived: item.archived, updatedAt: item.updatedAt, units: item.units.map((unit) => [unit.externalId, unit.label, unit.rate, unit.isBase]) }); }
  private pause(milliseconds: number) { return new Promise<void>((resolve) => setTimeout(resolve, milliseconds)); }
}
