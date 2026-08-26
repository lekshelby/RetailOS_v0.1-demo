import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { reconcileCash } from './shift-calculator';
import { CashMovementDto, CloseShiftDto, OpenShiftDto } from './dto/shift.dto';
import { BukkuAutoSyncService } from '../integrations/bukku/bukku-auto-sync.service';

@Injectable()
export class ShiftsService {
  constructor(private readonly db: PrismaService, private readonly bukkuSync: BukkuAutoSyncService) {}

  async open(input: OpenShiftDto) {
    const [location, register, cashier] = await Promise.all([
      this.db.location.findFirst({ where: { id: input.locationId, companyId: input.companyId } }),
      this.db.register.findFirst({ where: { id: input.registerId, locationId: input.locationId } }),
      this.db.user.findFirst({ where: { id: input.cashierId, companyId: input.companyId, status: 'ACTIVE' } }),
    ]);
    if (!location || !register || !cashier) throw new BadRequestException('Invalid store, register, or cashier');
    const existing = await this.db.shift.findFirst({ where: { registerId: input.registerId, closedAt: null } });
    if (existing) throw new ConflictException('This register already has an open shift');
    const shift = await this.db.shift.create({ data: { locationId: location.id, registerId: register.id, cashierId: cashier.id, openingFloat: input.openingFloat } });
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: cashier.id, action: 'SHIFT_OPENED', entityType: 'Shift', entityId: shift.id, after: { openingFloat: input.openingFloat, register: register.code } } });
    void this.bukkuSync.syncForOpenedShift(input.companyId, cashier.id).catch(() => undefined);
    return this.status(shift.id, input.companyId);
  }

  async current(registerId: string, companyId: string) {
    const shift = await this.db.shift.findFirst({ where: { registerId, closedAt: null, location: { companyId } }, orderBy: { openedAt: 'desc' } });
    if (!shift) throw new NotFoundException('No open shift for this register');
    return this.status(shift.id, companyId);
  }

  async report(shiftId: string, companyId: string, actorId: string) {
    const actor = await this.db.user.findFirst({ where: { id: actorId, companyId, status: 'ACTIVE' }, include: { role: true } });
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!actor || !permissions.includes('shift.report.view')) throw new NotFoundException('Manager access is required for shift reports');
    const shift = await this.db.shift.findFirst({ where: { id: shiftId, location: { companyId } }, include: { register: true, location: true, cashier: { select: { name: true } }, movements: { orderBy: { createdAt: 'asc' } } } });
    if (!shift) throw new NotFoundException('Shift not found');
    const [summary, sales, returns, negativeStock] = await Promise.all([
      this.summary(shift.id),
      this.db.sale.findMany({ where: { shiftId: shift.id, status: 'COMPLETED' }, select: { receiptNo: true, grandTotal: true, discountTotal: true, completedAt: true, payments: { select: { method: true, amount: true, changeAmount: true } } }, orderBy: { completedAt: 'desc' } }),
      this.db.return.findMany({ where: { shiftId: shift.id, status: 'COMPLETED' }, select: { type: true, total: true, createdAt: true, payments: { select: { method: true, amount: true } } }, orderBy: { createdAt: 'desc' } }),
      this.negativeStockForShift(shift.id, shift.locationId),
    ]);
    const paymentTotals: Record<string, number> = {};
    for (const sale of sales) for (const payment of sale.payments) paymentTotals[payment.method] = (paymentTotals[payment.method] ?? 0) + Number(payment.amount) - Number(payment.changeAmount);
    return {
      shift: { id: shift.id, location: shift.location.name, register: shift.register.name, cashier: shift.cashier.name, openedAt: shift.openedAt, closedAt: shift.closedAt },
      summary: { ...summary, ...reconcileCash({ ...summary, countedCash: shift.closingFloat == null ? undefined : Number(shift.closingFloat) }), salesCount: sales.length, grossSales: sales.reduce((sum, sale) => sum + Number(sale.grandTotal), 0), discountTotal: sales.reduce((sum, sale) => sum + Number(sale.discountTotal), 0) },
      paymentTotals,
      cashMovements: shift.movements.map((movement) => ({ type: movement.type, amount: Number(movement.amount), reason: movement.reason, createdAt: movement.createdAt })),
      returns: returns.map((record) => ({ type: record.type, total: Number(record.total), createdAt: record.createdAt, payments: record.payments.map((payment) => ({ method: payment.method, amount: Number(payment.amount) })) })),
      receipts: sales.map((sale) => ({ receiptNo: sale.receiptNo, total: Number(sale.grandTotal), completedAt: sale.completedAt })),
      negativeStock,
    };
  }

  async addMovement(shiftId: string, input: CashMovementDto) {
    const shift = await this.requireActiveShift(shiftId, input.companyId, input.cashierId);
    const movement = await this.db.cashMovement.create({ data: { shiftId: shift.id, type: input.type, amount: input.amount, reason: input.reason.trim() } });
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: input.cashierId, action: input.type, entityType: 'CashMovement', entityId: movement.id, reason: movement.reason, after: { amount: input.amount, shiftId } } });
    return this.status(shift.id, input.companyId);
  }

  async close(shiftId: string, input: CloseShiftDto) {
    const shift = await this.requireActiveShift(shiftId, input.companyId, input.cashierId);
    const manager = await this.db.user.findFirst({ where: { id: input.managerId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } });
    const permissions = Array.isArray(manager?.role.permissions) ? manager.role.permissions : [];
    if (!manager || !permissions.includes('shift.report.view')) throw new NotFoundException('Manager approval is required to close a shift');
    const summary = await this.summary(shift.id);
    const reconciliation = reconcileCash({ ...summary, countedCash: input.closingFloat });
    const negativeStock = await this.negativeStockForShift(shift.id, shift.locationId);
    await this.db.shift.update({ where: { id: shift.id }, data: { closingFloat: input.closingFloat, closedAt: new Date() } });
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: input.cashierId, action: 'SHIFT_CLOSED', entityType: 'Shift', entityId: shift.id, after: { ...summary, closingFloat: input.closingFloat, ...reconciliation, negativeStock }, metadata: { approvedById: manager.id } } });
    return { shiftId: shift.id, closedAt: new Date(), ...summary, closingFloat: input.closingFloat, ...reconciliation, negativeStock };
  }

  private async requireActiveShift(shiftId: string, companyId: string, cashierId: string) {
    const [shift, cashier] = await Promise.all([
      this.db.shift.findFirst({ where: { id: shiftId, closedAt: null, location: { companyId } } }),
      this.db.user.findFirst({ where: { id: cashierId, companyId, status: 'ACTIVE' } }),
    ]);
    if (!shift || !cashier) throw new NotFoundException('Open shift not found for this register');
    return shift;
  }

  private async status(shiftId: string, companyId: string) {
    const shift = await this.db.shift.findFirst({ where: { id: shiftId, location: { companyId } }, include: { register: true, cashier: { select: { id: true, name: true } }, movements: { orderBy: { createdAt: 'desc' } } } });
    if (!shift) throw new NotFoundException('Shift not found');
    const summary = await this.summary(shift.id);
    const { openingFloat: _openingFloat, closingFloat, ...shiftData } = shift;
    return { ...shiftData, ...summary, closingFloat: closingFloat == null ? null : Number(closingFloat), ...reconcileCash(summary) };
  }

  private async summary(shiftId: string) {
    const shift = await this.db.shift.findUniqueOrThrow({ where: { id: shiftId }, include: { movements: true } });
    const [cashSales, cashRefunds] = await Promise.all([
      this.db.payment.aggregate({ where: { method: 'CASH', sale: { shiftId, status: 'COMPLETED' } }, _sum: { amount: true, changeAmount: true } }),
      this.db.returnPayment.aggregate({ where: { method: 'CASH', return: { shiftId, status: 'COMPLETED' } }, _sum: { amount: true } }),
    ]);
    const cashIn = shift.movements.filter((movement) => movement.type === 'CASH_IN').reduce((sum, movement) => sum + Number(movement.amount), 0);
    const cashOut = shift.movements.filter((movement) => movement.type === 'CASH_OUT').reduce((sum, movement) => sum + Number(movement.amount), 0);
    return { openingFloat: Number(shift.openingFloat), cashSales: Number(cashSales._sum.amount ?? new Prisma.Decimal(0)) - Number(cashSales._sum.changeAmount ?? new Prisma.Decimal(0)), cashRefunds: Number(cashRefunds._sum.amount ?? new Prisma.Decimal(0)), cashIn, cashOut };
  }

  private async negativeStockForShift(shiftId: string, locationId: string) {
    const snapshots = await this.db.stockSnapshot.findMany({
      where: { locationId, quantity: { lt: 0 }, product: { saleItems: { some: { sale: { shiftId, status: 'COMPLETED' } } } } },
      include: { product: { select: { sku: true, name: true } } },
      orderBy: { product: { name: 'asc' } },
    });
    return snapshots.map((snapshot) => ({ sku: snapshot.product.sku, name: snapshot.product.name, remainingQuantity: Number(snapshot.quantity), shortageQuantity: Math.abs(Number(snapshot.quantity)) }));
  }
}
