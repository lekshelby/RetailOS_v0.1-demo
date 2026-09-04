import { PrismaService } from '../../database/prisma.service';
import { BukkuAdapter } from './bukku.adapter';
import { BukkuSyncService } from './bukku-sync.service';

describe('Bukku catalogue inventory ownership', () => {
  it('never imports Bukku catalogue quantity into RetailOS stock', async () => {
    const saved = { id: 'product-1', companyId: 'company-1', sku: 'SKU-1', name: 'Pipe', supplierDescription: null, category: null, trackStock: true, active: true, bukkuCatalogHash: null };
    const db = {
      externalReference: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
      product: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(saved) },
      productUOM: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'uom-1', productId: saved.id, code: 'EA', name: 'Each', conversionFactor: 1, isBase: true }) },
      productBarcode: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      productAlias: { deleteMany: jest.fn(), createMany: jest.fn() },
      stockSnapshot: { upsert: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db)),
    } as unknown as PrismaService;
    const service = new BukkuSyncService(db, {} as BukkuAdapter);

    const result = await (service as unknown as { upsertCatalogueProduct(companyId: string, item: unknown): Promise<{ kind: string }> }).upsertCatalogueProduct('company-1', {
      externalId: '100', sku: 'SKU-1', name: 'Pipe', quantity: 999, trackInventory: true, isSelling: true, isBuying: true, archived: false, bundle: false,
      units: [{ externalId: '10', label: 'EA', rate: 1, isBase: true }], raw: {},
    });

    expect(result.kind).toBe('created');
    expect(db.stockSnapshot.upsert).not.toHaveBeenCalled();
  });
});
