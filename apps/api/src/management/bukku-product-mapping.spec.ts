import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BukkuHttpClient } from '../integrations/bukku/bukku-http.client';
import { ManagementService } from './management.service';

const input = { companyId: 'company-1', actorId: 'manager-1', productId: 'product-1', bukkuItemId: '9001', bukkuItemCode: 'PIPE-001', bukkuDisplayName: 'Pipe', confirmed: true };

describe('Bukku product mapping', () => {
  it('denies cashier access with a clear 403 service error', async () => {
    const db = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'cashier-1', role: { permissions: ['checkout'] } }) } } as unknown as PrismaService;
    const service = new ManagementService(db, {} as BukkuHttpClient);
    await expect(service.listBukkuProductMappings({ companyId: 'company-1', actorId: 'cashier-1' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.approveBukkuProductMapping({ ...input, actorId: 'cashier-1' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a Bukku item already mapped to another RetailOS SKU', async () => {
    const db = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'manager-1', role: { permissions: ['company.manage'] } }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-1', sku: 'SKU-1', name: 'Pipe' }) },
      externalReference: { findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ localId: 'product-2', externalId: '9001' }) },
    } as unknown as PrismaService;
    const service = new ManagementService(db, {} as BukkuHttpClient);
    await expect(service.approveBukkuProductMapping(input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('persists only an explicit manager-approved SKU-to-item mapping and its audit', async () => {
    const saved = { id: 'reference-1', localId: 'product-1', externalId: '9001' };
    const tx = { externalReference: { upsert: jest.fn().mockResolvedValue(saved) }, auditLog: { create: jest.fn().mockResolvedValue({}) } };
    const db = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'manager-1', role: { permissions: ['company.manage'] } }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-1', sku: 'SKU-1', name: 'Pipe' }) },
      externalReference: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ManagementService(db, {} as BukkuHttpClient);

    await expect(service.approveBukkuProductMapping(input)).resolves.toMatchObject({ retailosSku: 'SKU-1', bukkuItemId: '9001', mappingStatus: 'APPROVED' });
    expect(tx.externalReference.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ localId: 'product-1', externalId: '9001' }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'BUKKU_PRODUCT_MAPPING_APPROVED', entityType: 'BukkuProductMapping', entityId: 'product-1', actorId: 'manager-1' }) });
  });
});
