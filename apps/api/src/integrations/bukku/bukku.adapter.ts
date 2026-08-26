import { Injectable, NotImplementedException } from '@nestjs/common';
import { AccountingConnector, BukkuProductCatalogue, BukkuProductPriceType, CashInvoiceCommand, ConnectorResult, CreditNoteCommand, ExternalContact, ExternalProduct, ExternalProductDetail, ExternalStockBalance, Page, PageRequest } from './bukku.types';
import { BukkuHttpClient } from './bukku-http.client';

type BukkuPaging = { current_page?: number; total_pages?: number };
type BukkuList<T> = { paging?: BukkuPaging; products?: T[]; contacts?: T[]; [key: string]: unknown };
type BukkuProduct = { id?: number | string; sku?: string; name?: string };
type BukkuContact = { id?: number | string; display_name?: string; legal_name?: string };

@Injectable()
export class BukkuAdapter implements AccountingConnector {
  readonly provider = 'BUKKU' as const;
  readonly capabilities = { barcodeRead: true as const, barcodeWrite: false as const, multipleUom: 'UPDATE_PRODUCT_ONLY' as const, productDetailBatchSize: 50 as const, paymentGateway: false as const };
  constructor(private readonly client: BukkuHttpClient) {}

  async pullProducts(page: PageRequest = {}): Promise<Page<ExternalProduct>> {
    const limit = Math.min(page.limit ?? 50, 100);
    const query = new URLSearchParams({ page: page.cursor ?? '1', page_size: String(limit) });
    const payload = await this.client.get(`/products?${query}`) as BukkuList<BukkuProduct>;
    const products = Array.isArray(payload.products) ? payload.products : [];
    return { items: products.filter((product) => product.id != null).map((product) => ({ externalId: String(product.id), sku: product.sku, name: product.name, raw: product })), nextCursor: this.nextPage(payload.paging) };
  }

  async pullContacts(page: PageRequest = {}): Promise<Page<ExternalContact>> {
    const limit = Math.min(page.limit ?? 50, 100);
    const query = new URLSearchParams({ page: page.cursor ?? '1', page_size: String(limit) });
    const payload = await this.client.get(`/contacts?${query}`) as BukkuList<BukkuContact>;
    const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
    return { items: contacts.filter((contact) => contact.id != null).map((contact) => ({ externalId: String(contact.id), name: contact.display_name ?? contact.legal_name, raw: contact })), nextCursor: this.nextPage(payload.paging) };
  }

  async pullStockBalances(externalProductId: string): Promise<Page<ExternalStockBalance>> {
    const payload = await this.client.post('/v2/lists', { lists: ['stock_balances'], params: { stock_balances: { product_id: Number(externalProductId) } } }) as Record<string, unknown>;
    const rows = this.findArray(payload, 'stock_balances');
    return { items: rows.map((raw) => ({ externalProductId, externalLocationId: this.stringField(raw, 'id'), quantity: this.numberField(raw, 'balance'), raw })) };
  }

  async pullProductCatalogue(version?: string): Promise<BukkuProductCatalogue> {
    const payload = await this.client.post('/v2/lists', { lists: ['product_list'], params: { product_list: { version: version ?? null } } }) as Record<string, unknown>;
    const section = this.objectField(payload, 'product_list');
    const notChanged = payload.not_changed === true || section?.not_changed === true;
    const rows = notChanged ? [] : this.findArray(payload, 'product_list');
    return {
      notChanged,
      version: this.versionField(payload, section),
      products: rows.reduce<BukkuProductCatalogue['products']>((products, raw) => { const product = this.toCatalogueProduct(raw); if (product) products.push(product); return products; }, []),
    };
  }

  async pullProductDetails(externalProductIds: string[], type: BukkuProductPriceType): Promise<ExternalProductDetail[]> {
    if (externalProductIds.length > 50) throw new Error('Bukku product_detail_list accepts at most 50 products');
    const payload = await this.client.post('/v2/lists', { lists: ['product_detail_list'], params: { product_detail_list: { product_ids: externalProductIds.map(Number), type } } }) as Record<string, unknown>;
    return this.findArray(payload, 'product_detail_list').map((raw) => ({ externalProductId: this.stringField(raw, 'product_id', 'id'), raw }));
  }

