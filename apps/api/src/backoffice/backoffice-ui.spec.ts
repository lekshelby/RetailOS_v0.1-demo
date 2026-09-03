import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const publicFile = (name: string) => readFileSync(join(process.cwd(), 'public', name), 'utf8');

describe('Back Office shell', () => {
  const html = publicFile('index.html');
  const css = publicFile('backoffice.css');
  const app = publicFile('app.js');

  it('provides every required dashboard and report surface', () => {
    for (const id of ['backoffice-kpis', 'backoffice-sales-trend', 'backoffice-payment-mix', 'backoffice-top-selling', 'backoffice-top-profit', 'backoffice-stock-exceptions', 'backoffice-report-table']) expect(html).toContain(`id="${id}"`);
    for (const report of ['sales', 'products', 'inventory', 'adjustments', 'bukku']) expect(html).toContain(`data-backoffice-section="${report}"`);
    for (const range of ['TODAY', 'WEEK', 'MONTH', 'CUSTOM']) expect(html).toContain(`data-range="${range}"`);
  });

  it('provides manager-only Batch Update review and immutable Stock Ledger drill-downs', () => {
    expect(html).toContain('data-backoffice-section="batch"');
    for (const id of ['batch-template-csv', 'batch-file', 'batch-preview', 'batch-review-table', 'batch-confirm', 'batch-commit', 'purchase-receipt-list']) expect(html).toContain(`id="${id}"`);
    expect(html).not.toContain('batch-template-xlsx');
    expect(app).toContain('/backoffice/batches/preview'); expect(app).toContain('/commit');
    expect(app).toContain('/backoffice/purchase-receipts/');
    expect(app).toContain('/ledger?'); expect(app).toContain('STAFF_COUNT'); expect(app).toContain('BUKKU_PURCHASE');
    expect(app).toContain('Sales COGS review'); expect(app).toContain('Inventory exceptions');
  });

  it('previews a real saved receipt through the same canonical receipt document', () => {
    expect(app).toContain('canonicalReceiptHtml(document)');
    expect(app).toContain('/document?companyId=');
    expect(app).not.toContain('SAMPLE-001');
  });

  it('keeps the full management dashboard desktop-only with the required phone message', () => {
    expect(css).toContain('@media(max-width:1023px)');
    expect(css).toMatch(/\.backoffice-sidebar,\.backoffice-main\{display:none\}/);
    expect(html).toContain('Open RetailOS Back Office on a PC for management reports.');
  });

  it('shows the entry point only for a manager capability and calls protected APIs', () => {
    expect(app).toContain("['backoffice.view', 'company.manage', 'shift.report.view']");
    expect(app).toContain("window.matchMedia('(min-width: 1024px)').matches");
    expect(app).toContain("$('#nav-products').classList.toggle('hidden', !desktop || !permissions.includes('catalog.manage'))");
    expect(app).toContain('/backoffice/dashboard?');
    expect(app).toContain('/backoffice/reports/adjustments?');
  });

  it('initialises custom dates in the store timezone before requesting the report', () => {
    expect(app).toContain("timeZone: 'Asia/Kuala_Lumpur'");
    expect(app).toContain("$('#backoffice-from').value = today");
    expect(app).toContain("$('#backoffice-to').value = today");
  });
});
