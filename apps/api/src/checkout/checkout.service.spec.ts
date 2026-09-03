import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
import { PrismaService } from '../database/prisma.service';
import { ThermalPrinterService } from './thermal-printer.service';

describe('CheckoutService open-shift enforcement', () => {
  const input: CheckoutDto = {
    companyId: 'company-1', locationId: 'location-1', registerId: 'register-1', cashierId: 'cashier-1', priceLevelId: 'retail', shiftId: 'closed-or-forged-shift',
    items: [{ productId: 'product-1', uomId: 'each', quantity: 1 }], payments: [{ method: 'CASH', amount: 10 }],
  };

  it('rejects a closed, forged, or mismatched shift before creating any financial or stock records', async () => {
    const saleCreate = jest.fn();
    const transaction = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: input.companyId }) },
      location: { findFirst: jest.fn().mockResolvedValue({ id: input.locationId }) },
      register: { findFirst: jest.fn().mockResolvedValue({ id: input.registerId }) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: input.cashierId, role: { permissions: ['checkout'] } }) },
      priceLevel: { findFirst: jest.fn().mockResolvedValue({ id: input.priceLevelId }) },
      shift: { findFirst: jest.fn().mockResolvedValue(null) },
      sale: { create: saleCreate }, stockSnapshot: { upsert: jest.fn() }, payment: { create: jest.fn() }, syncJob: { create: jest.fn() }, auditLog: { create: jest.fn() },
    };
    const db = {
      sale: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
    } as unknown as PrismaService;
    const service = new CheckoutService(db, {} as ThermalPrinterService);

    await expect(service.checkout(input)).rejects.toThrow(new BadRequestException('Open a shift before checkout. The selected shift is not open for this cashier and register.'));
    expect(transaction.shift.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: input.shiftId, locationId: input.locationId, registerId: input.registerId, cashierId: input.cashierId, closedAt: null }) }));
    expect(saleCreate).not.toHaveBeenCalled();
    expect(transaction.stockSnapshot.upsert).not.toHaveBeenCalled();
    expect(transaction.payment.create).not.toHaveBeenCalled();
  });

  it('returns 403 before any checkout mutation when the active user lacks checkout permission', async () => {
    const transaction = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: input.companyId }) },
      location: { findFirst: jest.fn().mockResolvedValue({ id: input.locationId }) },
      register: { findFirst: jest.fn().mockResolvedValue({ id: input.registerId }) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: input.cashierId, role: { permissions: [] } }) },
      priceLevel: { findFirst: jest.fn().mockResolvedValue({ id: input.priceLevelId }) },
      shift: { findFirst: jest.fn() }, sale: { create: jest.fn() }, stockSnapshot: { upsert: jest.fn() }, payment: { create: jest.fn() },
    };
    const db = { sale: { findUnique: jest.fn().mockResolvedValue(null) }, $transaction: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)) } as unknown as PrismaService;
    await expect(new CheckoutService(db, {} as ThermalPrinterService).checkout(input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.shift.findFirst).not.toHaveBeenCalled();
    expect(transaction.sale.create).not.toHaveBeenCalled();
    expect(transaction.stockSnapshot.upsert).not.toHaveBeenCalled();
  });
});
