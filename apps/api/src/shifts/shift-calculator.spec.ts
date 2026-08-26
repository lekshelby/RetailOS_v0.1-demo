import { reconcileCash } from './shift-calculator';

describe('cash reconciliation', () => {
  it('calculates expected drawer cash and variance', () => {
    expect(reconcileCash({ openingFloat: 200, cashSales: 128.5, cashIn: 20, cashOut: 15, countedCash: 330 })).toEqual({ expectedCash: 333.5, variance: -3.5 });
  });

  it('takes cash refunds out of the expected drawer cash', () => {
    expect(reconcileCash({ openingFloat: 200, cashSales: 128.5, cashRefunds: 18, cashIn: 20, cashOut: 15 })).toEqual({ expectedCash: 315.5, variance: undefined });
  });
});
