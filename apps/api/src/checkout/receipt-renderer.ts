import { Prisma } from '@prisma/client';

export type ReceiptTemplate = 'COMPACT' | 'STANDARD' | 'DETAILED';
export type ReceiptStatus = 'ORIGINAL' | 'REPRINT' | 'VOID' | 'RETURN' | 'OFFLINE_PENDING_SYNC';
export type CanonicalReceipt = {
  version: 2; status: ReceiptStatus; widthMm: number; template: ReceiptTemplate; showLogo: boolean; showSku: boolean; divider: string;
  header: { companyName: string; address: string | null; brn: string | null; oldBrn: string | null; tin: string | null; receiptNo: string; dateTime: string; cashier: string; registerLocation: string; phone: string | null; email: string | null };
  items: Array<{ description: string; sku?: string; quantity: number; uom: string; unitPrice: number; discount: number; total: number }>;
  totals: { subtotal: number; discount: number; tax: number; total: number };
  payments: Array<{ method: string; settled: number; tendered?: number; change?: number }>;
  policy: string | null; operatingHours: string | null; footer: string | null; eInvoice: { qrUrl: string; explanation: string } | null;
};

type SaleForReceipt = {
  status: string; receiptNo: string; completedAt: Date | null; subtotal: Prisma.Decimal; discountTotal: Prisma.Decimal; taxTotal?: Prisma.Decimal; grandTotal: Prisma.Decimal; eInvoiceRequestToken?: string | null; receiptSnapshot?: Prisma.JsonValue | null;
  company: { name: string; legalName: string | null; brnNew: string | null; registrationNo: string | null; brnOld: string | null; tin: string | null; address?: string | null; officePhone: string | null; phone: string | null; email: string | null; receiptFooter: string | null; receiptPaperWidthMm: number; receiptTemplate?: string; receiptDividerStyle?: string; receiptShowLogo?: boolean; receiptShowSku?: boolean };
  location: { name: string }; register: { name: string }; cashier: { name: string };
  items: Array<{ description: string; quantity: Prisma.Decimal; uom: { name: string }; unitPrice: Prisma.Decimal; lineDiscount: Prisma.Decimal; lineTotal: Prisma.Decimal; product?: { sku: string } }>;
  payments: Array<{ method: string; amount: Prisma.Decimal; tenderedAmount: Prisma.Decimal; changeAmount: Prisma.Decimal }>;
};

const money = (value: Prisma.Decimal | number) => `RM${Number(value).toFixed(2)}`;
const charactersForPaper = (width: number) => width <= 58 ? 32 : width <= 76 ? 42 : width <= 82 ? 48 : 64;
const fit = (value: string, width: number) => value.length > width ? value.slice(0, Math.max(0, width - 1)) + '…' : value;
const left = (value: string, width: number) => fit(value, width).padEnd(width);
const right = (value: string, width: number) => fit(value, width).padStart(width);
const center = (value: string, width: number) => { const text = fit(value, width); return text.padStart(Math.floor((width + text.length) / 2)).padEnd(width); };
const wrap = (value: string, width: number) => {
  const words = value.trim().split(/\s+/); const lines: string[] = []; let line = '';
  for (const word of words) { if (word.length > width) { if (line) lines.push(line); for (let index = 0; index < word.length; index += width) lines.push(word.slice(index, index + width)); line = ''; } else if (!line) line = word; else if (`${line} ${word}`.length <= width) line += ` ${word}`; else { lines.push(line); line = word; } }
  if (line) lines.push(line); return lines.length ? lines : [''];
};

/** One saved-snapshot-backed document feeds View, Preview, PDF and ESC/POS. */
export function canonicalReceipt(sale: SaleForReceipt, status: ReceiptStatus = sale.status === 'VOIDED' ? 'VOID' : 'ORIGINAL'): CanonicalReceipt {
  const saved = sale.receiptSnapshot && typeof sale.receiptSnapshot === 'object' && !Array.isArray(sale.receiptSnapshot) ? sale.receiptSnapshot as Record<string, unknown> : {};
  const savedCompany = saved.company && typeof saved.company === 'object' && !Array.isArray(saved.company) ? saved.company as Record<string, unknown> : {};
  const savedPresentation = saved.presentation && typeof saved.presentation === 'object' && !Array.isArray(saved.presentation) ? saved.presentation as Record<string, unknown> : {};
  const company = { ...sale.company, ...savedCompany, ...savedPresentation } as typeof sale.company;
  const template: ReceiptTemplate = company.receiptTemplate === 'COMPACT' || company.receiptTemplate === 'DETAILED' ? company.receiptTemplate : 'STANDARD';
  return {
    version: 2, status, widthMm: company.receiptPaperWidthMm, template, showLogo: Boolean(company.receiptShowLogo), showSku: Boolean(company.receiptShowSku), divider: company.receiptDividerStyle === 'DOUBLE' ? '=' : company.receiptDividerStyle === 'DOT' ? '·' : '-',
    header: { companyName: company.legalName || company.name, address: company.address || null, brn: company.brnNew || company.registrationNo || null, oldBrn: company.brnOld || null, tin: company.tin || null, receiptNo: sale.receiptNo, dateTime: sale.completedAt?.toLocaleString('en-MY') || '', cashier: sale.cashier.name, registerLocation: `${sale.register.name} · ${sale.location.name}`, phone: company.officePhone || company.phone || null, email: company.email || null },
    items: sale.items.map((item) => ({ description: item.description, ...(company.receiptShowSku && item.product?.sku ? { sku: item.product.sku } : {}), quantity: Number(item.quantity), uom: item.uom.name, unitPrice: Number(item.unitPrice), discount: Number(item.lineDiscount), total: Number(item.lineTotal) })),
    totals: { subtotal: Number(sale.subtotal), discount: Number(sale.discountTotal), tax: Number(sale.taxTotal || 0), total: Number(sale.grandTotal) },
    payments: sale.payments.map((payment) => ({ method: payment.method.replaceAll('_', ' '), settled: payment.method === 'CASH' ? Number(payment.tenderedAmount) - Number(payment.changeAmount) : Number(payment.amount), ...(payment.method === 'CASH' ? { tendered: Number(payment.tenderedAmount), change: Number(payment.changeAmount) } : {}) })),
    policy: template === 'COMPACT' ? null : 'Returns, refunds and exchanges: until end of next working day only.', operatingHours: template === 'DETAILED' ? 'Operating hours: Mon–Sat, 8:30 AM–5:00 PM' : null, footer: company.receiptFooter || 'Thank you for shopping with us!',
    eInvoice: sale.eInvoiceRequestToken ? { qrUrl: `/api/e-invoice/request/${encodeURIComponent(sale.eInvoiceRequestToken)}/qr`, explanation: 'Need an e-Invoice? Scan this QR to submit your details. This receipt is not validated by LHDN.' } : null,
  };
}

