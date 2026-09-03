import { BukkuAdapter } from './bukku.adapter';
describe('Bukku connector boundary', () => {
  const adapter = new BukkuAdapter({} as never);
  it('records only confirmed capabilities', () => {
    expect(adapter.capabilities).toEqual({ barcodeRead: true, barcodeWrite: false, multipleUom: 'UPDATE_PRODUCT_ONLY', productDetailBatchSize: 50, paymentGateway: false });
  });
  it('rejects undocumented product-detail batch sizes', async () => {
    await expect(adapter.pullProductDetails(Array.from({ length: 51 }, (_, index) => String(index)), 'SALE')).rejects.toThrow('at most 50');
  });

  it('maps the confirmed product_list response without using the paged products endpoint', async () => {
    const post = jest.fn().mockResolvedValue({
      product_list: {
        version: 'catalogue-v1',
        items: [{ id: 10, sku: 'PIPE-15', barcode: '9551', classification_code: '001', name: 'PVC Pipe', quantity: 211, track_inventory: true, is_selling: true, is_buying: true, type: 'PRODUCT', is_archived: false, updated_at: '2026-08-20T00:00:00Z', units: [{ id: 7, label: 'LEN', rate: 1, is_base: true }, { id: 8, label: 'FT', rate: 0.05263158 }] }],
      },
    });
    const listAdapter = new BukkuAdapter({ post } as never);
    const catalogue = await listAdapter.pullProductCatalogue();
    expect(catalogue.notChanged).toBe(false);
    expect(catalogue.version).toBe('catalogue-v1');
    expect(catalogue.products[0]).toMatchObject({ externalId: '10', sku: 'PIPE-15', quantity: 211, isSelling: true });
    expect(catalogue.products[0].units).toContainEqual(expect.objectContaining({ externalId: '7', label: 'LEN', isBase: true }));
    expect(post).toHaveBeenCalledWith('/v2/lists', { lists: ['product_list'], params: { product_list: { version: null } } });
  });

  it('recognises Bukku version checks that return not_changed', async () => {
    const post = jest.fn().mockResolvedValue({ not_changed: true });
    const listAdapter = new BukkuAdapter({ post } as never);
    await expect(listAdapter.pullProductCatalogue('catalogue-v1')).resolves.toEqual({ notChanged: true, version: undefined, products: [] });
    expect(post).toHaveBeenCalledWith('/v2/lists', { lists: ['product_list'], params: { product_list: { version: 'catalogue-v1' } } });
  });

  it('creates an idempotent Normal daily cash invoice with split payment accounts', async () => {
    const get = jest.fn().mockResolvedValue({ transactions: [] });
    const post = jest.fn().mockResolvedValue({ transaction: { id: 901 } });
    const invoiceAdapter = new BukkuAdapter({ get, post } as never);
    await expect(invoiceAdapter.pushDailyCashInvoice({ number: 'ROS-20260901-ABC123', businessDate: '2026-09-01', contactId: '35', currency: 'MYR', locationId: '1', lines: [{ productId: '100', productUnitId: '101', incomeAccountId: '20', description: 'Pipe', quantity: 2, unitPrice: 5, classificationCode: '022' }], payments: [{ accountId: '2', paymentMethodId: '3', amount: 6 }, { accountId: '3', paymentMethodId: '1', amount: 4 }] }, 'bukku:shift-daily-digest:test')).resolves.toMatchObject({ externalId: '901' });
    expect(post).toHaveBeenCalledWith('/sales/invoices', expect.objectContaining({ payment_mode: 'cash', contact_id: 35, number: 'ROS-20260901-ABC123', myinvois_action: 'NORMAL', status: 'ready', deposit_items: [{ account_id: 2, payment_method_id: 3, amount: 6 }, { account_id: 3, payment_method_id: 1, amount: 4 }] }));
  });

  it('does not add a Bukku tax code when the RetailOS mapping is intentionally blank', async () => {
    const get = jest.fn().mockResolvedValue({ transactions: [] });
    const post = jest.fn().mockResolvedValue({ transaction: { id: 902 } });
    const invoiceAdapter = new BukkuAdapter({ get, post } as never);
    await invoiceAdapter.pushDailyCashInvoice({ number: 'ROS-20260901-NOTAX', businessDate: '2026-09-01', contactId: '35', currency: 'MYR', lines: [{ productId: '100', productUnitId: '101', incomeAccountId: '20', description: 'Pipe', quantity: 1, unitPrice: 5, classificationCode: '022' }], payments: [{ accountId: '2', paymentMethodId: '3', amount: 5 }] }, 'bukku:shift-daily-digest:notax');
    const body = post.mock.calls[0][1];
    expect(body.form_items[0]).not.toHaveProperty('tax_code_id');
  });
});
