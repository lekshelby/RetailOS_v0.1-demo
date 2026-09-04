import { ForbiddenException } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

describe('ProductsController operational catalogue authorization', () => {
  const request = (permissions: string[]) => ({ retailosSession: { permissions } });

  it.each(['catalog', 'lookup'] as const)('rejects %s without checkout permission', async (operation) => {
    const products = { catalog: jest.fn(), lookup: jest.fn() } as unknown as ProductsService;
    const controller = new ProductsController(products);
    const invoke = operation === 'catalog'
      ? () => controller.catalog(request(['catalog.manage']), 'company-1')
      : () => controller.lookup(request(['catalog.manage']), 'company-1', 'pipe');
    expect(invoke).toThrow(ForbiddenException);
  });

  it('allows both cashier and manager sessions that hold checkout permission', () => {
    const products = { catalog: jest.fn().mockReturnValue({ items: [] }), lookup: jest.fn().mockReturnValue([]) } as unknown as ProductsService;
    const controller = new ProductsController(products);
    expect(controller.catalog(request(['checkout']), 'company-1')).toEqual({ items: [] });
    expect(controller.lookup(request(['checkout', 'catalog.manage']), 'company-1', '1/2 ss n')).toEqual([]);
  });
});
