import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateReturnDto, RefundStoreCreditDto } from './dto/create-return.dto';

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);

@Injectable()
export class ReturnsService {
  constructor(private readonly db: PrismaService) {}

  async create(input: CreateReturnDto) {
    return this.db.$transaction(async (tx) => {
      const [sale, cashier] = await Promise.all([
        tx.sale.findFirst({ where: { id: input.saleId, companyId: input.companyId, status: 'COMPLETED' }, include: { company: { select: { timezone: true } }, items: { include: { product: { select: { trackStock: true } } } } } }),
        tx.user.findFirst({ where: { id: input.cashierId, companyId: input.companyId, status: 'ACTIVE' } }),
      ]);
      if (!sale) throw new NotFoundException('Completed sale not found');
      if (!cashier) throw new BadRequestException('Cashier is not active');
      if (!sale.completedAt || new Date() > this.returnDeadline(sale.completedAt, sale.company.timezone)) throw new BadRequestException('Returns, refunds, and exchanges are available only until the end of the next working day (Monday to Saturday, 5:00 PM).');
      if (input.type === 'REFUND' && !input.refundMethod) throw new BadRequestException('Choose a refund method for a refund return');
      if (input.type === 'EXCHANGE' && input.refundMethod) throw new BadRequestException('Exchange returns create store credit and cannot also be refunded');
      if (input.shiftId && !await tx.shift.findFirst({ where: { id: input.shiftId, cashierId: input.cashierId, closedAt: null, location: { companyId: input.companyId } } })) {
        throw new BadRequestException('Shift is not open for this cashier');
      }
      if (input.type === 'REFUND' && input.refundMethod === 'CASH' && !input.shiftId) {
        throw new BadRequestException('Open a shift before issuing a cash refund');
      }

      const saleItems = new Map(sale.items.map((item) => [item.id, item]));
      let totalCents = 0;
      const lines: Array<{ saleItem: typeof sale.items[number]; quantity: number; baseQuantity: Prisma.Decimal; amount: number }> = [];
      for (const requested of input.items) {
        const saleItem = saleItems.get(requested.saleItemId);
        if (!saleItem) throw new BadRequestException('Return item does not belong to this receipt');
        const previous = await tx.returnItem.aggregate({ where: { saleItemId: saleItem.id, return: { status: 'COMPLETED' } }, _sum: { quantity: true } });
        const remaining = Number(saleItem.quantity) - Number(previous._sum.quantity ?? 0);
        if (requested.quantity > remaining + 0.000001) throw new ConflictException(`Return quantity exceeds remaining quantity for ${saleItem.description}`);
        const amount = cents(Number(saleItem.lineTotal) * requested.quantity / Number(saleItem.quantity)) / 100;
        const baseQuantity = new Prisma.Decimal(saleItem.baseQuantity).mul(requested.quantity).div(saleItem.quantity);
        totalCents += cents(amount);
        lines.push({ saleItem, quantity: requested.quantity, baseQuantity, amount });
      }
      const total = totalCents / 100;
      const record = await tx.return.create({ data: {
        saleId: sale.id, companyId: input.companyId, customerId: sale.customerId, shiftId: input.shiftId, status: 'COMPLETED', type: input.type, reason: input.reason?.trim(), total,
        items: { create: lines.map((line) => ({ saleItemId: line.saleItem.id, productId: line.saleItem.productId, uomId: line.saleItem.uomId, quantity: line.quantity, baseQuantity: line.baseQuantity, amount: line.amount })) },
      }, include: { items: true } });
      if (input.type !== 'DISPOSE') {
        for (const line of lines) {
          if (!line.saleItem.product.trackStock) continue;
          await tx.stockSnapshot.upsert({ where: { locationId_productId: { locationId: sale.locationId, productId: line.saleItem.productId } }, update: { quantity: { increment: line.baseQuantity }, capturedAt: new Date() }, create: { locationId: sale.locationId, productId: line.saleItem.productId, quantity: line.baseQuantity } });
        }
      }
      const refund = input.refundMethod ? await tx.returnPayment.create({ data: { returnId: record.id, method: input.refundMethod, amount: total } }) : null;
      const storeCredit = input.type === 'EXCHANGE' ? await tx.storeCredit.create({ data: { companyId: input.companyId, customerId: sale.customerId, returnId: record.id, originalAmount: total, balance: total } }) : null;
      await tx.syncJob.create({ data: { companyId: input.companyId, provider: 'BUKKU', entityType: 'RETURN', entityId: record.id, action: 'RETURN_COMPLETED', direction: 'OUTBOUND', idempotencyKey: `bukku:return-completed:${record.id}`, payload: { returnId: record.id, type: input.type, saleId: sale.id } } });
      await tx.auditLog.create({ data: { companyId: input.companyId, actorId: input.cashierId, action: 'RETURN_COMPLETED', entityType: 'Return', entityId: record.id, reason: record.reason, after: { type: input.type, total, restocked: input.type !== 'DISPOSE', refundMethod: input.refundMethod, storeCreditId: storeCredit?.id } } });
      return { ...record, total: Number(record.total), refund: refund ? { ...refund, amount: Number(refund.amount) } : null, storeCredit: storeCredit ? { id: storeCredit.id, balance: Number(storeCredit.balance) } : null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async getStoreCredit(companyId: string, creditId: string) {
    const credit = await this.db.storeCredit.findFirst({ where: { id: creditId, companyId }, include: { return: { include: { sale: { select: { receiptNo: true } } } } } });
    if (!credit) throw new NotFoundException('Store credit not found');
    return { id: credit.id, balance: Number(credit.balance), originalAmount: Number(credit.originalAmount), receiptNo: credit.return.sale.receiptNo, returnId: credit.returnId };
  }

  async refundStoreCredit(creditId: string, input: RefundStoreCreditDto) {
    return this.db.$transaction(async (tx) => {
      const [credit, cashier] = await Promise.all([
        tx.storeCredit.findFirst({ where: { id: creditId, companyId: input.companyId }, include: { return: true } }),
        tx.user.findFirst({ where: { id: input.cashierId, companyId: input.companyId, status: 'ACTIVE' } }),
      ]);
      if (!credit || !cashier) throw new NotFoundException('Store credit or cashier was not found');
      if (input.amount > Number(credit.balance)) throw new ConflictException('Refund amount exceeds the remaining store credit');
      if (input.refundMethod === 'CASH') {
        if (!input.shiftId || credit.return.shiftId !== input.shiftId) throw new BadRequestException('Cash refund must be processed in the same open exchange shift');
        const shift = await tx.shift.findFirst({ where: { id: input.shiftId, cashierId: input.cashierId, closedAt: null } });
        if (!shift) throw new BadRequestException('Open shift not found for cash refund');
      }
      const updated = await tx.storeCredit.update({ where: { id: credit.id }, data: { balance: { decrement: input.amount } } });
      const payment = await tx.returnPayment.create({ data: { returnId: credit.returnId, method: input.refundMethod, amount: input.amount, reference: `store-credit:${credit.id}` } });
      await tx.auditLog.create({ data: { companyId: input.companyId, actorId: input.cashierId, action: 'STORE_CREDIT_REFUNDED', entityType: 'StoreCredit', entityId: credit.id, after: { amount: input.amount, remainingBalance: Number(updated.balance), refundMethod: input.refundMethod, returnId: credit.returnId } } });
      return { creditId: credit.id, refunded: Number(payment.amount), balance: Number(updated.balance), method: payment.method };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private returnDeadline(completedAt: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(completedAt);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const next = new Date(Date.UTC(value('year'), value('month') - 1, value('day') + 1));
    while (next.getUTCDay() === 0) next.setUTCDate(next.getUTCDate() + 1);
    return new Date(`${next.toISOString().slice(0, 10)}T17:00:00+08:00`);
  }
}
