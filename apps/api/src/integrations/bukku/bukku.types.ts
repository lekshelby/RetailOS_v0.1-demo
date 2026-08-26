/** Core-facing contracts. These are deliberately not Bukku wire payloads. */
export type PageRequest = { cursor?: string; limit?: number };
export type Page<T> = { items: T[]; nextCursor?: string };
export type ExternalProduct = { externalId: string; sku?: string; name?: string; raw: unknown };
export type ExternalContact = { externalId: string; name?: string; raw: unknown };
export type ExternalStockBalance = { externalProductId?: string; externalLocationId?: string; quantity?: number; raw: unknown };
export type ExternalProductDetail = { externalProductId?: string; raw: unknown };
export type BukkuProductPriceType = 'SALE' | 'PURCHASE';
export type BukkuProductCatalogue = { notChanged: boolean; version?: string; products: Array<{ externalId: string; sku?: string; name?: string; barcode?: string | string[]; classificationCode?: string; quantity?: number; trackInventory?: boolean; isSelling?: boolean; isBuying?: boolean; type?: string; archived?: boolean; updatedAt?: string; units: Array<{ externalId: string; label?: string; rate?: number; isBase?: boolean }>; bundle?: boolean; raw: unknown }> };
export type CashInvoiceCommand = { localBatchId: string; businessDate: string; currency: string; lines: Array<{ localProductId: string; description: string; quantity: number; unitPrice: number; discount: number; tax: number }>; total: number };
export type CreditNoteCommand = { localReturnId: string; originalExternalInvoiceId?: string; reason: string; lines: Array<{ localProductId: string; quantity: number; amount: number }> };
export type ConnectorResult = { externalId: string; raw: unknown };

export interface AccountingConnector {
  readonly provider: 'BUKKU';
  readonly capabilities: { barcodeRead: true; barcodeWrite: false; multipleUom: 'UPDATE_PRODUCT_ONLY'; productDetailBatchSize: 50; paymentGateway: false };
  pullProducts(page?: PageRequest): Promise<Page<ExternalProduct>>;
  pullContacts(page?: PageRequest): Promise<Page<ExternalContact>>;
  pullStockBalances(externalProductId: string): Promise<Page<ExternalStockBalance>>;
  pullProductDetails(externalProductIds: string[], type: BukkuProductPriceType): Promise<ExternalProductDetail[]>;
  pushDailyCashInvoice(command: CashInvoiceCommand, idempotencyKey: string): Promise<ConnectorResult>;
  pushSalesCreditNote(command: CreditNoteCommand, idempotencyKey: string): Promise<ConnectorResult>;
}

/** Confirmed operation names only; URL paths and wire DTOs remain unset until staging verification. */
export const BUKKU_OPERATIONS = {
  products: 'Products API', updateProductUom: 'Update Product API', stockBalances: 'Lists API: stock_balances',
  productDetails: 'Lists API: product_detail_list', contacts: 'Contacts API / Lists API',
  cashInvoice: 'Sales API: Invoice with payment_mode=cash', salesCreditNote: 'Sales API: Credit Note',
  myInvois: 'MyInvois fields: customs_form_no, customs_k2_form_no, incoterms, myinvois_action',
} as const;
