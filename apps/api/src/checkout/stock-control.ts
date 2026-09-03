import { Prisma } from '@prisma/client';

export type StockRequestLine = {
  productId: string;
  productName: string;
  sku: string;
  trackStock: boolean;
  baseQuantity: Prisma.Decimal;
};

export type StockRequest = Pick<StockRequestLine, 'productId' | 'productName' | 'sku'> & { baseQuantity: Prisma.Decimal };

/** Aggregate in base units so one checkout cannot bypass stock by splitting UOM lines. */
export function aggregateStockRequests(lines: StockRequestLine[]): StockRequest[] {
  const requests = new Map<string, StockRequest>();
  for (const line of lines) {
    if (!line.trackStock) continue;
    const current = requests.get(line.productId);
    if (current) current.baseQuantity = current.baseQuantity.plus(line.baseQuantity);
    else requests.set(line.productId, { productId: line.productId, productName: line.productName, sku: line.sku, baseQuantity: line.baseQuantity });
  }
  return [...requests.values()];
}