function itemLines58(item: CanonicalReceipt['items'][number], width: number) {
  const rows = wrap(item.description, width); if (item.sku) rows.push(...wrap(`SKU: ${item.sku}`, width));
  const total = money(item.total); rows.push(`${left(`${item.quantity} ${item.uom} x ${money(item.unitPrice)}`, width - total.length - 1)} ${total}`);
  if (item.discount) rows.push(`${left('Discount', width - 11)}${right(`-${money(item.discount)}`, 11)}`); return rows;
}
function itemLinesTable(item: CanonicalReceipt['items'][number], width: number) {
  const qtyWidth = 5; const priceWidth = 10; const totalWidth = 10; const descriptionWidth = width - qtyWidth - priceWidth - totalWidth - 3;
  const descriptions = [...wrap(item.description, descriptionWidth), ...(item.sku ? wrap(`SKU: ${item.sku}`, descriptionWidth) : [])];
  const rows = descriptions.map((description, index) => `${left(description, descriptionWidth)} ${index ? ' '.repeat(qtyWidth) : right(String(item.quantity), qtyWidth)} ${index ? ' '.repeat(priceWidth) : right(money(item.unitPrice), priceWidth)} ${index ? ' '.repeat(totalWidth) : right(money(item.total), totalWidth)}`);
  if (item.discount) rows.push(`${left('Discount', width - totalWidth - 1)} ${right(`-${money(item.discount)}`, totalWidth)}`); return rows;
}

export function receiptLines(document: CanonicalReceipt) {
  const width = charactersForPaper(document.widthMm); const divider = document.divider.repeat(width); const h = document.header;
  const rows = [center(document.status.replaceAll('_', ' / '), width), center(h.companyName, width), ...wrap(h.address || '', width).filter(Boolean).map((line) => center(line, width))];
  const legal = [h.brn ? `BRN ${h.brn}${h.oldBrn ? ` (${h.oldBrn})` : ''}` : '', h.tin ? `TIN ${h.tin}` : ''].filter(Boolean).join(' · '); if (legal) rows.push(...wrap(legal, width).map((line) => center(line, width)));
  rows.push(divider, `Receipt: ${h.receiptNo}`, h.dateTime, `Cashier: ${h.cashier}`, `Register / location: ${h.registerLocation}`, divider);
  if (document.widthMm <= 58) for (const item of document.items) rows.push(...itemLines58(item, width));
  else { const descriptionWidth = width - 28; rows.push(`${left('Description', descriptionWidth)} ${right('Qty', 5)} ${right('U/Price', 10)} ${right('Total', 10)}`); for (const item of document.items) rows.push(...itemLinesTable(item, width)); }
  rows.push(divider, `${left('Subtotal', width - 10)}${right(money(document.totals.subtotal), 10)}`, `${left('Discount', width - 10)}${right(`-${money(document.totals.discount)}`, 10)}`);
  if (document.totals.tax) rows.push(`${left('Tax', width - 10)}${right(money(document.totals.tax), 10)}`);
  rows.push(`${left('TOTAL', width - 10)}${right(money(document.totals.total), 10)}`);
  for (const payment of document.payments) { rows.push(`${left(payment.method, width - 11)}${right(money(payment.settled), 11)}`); if (payment.tendered !== undefined) rows.push(`${left('Cash received', width - 11)}${right(money(payment.tendered), 11)}`); if (payment.change !== undefined) rows.push(`${left('Change', width - 11)}${right(money(payment.change), 11)}`); }
  if (document.eInvoice) rows.push(divider, ...wrap(document.eInvoice.explanation, width), center('[ e-Invoice QR ]', width));
  rows.push(divider); for (const text of [h.phone ? `Tel: ${h.phone}` : null, h.email ? `Email: ${h.email}` : null, document.policy, document.operatingHours, document.footer]) if (text) rows.push(...wrap(text, width).map((line) => center(line, width)));
  return rows;
}
