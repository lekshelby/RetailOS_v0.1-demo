import { ForbiddenException } from '@nestjs/common';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../database/prisma.service';
import { BatchUpdateService } from './batch-update.service';
import { parseImportFile } from './batch-spreadsheet';

describe('Batch Update authorization and controlled template', () => {
  it('returns the single BOM CSV template to a manager', async () => {
    const db = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'manager', role: { permissions: ['backoffice.view', 'stock.adjust'] } }) } } as unknown as PrismaService;
    const file = await new BatchUpdateService(db, {} as SessionService).template({ companyId: 'disposable-company', actorId: 'manager' });
    expect(file.fileName).toBe('retailos-product-batch-template.csv');
    expect(file.content.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(parseImportFile(file.content, file.fileName)).toEqual([]);
  });

  it.each(['template download', 'import preview', 'batch result download'])('returns 403 for a cashier attempting %s', async (operation) => {
    const db = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'cashier', role: { permissions: ['checkout'] } }) } } as unknown as PrismaService;
    const service = new BatchUpdateService(db, {} as SessionService);
    const action = operation === 'template download'
      ? service.template({ companyId: 'disposable-company', actorId: 'cashier' })
      : operation === 'import preview'
        ? service.preview({ companyId: 'disposable-company', actorId: 'cashier', fileName: 'stock.csv', mimeType: 'text/csv', contentBase64: Buffer.from('x').toString('base64') })
        : service.result('batch-1', { companyId: 'disposable-company', actorId: 'cashier' });
    await expect(action).rejects.toBeInstanceOf(ForbiddenException);
  });
});
