import { canonicalReceipt, receiptLines } from './receipt-renderer';
import { createHash } from 'node:crypto';

const decimal = (value: number) => ({ toString: () => String(value), valueOf: () => value }) as never;
const sale = (width: number, template = 'STANDARD') => ({ status: 'COMPLETED', receiptNo: 'TEST-001', completedAt: new Date('2026-09-01T10:00:00Z'), subtotal: decimal(23.5), discountTotal: decimal(1.5), grandTotal: decimal(22), eInvoiceRequestToken: 'qr-test-token', company: { name: '测试商店', legalName: 'Test Store 测试商店 Sdn Bhd', brnNew: 'BRN1', registrationNo: null, brnOld: null, tin: 'TIN1', address: 'Long address 测试街道', officePhone: '03-123', phone: '012-345', email: 'x@example.test', receiptFooter: '谢谢 / Thank you', receiptPaperWidthMm: width, receiptTemplate: template, receiptDividerStyle: 'DASHED', receiptShowLogo: true, receiptShowSku: true, customerEInvoiceRequestsEnabled: true }, location: { name: 'Main' }, register: { name: 'R1' }, cashier: { name: 'Cashier' }, items: [{ description: 'A very long 商品 item name that must wrap only inside the description column', product: { sku: 'SKU-1' }, quantity: decimal(2), uom: { name: 'Each' }, unitPrice: decimal(11.75), lineDiscount: decimal(1.5), lineTotal: decimal(22) }], payments: [{ method: 'CASH', amount: decimal(20), tenderedAmount: decimal(20), changeAmount: decimal(8) }, { method: 'DUITNOW', amount: decimal(10), tenderedAmount: decimal(10), changeAmount: decimal(0) }] });

describe('canonical receipt rendering', () => {
  it('snapshot-tests professional receipt geometry at every supported width', () => {
    const snapshots = [58, 76, 80, 82, 110].map((width) => { const document = canonicalReceipt(sale(width)); const lines = receiptLines(document); const text = lines.join('\n'); expect(document.widthMm).toBe(width); expect(text).toContain('SKU: SKU-1'); expect(text).toContain('Cash received'); expect(text).toContain('RM20.00'); expect(text).toContain('Change'); expect(text).toContain('RM8.00'); expect(text).toContain('DUITNOW'); expect(text).toContain('e-Invoice QR'); expect(text).toContain('TOTAL'); expect(lines.every((line) => line.length <= (width <= 58 ? 32 : width <= 76 ? 42 : width <= 82 ? 48 : 64))).toBe(true); return { width, lines }; });
    const visualSnapshot = createHash('sha256').update(JSON.stringify(snapshots)).digest('hex');
    expect(visualSnapshot).toBe('0f596b122dfe58366b2e8f728701b0d607b38abaf4e27046923997a6b560c067');
  });
  it('marks a reprint without changing financial amounts', () => {
    const document = canonicalReceipt(sale(80), 'REPRINT');
    expect(document.status).toBe('REPRINT'); expect(document.totals.total).toBe(22); expect(receiptLines(document)[0]).toContain('REPRINT');
  });
  it('uses printer-safe ASCII separators for legal and register metadata', () => {
    const document = canonicalReceipt(sale(80));
    const text = receiptLines(document).join('\n');
    expect(document.header.registerLocation).toBe('R1 | Main');
    expect(text).toContain('BRN BRN1 | TIN TIN1');
    expect(text).not.toContain('·');
  });
  it('suppresses the e-Invoice request section when the company setting is disabled', () => {
    const disabled = sale(80);
    disabled.company.customerEInvoiceRequestsEnabled = false;
    const document = canonicalReceipt(disabled);
    expect(document.eInvoice).toBeNull();
    expect(receiptLines(document).join('\n')).not.toContain('e-Invoice');
  });
  it('uses the currently enabled company logo for a reprint of an older receipt snapshot', () => {
    const legacy = { ...sale(80), receiptSnapshot: { presentation: { receiptShowLogo: false } } };
    expect(canonicalReceipt(legacy, 'REPRINT').showLogo).toBe(true);
  });
});
