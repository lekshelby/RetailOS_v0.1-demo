import { Logger } from '@nestjs/common';
import { BukkuAutoSyncService } from './bukku-auto-sync.service';

describe('BukkuAutoSyncService scheduled sync resilience', () => {
  afterEach(() => jest.restoreAllMocks());

  it('records and contains a Bukku outage instead of rejecting the scheduled task', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const db = {
      shift: {
        findMany: jest.fn().mockResolvedValue([
          { cashierId: 'cashier-1', location: { companyId: 'company-1' } },
        ]),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const client = { isConfigured: jest.fn().mockReturnValue(true) };
    const sync = {
      importProducts: jest.fn().mockRejectedValue(new Error('Bukku is unreachable')),
      importContacts: jest.fn(),
    };
    const service = new BukkuAutoSyncService(db as never, client as never, sync as never);

    await expect((service as unknown as { syncOpenShifts(): Promise<void> }).syncOpenShifts()).resolves.toBeUndefined();
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'BUKKU_SYNC_FAILED' }),
    }));
  });

  it('contains an open-shift lookup failure', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const db = {
      shift: { findMany: jest.fn().mockRejectedValue(new Error('database unavailable')) },
    };
    const service = new BukkuAutoSyncService(
      db as never,
      { isConfigured: jest.fn() } as never,
      {} as never,
    );

    await expect((service as unknown as { syncOpenShifts(): Promise<void> }).syncOpenShifts()).resolves.toBeUndefined();
  });

  it('allows an operational cashier with sync.run to start a manual sync', async () => {
    const db = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'cashier-1', role: { permissions: ['checkout', 'sync.run'] } }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const client = { isConfigured: jest.fn().mockReturnValue(false) };
    const service = new BukkuAutoSyncService(db as never, client as never, {} as never);

    await expect(service.syncNow('company-1', 'cashier-1')).resolves.toEqual({ skipped: true, reason: 'Bukku is not configured' });
  });
});
