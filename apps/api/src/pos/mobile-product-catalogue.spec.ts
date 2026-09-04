import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const publicFile = (name: string) => readFileSync(join(process.cwd(), 'public', name), 'utf8');

describe('mobile product catalogue and cart interaction safety', () => {
  const app = publicFile('app.js');
  const html = publicFile('index.html');
  const css = publicFile('management.css');
  const migration = readFileSync(join(process.cwd(), 'prisma', 'migrations', '20260904100000_cashier_product_management', 'migration.sql'), 'utf8');

  it('opens the product catalogue with a fixed add-product control at 360, 390, and 768', () => {
    for (const id of ['management-panel', 'management-products', 'managed-product-query', 'managed-product-list', 'add-product-float']) expect(html).toContain(`id="${id}"`);
    expect(css).toContain('.add-product-float{position:fixed');
    for (const width of [360, 390, 768]) expect(width).toBeLessThan(1024);
    expect(app).toContain("if (!managementDesktopAvailable() && tab !== 'products')");
    expect(app).toContain("await openManagement('products')");
    expect(app).toContain("$('#add-product-float').classList.toggle('hidden', name !== 'products' || !hasPermission('catalog.manage'))");
  });

  it('uses catalogue management rows for editing and never renders an add-to-cart action there', () => {
    expect(app).toContain("$('#managed-product-list').addEventListener('click'");
    expect(app).toContain('await openProductEdit(row.dataset.managedProductId)');
    expect(app).toContain("$('#add-product-float').addEventListener('click'");
    const managedRenderer = app.slice(app.indexOf('async function loadManagedProducts'), app.indexOf('function renderProductEditUoms'));
    expect(managedRenderer).not.toContain('data-product-index');
  });

  it('grants only product management to existing cashier roles at the API capability layer', () => {
    expect(migration).toContain("'[\"catalog.manage\"]'::jsonb");
    expect(migration).toContain("WHERE lower(role.\"name\") = 'cashier'");
    for (const forbidden of ['backoffice.view', 'printer.manage', 'company.manage', 'stock.adjust']) expect(migration).not.toContain(`\"${forbidden}\"`);
  });

  it('keeps the cart itself interactive while making only its sibling branches inert', () => {
    const start = app.indexOf('function setElementTreeInertExcept');
    const end = app.indexOf('function openCartDrawer', start);
    const source = app.slice(start, end);
    type FakeNode = { id: string; children: FakeNode[]; inert: boolean; contains(target: FakeNode): boolean };
    const node = (id: string, children: FakeNode[] = []): FakeNode => ({ id, children, inert: false, contains(target: FakeNode): boolean { return this === target || this.children.some((child) => child.contains(target)); } });
    const lookup = node('lookup'); const cart = node('cart-panel'); const workspace = node('workspace', [lookup, cart]); const header = node('header'); const pos = node('pos-view', [header, workspace]);
    const context = { $: (selector: string) => selector === '#cart-panel' ? cart : pos };
    runInNewContext(`${source}\nsetCartBackgroundInert(true);`, context);
    expect(cart.inert).toBe(false); expect(workspace.inert).toBe(false); expect(lookup.inert).toBe(true); expect(header.inert).toBe(true);
    runInNewContext(`${source}\nsetCartBackgroundInert(false);`, context);
    expect(lookup.inert).toBe(false); expect(header.inert).toBe(false);
  });

  it('restores the inert boundary after successful checkout instead of only removing a CSS class', () => {
    expect(app).toContain("if ($('#cart-panel').classList.contains('cart-open')) closeCartDrawer();");
    expect(app.match(/\$\('#cart-panel'\)\.classList\.remove\('cart-open'\)/g)).toBeNull();
  });
});
