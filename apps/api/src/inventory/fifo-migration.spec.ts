import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('FIFO legacy migration safety', () => {
  it('creates draft opening-stock batches without changing stock or historical COGS', () => {
    const sql = readFileSync(join(__dirname, '../../prisma/migrations/20260903040000_fifo_inventory_batches/migration.sql'), 'utf8');
    expect(sql).toContain("'DRAFT', 'OPENING_LEGACY'");
    expect(sql).toContain('WHERE snapshot."quantity" <> 0');
    expect(sql).not.toMatch(/UPDATE\s+"StockSnapshot"/i);
    expect(sql).not.toMatch(/UPDATE\s+"SaleItem"/i);
    expect(sql).not.toMatch(/UPDATE\s+"Sale"/i);
  });
});
