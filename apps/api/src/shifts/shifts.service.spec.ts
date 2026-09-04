import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { PrismaService } from '../database/prisma.service';
import { BukkuAutoSyncService } from '../integrations/bukku/bukku-auto-sync.service';
import { BukkuAdapter } from '../integrations/bukku/bukku.adapter';
import { ThermalPrinterService } from '../checkout/thermal-printer.service';

describe('ShiftsService stock-shortage acknowledgement', () => {
  function closeReadyService(shortages: unknown[]) {
    const update = jest.fn().mockResolvedValue({ id: 'shift-1' }); const auditCreate = jest.fn();
    const db = {
      shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1', locationId: 'location-1' }), update },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'manager-1', role: { permissions: ['shift.close', 'shift.report.view'] } }) },
      auditLog: { create: auditCreate }, syncJob: { upsert: jest.fn().mockResolvedValue({ id: 'sync-1' }) },
    } as unknown as PrismaService;
    const service = new ShiftsService(db, {} as BukkuAutoSyncService, {} as BukkuAdapter, {} as ThermalPrinterService);
    jest.spyOn(service as unknown as { summary: (id: string) => Promise<unknown> }, 'summary').mockResolvedValue({ openingFloat: 0, cashSales: 0, cashRefunds: 0, cashIn: 0, cashOut: 0 });
    jest.spyOn(service as unknown as { negativeStockForShift: (id: string, locationId: string) => Promise<unknown[]> }, 'negativeStockForShift').mockResolvedValue([]);
    jest.spyOn(service as unknown as { stockShortagesForShift: (id: string, companyId: string) => Promise<unknown[]> }, 'stockShortagesForShift').mockResolvedValue(shortages);
    jest.spyOn(service as unknown as { createDailyDigest: (id: string, companyId: string) => Promise<unknown> }, 'createDailyDigest').mockResolvedValue({ fileName: 'digest.xlsx', businessDate: '2026-09-01', salesCount: 0, itemCount: 0, salesTotal: 0, paymentTotals: {} });
    jest.spyOn(service as unknown as { postDailyBukkuInvoice: (jobId: string, shiftId: string, companyId: string, date: string) => Promise<unknown> }, 'postDailyBukkuInvoice').mockResolvedValue({ status: 'SKIPPED' });
    const printReport = jest.spyOn(service, 'printReport').mockResolvedValue({ message: 'printed', transport: 'LAN_ESC_POS', jobId: '00000000-0000-0000-0000-000000000001' });
    return { service, update, auditCreate, printReport };
  }
  it('calculates shortages on the server and refuses close without acknowledgement before mutating the shift', async () => {
    const update = jest.fn();
    const db = {
      shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1', locationId: 'location-1' }), update },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'manager-1', role: { permissions: ['shift.close', 'shift.report.view'] } }) },
    } as unknown as PrismaService;
    const service = new ShiftsService(db, {} as BukkuAutoSyncService, {} as BukkuAdapter, {} as ThermalPrinterService);
    jest.spyOn(service as unknown as { summary: (id: string) => Promise<unknown> }, 'summary').mockResolvedValue({ openingFloat: 0, cashSales: 0, cashRefunds: 0, cashIn: 0, cashOut: 0 });
    jest.spyOn(service as unknown as { negativeStockForShift: (id: string, locationId: string) => Promise<unknown[]> }, 'negativeStockForShift').mockResolvedValue([]);
    jest.spyOn(service as unknown as { stockShortagesForShift: (id: string, companyId: string) => Promise<unknown[]> }, 'stockShortagesForShift').mockResolvedValue([{ receiptNo: 'TEST-1' }]);

    await expect(service.close('shift-1', { companyId: 'company-1', cashierId: 'cashier-1', managerId: 'manager-1', closingFloat: 0, stockShortageAcknowledged: false })).rejects.toThrow(UnprocessableEntityException);
    expect(update).not.toHaveBeenCalled();
  });

  it('corrects an accidental open-shift float only through an audited manager action', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'shift-1' }); const create = jest.fn();
    const db = {
      shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1', openingFloat: 200000 }), update },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'manager-1', role: { permissions: ['shift.report.view'] } }) },
      auditLog: { create },
    } as unknown as PrismaService;
    const service = new ShiftsService(db, {} as BukkuAutoSyncService, {} as BukkuAdapter, {} as ThermalPrinterService);
    jest.spyOn(service as unknown as { status: (id: string, companyId: string) => Promise<unknown> }, 'status').mockResolvedValue({ id: 'shift-1', openingFloat: 200 });

    await expect(service.correctOpeningFloat('shift-1', { companyId: 'company-1', managerId: 'manager-1', correctedOpeningFloat: 200, reason: 'Corrected accidental entry' })).resolves.toEqual({ id: 'shift-1', openingFloat: 200 });
    expect(update).toHaveBeenCalledWith({ where: { id: 'shift-1' }, data: { openingFloat: 200 } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'SHIFT_OPENING_FLOAT_CORRECTED', reason: 'Corrected accidental entry', before: { openingFloat: 200000 }, after: expect.objectContaining({ openingFloat: 200 }) }) }));
  });

  it('closes a shortage shift only after acknowledgement and writes immutable acknowledgement data', async () => {
    const { service, update, auditCreate } = closeReadyService([{ receiptNo: 'TEST-1', shortageIntroduced: 1 }]);
    await expect(service.close('shift-1', { companyId: 'company-1', cashierId: 'cashier-1', managerId: 'manager-1', closingFloat: 0, stockShortageAcknowledged: true })).resolves.toEqual(expect.objectContaining({ shiftId: 'shift-1' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ closedAt: expect.any(Date) }) }));
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'SHIFT_CLOSED', metadata: expect.objectContaining({ approvedById: 'manager-1', stockShortageAcknowledged: true, stockShortageAcknowledgedAt: expect.any(String) }) }) }));
  });

  it('closes a no-shortage shift without an acknowledgement', async () => {
    const { service, update, printReport } = closeReadyService([]);
    await expect(service.close('shift-1', { companyId: 'company-1', cashierId: 'cashier-1', managerId: 'manager-1', closingFloat: 0, stockShortageAcknowledged: false })).resolves.toEqual(expect.objectContaining({ shiftId: 'shift-1' }));
    expect(update).toHaveBeenCalled();
    expect(printReport).not.toHaveBeenCalled();
  });

  it('requires shift.open on the server before creating a shift', async () => {
    const create = jest.fn();
    const db = {
      location: { findFirst: jest.fn().mockResolvedValue({ id: 'location-1' }) },
      register: { findFirst: jest.fn().mockResolvedValue({ id: 'register-1' }) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'cashier-1', role: { permissions: ['checkout'] } }) },
      shift: { create },
    } as unknown as PrismaService;
    const service = new ShiftsService(db, {} as BukkuAutoSyncService, {} as BukkuAdapter, {} as ThermalPrinterService);

    await expect(service.open({ companyId: 'company-1', locationId: 'location-1', registerId: 'register-1', cashierId: 'cashier-1', openingFloat: 0 })).rejects.toThrow(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('collapses operational payments to cash and bank transfer for the shift-close report', () => {
    const service = new ShiftsService({} as PrismaService, {} as BukkuAutoSyncService, {} as BukkuAdapter, {} as ThermalPrinterService);
    expect((service as unknown as { shiftClosePaymentTotals: (source: Record<string, number>) => Record<string, number> }).shiftClosePaymentTotals({ CASH: 10, DUITNOW: 20, BANK_TRANSFER: 30, CARD: 40, OTHER: 5, STORE_CREDIT: 7 })).toEqual({ CASH: 10, BANK_TRANSFER: 95 });
  });

  it('denies a cashier close request even when a separate manager approval is supplied', async () => {
    const db = {
      shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1', locationId: 'location-1' }) },
      user: { findFirst: jest.fn()
        .mockResolvedValueOnce({ id: 'cashier-1' })
        .mockResolvedValueOnce({ id: 'cashier-1', role: { permissions: ['checkout', 'shift.open'] } })
        .mockResolvedValueOnce({ id: 'manager-1', role: { permissions: ['shift.close', 'shift.report.view'] } }) },
    } as unknown as PrismaService;
    const service = new ShiftsService(db, {} as BukkuAutoSyncService, {} as BukkuAdapter, {} as ThermalPrinterService);

    await expect(service.close('shift-1', { companyId: 'company-1', cashierId: 'cashier-1', managerId: 'manager-1', closingFloat: 0 })).rejects.toThrow(ForbiddenException);
  });

  it('auto-closes a stale shortage-free shift without a cash count or printer job', async () => {
    const auditCreate = jest.fn(); const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const db = {
      shift: { findMany: jest.fn().mockResolvedValue([{ id: 'shift-1', cashierId: 'cashier-1', locationId: 'location-1', openedAt: new Date('2026-09-03T15:00:00Z'), location: { company: { id: 'company-1', timezone: 'Asia/Kuala_Lumpur' } } }]), updateMany },
      auditLog: { findFirst: jest.fn().mockResolvedValue(null), create: auditCreate },
    } as unknown as PrismaService;
    const printer = { print: jest.fn() } as unknown as ThermalPrinterService;
    const service = new ShiftsService(db, {} as BukkuAutoSyncService, {} as BukkuAdapter, printer);
    jest.spyOn(service as unknown as { stockShortagesForShift: () => Promise<unknown[]> }, 'stockShortagesForShift').mockResolvedValue([]);
    jest.spyOn(service as unknown as { summary: () => Promise<unknown> }, 'summary').mockResolvedValue({ openingFloat: 0, cashSales: 0, cashRefunds: 0, cashIn: 0, cashOut: 0 });
    jest.spyOn(service as unknown as { finalizeClosedShiftDigest: () => Promise<unknown> }, 'finalizeClosedShiftDigest').mockResolvedValue(undefined);

    await service.autoCloseExpiredShifts(new Date('2026-09-04T16:01:00Z'));

    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'shift-1', closedAt: null }, data: { closedAt: new Date('2026-09-04T16:01:00Z') } });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'SHIFT_AUTO_CLOSED', metadata: expect.objectContaining({ reportPrinted: false, reportDelivery: 'MANUAL_DOWNLOAD' }) }) }));
    expect(printer.print).not.toHaveBeenCalled();
  });

  it('does not let midnight auto-close bypass shortage acknowledgement', async () => {
    const auditCreate = jest.fn(); const updateMany = jest.fn();
    const db = {
      shift: { findMany: jest.fn().mockResolvedValue([{ id: 'shift-1', cashierId: 'cashier-1', locationId: 'location-1', openedAt: new Date('2026-09-03T15:00:00Z'), location: { company: { id: 'company-1', timezone: 'Asia/Kuala_Lumpur' } } }]), updateMany },
      auditLog: { findFirst: jest.fn().mockResolvedValue(null), create: auditCreate },
    } as unknown as PrismaService;
    const service = new ShiftsService(db, {} as BukkuAutoSyncService, {} as BukkuAdapter, {} as ThermalPrinterService);
    jest.spyOn(service as unknown as { stockShortagesForShift: () => Promise<unknown[]> }, 'stockShortagesForShift').mockResolvedValue([{ receiptNo: 'TEST-1' }]);

    await service.autoCloseExpiredShifts(new Date('2026-09-04T16:01:00Z'));

    expect(updateMany).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'SHIFT_AUTO_CLOSE_BLOCKED' }) }));
  });
});
