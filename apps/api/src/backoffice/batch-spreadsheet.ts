export type ImportRecord = Record<string, string>;

export const PRODUCT_BATCH_HEADERS = [
  'action', 'sku', 'barcode', 'product_name', 'category', 'supplier_description',
  'unit', 'selling_price', 'stock_quantity', 'stock_unit_cost', 'stock_adjustment_reason',
  'stock_adjustment_supplier', 'stock_adjustment_reference', 'fifo_override_batch', 'fifo_override_reason', 'status',
  'received_quantity', 'purchase_unit_cost', 'landed_cost', 'supplier', 'bukku_reference', 'bill_date', 'received_date',
] as const;

const sampleRows = [
  ['# SAMPLE create', 'SAMPLE-NEW', '955000000001', 'Sample new product', 'Sample category', 'Sample supplier description', 'EA', '12.90', '', '', '', '', '', '', '', 'active', '', '', '', '', '', '', ''],
  ['# SAMPLE update', 'SAMPLE-001', '', 'Sample renamed product', '', '', '', '13.50', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['# SAMPLE adjust_stock', 'SAMPLE-001', '', '', '', '', 'EA', '', '5', '3.70', 'Sample cycle-count adjustment', 'Sample supplier', 'COUNT-001', '', '', '', '', '', '', '', '', '', ''],
  ['# SAMPLE deactivate', 'SAMPLE-001', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['# SAMPLE reactivate', 'SAMPLE-001', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['# SAMPLE delete', 'SAMPLE-UNUSED', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['# SAMPLE receive_purchase', 'BUKKU-5963', '', '', '', '', 'EA', '', '', '', '', '', '', '', '', '', '20', '3.70', '0.00', 'ABC Supplier', 'PI-2026-001', '2026-09-03', '2026-09-03'],
];

const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export function templateCsv() { return rowsToCsv([PRODUCT_BATCH_HEADERS, ...sampleRows]); }

export function rowsCsv(rows: Array<Record<string, unknown>>) {
  const headers = rows.length ? [...new Set(rows.flatMap((row) => Object.keys(row)))] : ['result'];
  return rowsToCsv([headers, ...rows.map((row) => headers.map((header) => scalar(row[header])))]);
}

export function parseImportFile(buffer: Buffer, fileName: string): ImportRecord[] {
  if (!buffer.length) throw new Error('The uploaded file is empty');
  if (buffer.length > 5 * 1024 * 1024) throw new Error('Batch files must be 5 MB or smaller');
  if (!fileName.toLowerCase().endsWith('.csv')) throw new Error('Batch Update accepts CSV files only');
  const rows = parseCsv(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('The file must include a header row and at least one data row');
  const headers = rows[0].map(normalizeHeader);
  if (headers.some((header) => !header)) throw new Error('Every imported column needs a header');
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate column headers are not allowed');
  const missing = PRODUCT_BATCH_HEADERS.filter((header) => !headers.includes(header));
  const unknown = headers.filter((header) => !PRODUCT_BATCH_HEADERS.includes(header as typeof PRODUCT_BATCH_HEADERS[number]));
  if (missing.length || unknown.length) throw new Error(`Use the RetailOS template exactly. Missing: ${missing.join(', ') || 'none'}. Unknown: ${unknown.join(', ') || 'none'}.`);
  return rows.slice(1)
    .filter((row) => row.some((value) => value.trim() !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ''])))
    .filter((row) => !row.action.toLowerCase().startsWith('# sample'));
}

function rowsToCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>) {
  return Buffer.from(`\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')}\r\n`, 'utf8');
}

function scalar(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function normalizeHeader(value: string) { return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s-]+/g, '_'); }

function parseCsv(input: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  if (quoted) throw new Error('The CSV contains an unterminated quoted field');
  return rows;
}
