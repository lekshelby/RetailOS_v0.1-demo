import { createHash } from 'node:crypto';
import { parseImportFile, PRODUCT_BATCH_HEADERS, rowsCsv, templateCsv } from './batch-spreadsheet';

describe('Batch Update CSV boundaries', () => {
  it('downloads one UTF-8 BOM CSV template and ignores labelled samples', () => {
    const file = templateCsv();
    expect(file.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(parseImportFile(file, 'retailos-product-batch-template.csv')).toEqual([]);
    expect(file.toString('utf8')).toContain('# SAMPLE receive_purchase');
    expect(file.toString('utf8')).toContain(PRODUCT_BATCH_HEADERS.join('\",\"'));
  });

  it('retains invalid and duplicate rows for all-or-nothing server review', () => {
    const blank = Object.fromEntries(PRODUCT_BATCH_HEADERS.map((header) => [header, '']));
    const uploaded = rowsCsv([
      { ...blank, action: 'adjust_stock', sku: 'SKU-1', unit: 'EA', stock_quantity: '-2', stock_adjustment_reason: 'Damaged' },
      { ...blank, action: 'adjust_stock', sku: 'SKU-1', unit: 'EA', stock_quantity: '-2' },
    ]);
    const parsed = parseImportFile(uploaded, 'review.csv');
    expect(parsed).toHaveLength(2);
    expect(parsed[1].stock_adjustment_reason).toBe('');
  });

  it('produces stable bytes for idempotency checksums', () => {
    const file = templateCsv();
    expect(createHash('sha256').update(file).digest('hex')).toBe(createHash('sha256').update(Buffer.from(file)).digest('hex'));
  });

  it('rejects every non-CSV format', () => {
    expect(() => parseImportFile(Buffer.from('x'), 'batch.xlsx')).toThrow('CSV files only');
  });
});
