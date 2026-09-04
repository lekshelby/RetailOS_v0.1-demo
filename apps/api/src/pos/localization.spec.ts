import { readFileSync } from 'fs';
import { join } from 'path';

describe('Chinese POS localization coverage', () => {
  const app = readFileSync(join(process.cwd(), 'public', 'app.js'), 'utf8');
  const serviceWorker = readFileSync(join(process.cwd(), 'public', 'service-worker.js'), 'utf8');

  it('maps core POS controls, placeholders, payment labels, stock text, and accessibility labels', () => {
    for (const phrase of ['Cash checkout', 'Payment method', 'Cash', 'Card', 'Bank transfer', 'Split payment', 'Subtotal', 'Discount', 'Total', 'Stock not tracked', 'Available', 'Type barcode number, SKU, or item name', 'Open cart', 'Dismiss message']) {
      expect(app).toContain(`'${phrase}':`);
    }
  });

  it('stores translated ARIA source text in valid data attributes, never a DOMStringMap key with a hyphen', () => {
    expect(app).toContain('const sourceAttribute = `data-i18n-${attribute}`');
    expect(app).toContain("element.getAttribute(sourceAttribute)");
    expect(app).toContain("element.setAttribute(sourceAttribute, original)");
    expect(app).not.toContain('element.dataset[`i18n${attribute}`]');
  });

  it('keeps quantity keyboard input as a draft until blur or Enter instead of rerendering on each keystroke', () => {
    expect(app).toContain('state.quantityDrafts[index] = input.value');
    expect(app).toContain("$('#cart-lines').addEventListener('blur'");
    expect(app).toContain("event.key !== 'Enter'");
    expect(app).not.toContain("line.quantity = Math.max(0.0001, Number(input.value) || 0.0001); renderCart();");
  });

  it('releases the mobile cart inert boundary before opening the cash dialog', () => {
    expect(app).toContain("if ($('#cart-panel').classList.contains('cart-open')) closeCartDrawer();");
    expect(app.indexOf("if ($('#cart-panel').classList.contains('cart-open')) closeCartDrawer();")).toBeLessThan(app.indexOf("$('#cash-payment-dialog').classList.remove('hidden')"));
    expect(app).toContain("$('#cash-payment-form').addEventListener('submit'");
    expect(app).toContain("showAlert(error);");
  });

  it('shows manual sync to sync.run users and separates shift-open from shift-close capability', () => {
    expect(app).toContain("!permissions.includes('sync.run')");
    expect(app).toContain("state.user.permissions.includes('shift.open')");
    expect(app).toContain("state.user.permissions.includes('shift.close')");
    expect(app).toContain("A manager must close this shift");
  });

  it('keeps alias-aware search available in offline and Chinese modes without changing master data', () => {
    expect(app).toContain('function rankCachedProduct(product, query)');
    expect(app).toContain("matchedAlias: '匹配：{alias} → {name}'");
    expect(app).toContain("product.availableStock == null ? escapeHtml(t('stockNotTracked'))");
    expect(app).toContain("escapeHtml(t('available'))");
    expect(app).toContain("escapeHtml(t('add'))");
    expect(app).toContain("escapeHtml(t('noMatchingCachedItems'))");
    expect(app).toContain("escapeHtml(product.name)");
    expect(app).toContain("escapeHtml(product.sku)");
    expect(serviceWorker).toContain("const CACHE = 'retailos-shell-v12'");
  });

  it('allows language switching while bootstrap configuration is still loading', () => {
    expect(app).toContain('state.config?.locations?.find');
    expect(app).toContain('state.config?.priceLevels?.find');
  });

  it('keeps structured hardware matching in the saved offline catalogue and exposes an explicit fallback', () => {
    expect(app).toContain('function structuredProductSearch(query)');
    expect(app).toContain('function cachedStructuredScore(product, query)');
    expect(app).toContain('cachedStructuredFamilyMatch(entry.product, interpretation)');
    expect(app).toContain('data-related-search');
    expect(app).toContain("unsafeShorthand: 'Add a dimension and material before using this one-letter product shorthand.'");
  });
});
