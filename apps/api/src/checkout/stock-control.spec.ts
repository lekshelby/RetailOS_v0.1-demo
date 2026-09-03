import { Prisma } from '@prisma/client';
import { aggregateStockRequests } from './stock-control';

describe('stock checkout requests', () => {
  it('aggregates multiple sale units for the same tracked product exactly', () => {
    const requests = aggregateStockRequests([
      { productId: 'product-1', productName: 'Tracked pipe', sku: 'PIPE', trackStock: true, baseQuantity: new Prisma.Decimal('40') },
      { productId: 'product-1', productName: 'Tracked pipe', sku: 'PIPE', trackStock: true, baseQuantity: new Prisma.Decimal('61') },
      { productId: 'product-2', productName: 'Untracked service', sku: 'SERVICE', trackStock: false, baseQuantity: new Prisma.Decimal('999') },
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ productId: 'product-1', productName: 'Tracked pipe' });
    expect(requests[0].baseQuantity.toFixed()).toBe('101');
  });
});
