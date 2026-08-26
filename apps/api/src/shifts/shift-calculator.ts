export function reconcileCash(input: { openingFloat: number; cashSales: number; cashRefunds?: number; cashIn: number; cashOut: number; countedCash?: number }) {
  const expectedCash = input.openingFloat + input.cashSales - (input.cashRefunds ?? 0) + input.cashIn - input.cashOut;
  const variance = input.countedCash == null ? undefined : input.countedCash - expectedCash;
  return { expectedCash: Math.round(expectedCash * 100) / 100, variance: variance == null ? undefined : Math.round(variance * 100) / 100 };
}
