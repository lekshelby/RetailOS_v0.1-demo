import { PrismaService } from '../database/prisma.service';
import { structuredSearchFieldsForProduct } from './product-search';
import { ProductsService } from './products.service';

const row = (id: string, name: string) => ({
  id, companyId: 'company-1', sku: `SKU-${id}`, name, supplierDescription: null, category: 'Hardware', active: true,
  aliases: [], barcodes: [], uoms: [], prices: [], stockSnapshots: [], ...structuredSearchFieldsForProduct([name]),
});

describe('ProductsService structured hardware lookup', () => {
  it('returns only the full intersection for 1/2 ss n', async () => {
    const db = { product: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([
      row('match', '1/2" S/STEEL NIPPLE'), row('wrong-size', '10" S/STEEL NIPPLE'), row('wrong-type', '1/2" S/STEEL BEND'),
    ]) } } as unknown as PrismaService;
    const result = await new ProductsService(db).lookup('company-1', '1/2 ss n', undefined, undefined, true) as { items: Array<{ id: string }>; interpretation: { dimension: string }; exact: boolean };
    expect(result.items.map((item) => item.id)).toEqual(['match']);
    expect(result.interpretation.dimension).toBe('1/2"');
    expect(result.exact).toBe(true);
  });

  it('ranks a direct half-inch nipple before compound reducing nipples', async () => {
    const db = { product: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([
      row('compound', '1/2" X 3/8" S/STEEL REDUCING NIPPLE'), row('exact', '1/2" S/STEEL NIPPLE'),
    ]) } } as unknown as PrismaService;
    const result = await new ProductsService(db).lookup('company-1', '1/2 ss n', undefined, undefined, true) as { items: Array<{ id: string }> };
    expect(result.items.map((item) => item.id)).toEqual(['exact', 'compound']);
  });

  it('ranks an exact full product name above hose, KC, and reducing nipples', async () => {
    const db = { product: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([
      row('hose', '1/2" S/STEEL HOSE NIPPLE'), row('kc', '1/2" S/STEEL KC NIPPLE'),
      row('reducing', '1/2" X 3/8" S/STEEL REDUCING NIPPLE'), row('exact', '1/2" S/STEEL NIPPLE'),
    ]) } } as unknown as PrismaService;
    const result = await new ProductsService(db).lookup('company-1', '1/2" S/STEEL NIPPLE', undefined, undefined, true) as { items: Array<{ id: string }> };
    expect(result.items[0].id).toBe('exact');
  });

  it('uses a fraction-only query as an exact structured dimension filter', async () => {
    const db = { product: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([
      row('half', '1/2" NIPPLE'), row('mixed', '1 1/2" NIPPLE'), row('number', '#12 NIPPLE'),
    ]) } } as unknown as PrismaService;
    const result = await new ProductsService(db).lookup('company-1', '1/2', undefined, undefined, true) as { items: Array<{ id: string }> };
    expect(result.items.map((item) => item.id)).toEqual(['half']);
  });

  it('returns only the full intersection for bare-inch 10 ms b', async () => {
    const db = { product: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([
      row('match', '10" M/S BEND'), row('wrong-material', '10" S/STEEL BEND'), row('wrong-type', '10" M/S NIPPLE'),
    ]) } } as unknown as PrismaService;
    const result = await new ProductsService(db).lookup('company-1', '10 ms b', undefined, undefined, true) as { items: Array<{ id: string }> };
    expect(result.items.map((item) => item.id)).toEqual(['match']);
  });

  it.each(['n', 'b'])('does not run a broad catalogue lookup for unsafe shorthand %s', async (query) => {
    const findMany = jest.fn();
    const db = { product: { findFirst: jest.fn().mockResolvedValue(null), findMany } } as unknown as PrismaService;
    const result = await new ProductsService(db).lookup('company-1', query, undefined, undefined, true) as { items: unknown[]; interpretation: { unsafeShorthandOnly: boolean } };
    expect(result.items).toEqual([]);
    expect(result.interpretation.unsafeShorthandOnly).toBe(true);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('keeps an exact SKU above structured parsing', async () => {
    const exact = row('sku', 'Unrelated display name'); exact.sku = '1/2 ss n';
    const findMany = jest.fn();
    const db = { product: { findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(exact), findMany } } as unknown as PrismaService;
    const result = await new ProductsService(db).lookup('company-1', '1/2 ss n', undefined, undefined, true) as { items: Array<{ id: string }> };
    expect(result.items[0].id).toBe('sku');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns an exact barcode alone before a colliding SKU', async () => {
    const barcode = row('barcode', 'Exact barcode product');
    const collidingSku = row('sku', 'Colliding SKU product'); collidingSku.sku = '102298';
    const findFirst = jest.fn().mockResolvedValueOnce(barcode).mockResolvedValueOnce(collidingSku);
    const findMany = jest.fn();
    const db = { product: { findFirst, findMany } } as unknown as PrismaService;
    const result = await new ProductsService(db).lookup('company-1', '102298', undefined, undefined, true) as { items: Array<{ id: string }> };
    expect(result.items.map((item) => item.id)).toEqual(['barcode']);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0][0].where.barcodes).toBeDefined();
    expect(findMany).not.toHaveBeenCalled();
  });
});
