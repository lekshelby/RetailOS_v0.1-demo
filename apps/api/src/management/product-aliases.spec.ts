import { ForbiddenException } from '@nestjs/common';
import { ManagementService } from './management.service';

describe('manager-only product aliases', () => {
  it('denies alias creation without catalogue-management permission', async () => {
    const db = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'cashier', role: { permissions: [] } }) },
      productAlias: { create: jest.fn() },
    };
    const service = new ManagementService(db as never, {} as never);
    await expect(service.addProductAlias('product-1', { companyId: 'company-1', actorId: 'cashier', text: 'r/bush' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.productAlias.create).not.toHaveBeenCalled();
  });

  it('stores normalized manual aliases and an audit record for a manager', async () => {
    const db = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'manager', role: { permissions: ['catalog.manage'] } }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-1', name: 'REDUCING BUSH', supplierDescription: null, category: 'Fittings', searchDimensions: [], searchMaterials: [], searchProductTypes: ['REDUCING_BUSH'] }), update: jest.fn().mockResolvedValue({}) },
      productAlias: { create: jest.fn().mockResolvedValue({ id: 'alias-1', text: 'r/bush' }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new ManagementService(db as never, {} as never);
    await service.addProductAlias('product-1', { companyId: 'company-1', actorId: 'manager', text: ' r/bush ' });
    expect(db.productAlias.create).toHaveBeenCalledWith({ data: expect.objectContaining({ normalizedToken: 'r bush', normalizedCompact: 'rbush', source: 'MANUAL', createdById: 'manager' }) });
    expect(db.product.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ searchProductTypes: ['REDUCING_BUSH'] }) }));
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'PRODUCT_ALIAS_CREATED' }) }));
  });
});
