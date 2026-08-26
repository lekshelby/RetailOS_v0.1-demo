import { BadRequestException } from '@nestjs/common';
import { calculateCheckout, settlePayments } from './checkout-calculator';

describe('checkout calculations', () => {
  it('calculates line and whole-sale discounts in cents', () => {
    const result = calculateCheckout([
      { quantity: 2, unitPrice: 12.5, discount: { type: 'PERCENTAGE', value: 10 } },
      { quantity: 1, unitPrice: 35.9 },
    ], { type: 'FIXED', value: 5 });
    expect(result).toMatchObject({ subtotal: 60.9, lineDiscountTotal: 2.5, saleDiscount: 5, discountTotal: 7.5, grandTotal: 53.4 });
  });
  it('supports cash change for a single cash payment', () => {
    const payments = settlePayments([{ method: 'CASH', amount: 60 }], 5340);
    expect(payments).toEqual([
      expect.objectContaining({ amount: 53.4, tenderedAmount: 60, changeAmount: 6.6 }),
    ]);
  });
  it('requires split-payment amounts to match exactly', () => {
    expect(() => settlePayments([{ method: 'CASH', amount: 10 }, { method: 'BANK_TRANSFER', amount: 20 }], 4000)).toThrow('Split-payment amounts must equal the sale total exactly');
    expect(settlePayments([{ method: 'CASH', amount: 10 }, { method: 'DUITNOW', amount: 30 }], 4000)).toEqual([
      expect.objectContaining({ amount: 10, changeAmount: 0 }),
      expect.objectContaining({ amount: 30, changeAmount: 0 }),
    ]);
  });
  it('does not allow non-cash overpayment', () => {
    expect(() => settlePayments([{ method: 'CARD', amount: 60 }], 5340)).toThrow(BadRequestException);
  });
});