  async pushDailyCashInvoice(_command: CashInvoiceCommand, _idempotencyKey: string): Promise<ConnectorResult> {
    throw new NotImplementedException('Bukku invoice posting requires mapped contact, account, location, tax-code, product-unit, and status IDs; RetailOS will not invent financial mappings.');
  }

  async pushSalesCreditNote(_command: CreditNoteCommand, _idempotencyKey: string): Promise<ConnectorResult> {
    throw new NotImplementedException('Bukku credit-note posting requires mapped accounting and product-unit IDs; RetailOS will not invent financial mappings.');
  }

  private nextPage(paging?: BukkuPaging) { return paging?.current_page && paging.total_pages && paging.current_page < paging.total_pages ? String(paging.current_page + 1) : undefined; }
  private toCatalogueProduct(raw: Record<string, unknown>): BukkuProductCatalogue['products'][number] | null {
    const externalId = this.stringField(raw, 'id', 'product_id');
    if (!externalId) return null;
    const units = this.arrayField(raw, 'units').reduce<BukkuProductCatalogue['products'][number]['units']>((result, unit) => { const unitId = this.stringField(unit, 'id', 'unit_id', 'product_unit_id'); if (unitId) result.push({ externalId: unitId, label: this.stringField(unit, 'label', 'name', 'unit_name'), rate: this.numberField(unit, 'rate', 'conversion_rate', 'conversion_factor'), isBase: this.booleanField(unit, 'is_base', 'base') }); return result; }, []);
    const children = this.arrayField(raw, 'children');
    return { externalId, sku: this.stringField(raw, 'sku'), name: this.stringField(raw, 'name'), barcode: this.barcodeField(raw.barcode), classificationCode: this.stringField(raw, 'classification_code'), quantity: this.numberField(raw, 'quantity'), trackInventory: this.booleanField(raw, 'track_inventory'), isSelling: this.booleanField(raw, 'is_selling'), isBuying: this.booleanField(raw, 'is_buying'), type: this.stringField(raw, 'type'), archived: this.booleanField(raw, 'is_archived'), updatedAt: this.stringField(raw, 'updated_at'), units, bundle: children.length > 0 || this.stringField(raw, 'type')?.toUpperCase().includes('BUNDLE') === true, raw };
  }
  private findArray(payload: Record<string, unknown>, key: string): Record<string, unknown>[] {
    const direct = payload[key];
    const from = (value: unknown, depth = 0): Record<string, unknown>[] | undefined => {
      if (Array.isArray(value)) return this.records(value);
      if (!value || typeof value !== 'object' || depth > 2) return undefined;
      const record = value as Record<string, unknown>;
      for (const field of ['items', 'products', 'data', 'results', key]) {
        const result = from(record[field], depth + 1);
        if (result) return result;
      }
      return undefined;
    };
    return from(direct) ?? from(payload.data) ?? [];
  }
  private records(value: unknown[]) { return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'); }
  private arrayField(value: Record<string, unknown>, field: string) { return Array.isArray(value[field]) ? this.records(value[field] as unknown[]) : []; }
  private objectField(value: Record<string, unknown>, field: string) { const result = value[field]; return result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : undefined; }
  private versionField(payload: Record<string, unknown>, section?: Record<string, unknown>) { return this.stringField(payload, 'version', 'product_list_version') ?? (section ? this.stringField(section, 'version', 'product_list_version') : undefined); }
  private barcodeField(value: unknown): string | string[] | undefined { if (typeof value === 'string' || typeof value === 'number') return String(value); if (Array.isArray(value)) return value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number').map(String); return undefined; }
  private stringField(value: Record<string, unknown>, ...fields: string[]) { const match = fields.map((field) => value[field]).find((field) => typeof field === 'string' || typeof field === 'number'); return match == null ? undefined : String(match); }
  private numberField(value: Record<string, unknown>, ...fields: string[]) { const match = fields.map((field) => value[field]).find((field) => typeof field === 'number' || typeof field === 'string'); const number = Number(match); return Number.isFinite(number) ? number : undefined; }
  private booleanField(value: Record<string, unknown>, ...fields: string[]) { const match = fields.map((field) => value[field]).find((field) => typeof field === 'boolean'); return typeof match === 'boolean' ? match : undefined; }
}
