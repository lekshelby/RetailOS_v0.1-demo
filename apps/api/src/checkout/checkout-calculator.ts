import { BadRequestException } from '@nestjs/common';

export type DiscountInput = { type: 'PERCENTAGE' | 'FIXED'; value: number };
export type PricedItem = { quantity: number; unitPrice: number; discount?: DiscountInput };
export type SettledPayment = { method: string; amount: number; tenderedAmount?: number; changeAmount?: number };

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const money = (valueInCents: number) => valueInCents / 100;

export function discountCents(grossCents: number, discount?: DiscountInput): number {
  if (!discount) return 0;
  if (!Number.isFinite(discount.value) || discount.value < 0) throw new BadRequestException('Discount must be a non-negative number');
  if (discount.type === 'PERCENTAGE') {
    if (discount.value > 100) throw new BadRequestException('Percentage discount cannot exceed 100%');
    return Math.round(grossCents * discount.value / 100);
  }
  const amount = cents(discount.value);
  if (amount > grossCents) throw new BadRequestException('Fixed discount cannot exceed the line total');
  return amount;
}

export function calculateCheckout(items: PricedItem[], saleDiscount?: DiscountInput) {
  const lines = items.map((item) => {
    if (item.quantity <= 0 || item.unitPrice < 0) throw new BadRequestException('Invalid quantity or unit price');
    const grossCents = cents(item.quantity * item.unitPrice);
    const lineDiscountCents = discountCents(grossCents, item.discount);
    return { grossCents, lineDiscountCents, lineTotalCents: grossCents - lineDiscountCents };
  });
  const subtotalCents = lines.reduce((sum, line) => sum + line.grossCents, 0);
  const lineDiscountTotalCents = lines.reduce((sum, line) => sum + line.lineDiscountCents, 0);
  const afterLineDiscounts = subtotalCents - lineDiscountTotalCents;
  const saleDiscountCents = discountCents(afterLineDiscounts, saleDiscount);
  const discountTotalCents = lineDiscountTotalCents + saleDiscountCents;
  const grandTotalCents = subtotalCents - discountTotalCents;
  return {
    lines,
    subtotal: money(subtotalCents),
    lineDiscountTotal: money(lineDiscountTotalCents),
    saleDiscount: money(saleDiscountCents),
    discountTotal: money(discountTotalCents),
    taxTotal: 0,
    grandTotal: money(grandTotalCents),
    grandTotalCents,
  };
}

export function settlePayments<T extends { method: string; amount: number; reference?: string }>(payments: T[], totalCents: number) {
  const tendered = payments.map((payment) => ({ ...payment, tenderedCents: cents(payment.amount) }));
  const tenderedTotal = tendered.reduce((sum, payment) => sum + payment.tenderedCents, 0);
  const splitMethods = tendered.filter((payment) => payment.method !== 'STORE_CREDIT');
  if (splitMethods.length > 1 && tenderedTotal !== totalCents) throw new BadRequestException('Split-payment amounts must equal the sale total exactly');
  if (tenderedTotal < totalCents) throw new BadRequestException('Payment is less than the sale total');
  const changeCents = tenderedTotal - totalCents;
  const lastCashIndex = tendered.map((payment) => payment.method).lastIndexOf('CASH');
  if (changeCents > 0 && lastCashIndex < 0) throw new BadRequestException('Only cash payments may exceed the sale total');
  return tendered.map((payment, index) => ({
    ...payment,
    amount: money(payment.tenderedCents - (index === lastCashIndex ? changeCents : 0)),
    tenderedAmount: money(payment.tenderedCents),
    changeAmount: index === lastCashIndex ? money(changeCents) : 0,
  }));
}

/**
 * `Payment.amount` is the settled allocation against the sale. Cash tender and
 * change are kept in their own fields, so change must never be subtracted here.
 */
export function receiptHistoryPaymentAmount(payment: SettledPayment): number {
  return payment.amount;
}
