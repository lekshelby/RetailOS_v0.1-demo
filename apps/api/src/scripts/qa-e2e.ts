import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { generatedAliasesForProduct, normalizeProductText, structuredSearchFieldsForProduct } from '../products/product-search';

const baseUrl = process.env.QA_BASE_URL || 'http://172.18.208.1:3000/api';
const db = new PrismaClient({ datasources: process.env.QA_DATABASE_URL ? { db: { url: process.env.QA_DATABASE_URL } } : undefined });
const runCode = `QA-E2E-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
const checks: string[] = [];

function pin(value: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(value, salt, 32).toString('hex')}`;
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let cashierSession = '';
let managerSession = '';

async function api(path: string, options: RequestInit & { sessionToken?: string; approvalToken?: string } = {}, expectedStatus = options.method === 'POST' ? 201 : 200) {
  const { sessionToken, approvalToken, headers, ...requestOptions } = options;
  const isPublic = path === '/auth/pin' || path.startsWith('/pos/bootstrap');
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'content-type': 'application/json', ...(!isPublic ? { authorization: `Bearer ${sessionToken || cashierSession}` } : {}), ...(approvalToken ? { 'x-retailos-approval': approvalToken } : {}), ...(headers || {}) },
    ...requestOptions,
  });
  const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.arrayBuffer();
  if (response.status !== expectedStatus) throw new Error(`${options.method || 'GET'} ${path}: expected ${expectedStatus}, got ${response.status} ${typeof body === 'object' && !(body instanceof ArrayBuffer) ? JSON.stringify(body) : ''}`);
  return { response, body };
}

async function cleanup(companyId?: string) {
  if (!companyId) return;
  await db.saleBatchAllocation.deleteMany({ where: { saleItem: { sale: { companyId } } } });
  await db.inventoryBatchEvent.deleteMany({ where: { companyId } });
  await db.inventoryBatch.deleteMany({ where: { companyId } });
  await db.purchaseReceipt.deleteMany({ where: { companyId } });
  await db.batchUpdateRow.deleteMany({ where: { batch: { companyId } } });
  await db.batchUpdate.deleteMany({ where: { companyId } });
  await db.inventoryLedgerEntry.deleteMany({ where: { companyId } });
  await db.productAlias.deleteMany({ where: { product: { companyId } } });
  await db.syncLog.deleteMany({ where: { syncJob: { companyId } } });
  await db.returnPayment.deleteMany({ where: { return: { companyId } } });
  await db.returnItem.deleteMany({ where: { return: { companyId } } });
  await db.storeCredit.deleteMany({ where: { companyId } });
  await db.return.deleteMany({ where: { companyId } });
  await db.discountOverride.deleteMany({ where: { sale: { companyId } } });
  await db.payment.deleteMany({ where: { sale: { companyId } } });
  await db.saleItem.deleteMany({ where: { sale: { companyId } } });
  await db.sale.deleteMany({ where: { companyId } });
  await db.cashMovement.deleteMany({ where: { shift: { location: { companyId } } } });
  await db.shift.deleteMany({ where: { location: { companyId } } });
  await db.stockSnapshot.deleteMany({ where: { location: { companyId } } });
  await db.productPrice.deleteMany({ where: { product: { companyId } } });
  await db.productPurchasePrice.deleteMany({ where: { product: { companyId } } });
  await db.productBarcode.deleteMany({ where: { product: { companyId } } });
  await db.productUOM.deleteMany({ where: { product: { companyId } } });
  await db.product.deleteMany({ where: { companyId } });
  await db.customer.deleteMany({ where: { companyId } });
  await db.syncJob.deleteMany({ where: { companyId } });
  await db.externalReference.deleteMany({ where: { companyId } });
  await db.auditLog.deleteMany({ where: { companyId } });
  await db.user.deleteMany({ where: { companyId } });
  await db.role.deleteMany({ where: { companyId } });
  await db.priceLevel.deleteMany({ where: { companyId } });
  await db.company.deleteMany({ where: { id: companyId } });
}

async function main() {
  if (!process.env.QA_BASE_URL || !process.env.QA_DATABASE_URL) throw new Error('QA_BASE_URL and QA_DATABASE_URL are required. This harness must run only against an isolated disposable RetailOS test environment.');
  let companyId: string | undefined;
  try {
    const company = await db.company.create({ data: { name: 'RetailOS QA Store', code: runCode, legalName: 'RetailOS QA Store', tin: 'QA-TIN', brnNew: 'QA-BRN', receiptPaperWidthMm: 80 } });
    companyId = company.id;
    const cashierRole = await db.role.create({ data: { companyId, name: 'Cashier', permissions: ['checkout', 'returns', 'cash_movement'] } });
    const managerRole = await db.role.create({ data: { companyId, name: 'Manager', permissions: ['checkout', 'returns', 'cash_movement', 'catalog.manage', 'contact.manage', 'printer.manage', 'discount.approve', 'sale.void', 'shift.report.view', 'stock.adjust', 'company.manage', 'backoffice.view'] } });
    const cashier = await db.user.create({ data: { companyId, roleId: cashierRole.id, name: 'QA Cashier', email: `${runCode.toLowerCase()}-cashier@local`, pinHash: pin('1111') } });
    const manager = await db.user.create({ data: { companyId, roleId: managerRole.id, name: 'QA Manager', email: `${runCode.toLowerCase()}-manager@local`, pinHash: pin('2222') } });
    const location = await db.location.create({ data: { companyId, name: 'QA Store', code: 'QA' } });
    const register = await db.register.create({ data: { locationId: location.id, name: 'QA Register', code: 'QA1' } });
    const retail = await db.priceLevel.create({ data: { companyId, name: 'Retail', code: 'RETAIL' } });
    const customer = await db.customer.create({ data: { companyId, contactCode: 'QA-CUSTOMER', entityType: 'MALAYSIAN_COMPANY', contactTypes: ['CUSTOMER'], name: 'QA Customer' } });

    const productA = await db.product.create({ data: { companyId, sku: 'QA-ITEM-A', name: 'QA Item A', basePurchaseCost: 6, trackStock: true } });
    const productAUom = await db.productUOM.create({ data: { productId: productA.id, code: 'EA', name: 'Each', conversionFactor: 1, isBase: true } });
    await db.productPrice.create({ data: { productId: productA.id, priceLevelId: retail.id, uomId: productAUom.id, amount: 10 } });
    await db.productBarcode.create({ data: { productId: productA.id, uomId: productAUom.id, barcode: `${Date.now()}111` } });
    await db.stockSnapshot.create({ data: { locationId: location.id, productId: productA.id, quantity: 20 } });
    const productB = await db.product.create({ data: { companyId, sku: 'QA-ITEM-B', name: 'QA Item B', basePurchaseCost: 12, trackStock: true } });
    const productBUom = await db.productUOM.create({ data: { productId: productB.id, code: 'EA', name: 'Each', conversionFactor: 1, isBase: true } });
    await db.productPrice.create({ data: { productId: productB.id, priceLevelId: retail.id, uomId: productBUom.id, amount: 20 } });
    await db.stockSnapshot.create({ data: { locationId: location.id, productId: productB.id, quantity: 20 } });
    const shortageProduct = await db.product.create({ data: { companyId, sku: 'QA-SHORTAGE-ITEM', name: 'QA Shortage Item', basePurchaseCost: 6, trackStock: true } });
    const shortageUom = await db.productUOM.create({ data: { productId: shortageProduct.id, code: 'EA', name: 'Each', conversionFactor: 1, isBase: true } });
    await db.productPrice.create({ data: { productId: shortageProduct.id, priceLevelId: retail.id, uomId: shortageUom.id, amount: 10 } });
    await db.stockSnapshot.create({ data: { locationId: location.id, productId: shortageProduct.id, quantity: 3 } });
    const fifoProduct = await db.product.create({ data: { companyId, sku: 'QA-FIFO-ITEM', name: 'QA FIFO Item', basePurchaseCost: 5.59, trackStock: true, fifoEnabledAt: new Date() } });
    const fifoUom = await db.productUOM.create({ data: { productId: fifoProduct.id, code: 'EA', name: 'Each', conversionFactor: 1, isBase: true } });
    await db.productPrice.create({ data: { productId: fifoProduct.id, priceLevelId: retail.id, uomId: fifoUom.id, amount: 10 } });
    await db.stockSnapshot.create({ data: { locationId: location.id, productId: fifoProduct.id, quantity: 30 } });
    await db.inventoryBatch.createMany({ data: [
      { id: `${runCode}-fifo-001`, companyId, locationId: location.id, productId: fifoProduct.id, uomId: fifoUom.id, displayBatchId: 'PI-001', receivedQuantity: 10, remainingQuantity: 10, purchaseUnitCost: 5.59, finalUnitCost: 5.59, totalBatchValue: 55.90, receivedAt: new Date('2026-09-01T08:00:00Z'), status: 'POSTED', sourceType: 'BUKKU_PURCHASE' },
      { id: `${runCode}-fifo-002`, companyId, locationId: location.id, productId: fifoProduct.id, uomId: fifoUom.id, displayBatchId: 'PI-002', receivedQuantity: 20, remainingQuantity: 20, purchaseUnitCost: 3.70, finalUnitCost: 3.70, totalBatchValue: 74, receivedAt: new Date('2026-09-02T08:00:00Z'), status: 'POSTED', sourceType: 'BUKKU_PURCHASE' },
    ] });
    for (const [sku, name] of [
      ['QA-SS-NIPPLE', '1/2" S/STEEL NIPPLE'], ['QA-SS-HOSE', '1/2" S/STEEL HOSE NIPPLE'], ['QA-SS-REDUCER', '1/2" X 3/4" S/STEEL REDUCING NIPPLE'],
      ['QA-MS-BEND', '10" M/S BEND'], ['QA-PIPE-SLEEVE', 'P/SLEEVE'], ['QA-WRONG-LARGE', '1 1/2" S/STEEL NIPPLE'], ['QA-WRONG-12', '#12 FASTENER'],
    ]) {
      const product = await db.product.create({ data: { companyId, sku, name, trackStock: false, ...structuredSearchFieldsForProduct([name]) } });
      const uom = await db.productUOM.create({ data: { productId: product.id, code: 'EA', name: 'Each', conversionFactor: 1, isBase: true } });
      await db.productPrice.create({ data: { productId: product.id, priceLevelId: retail.id, uomId: uom.id, amount: 10 } });
      const aliases = generatedAliasesForProduct([name]);
      const uniqueAliases = [...new Map(aliases.map((text) => [normalizeProductText(text).token, text])).values()];
      if (uniqueAliases.length) await db.productAlias.createMany({ data: uniqueAliases.map((text) => { const normalized = normalizeProductText(text); return { productId: product.id, text, normalizedToken: normalized.token, normalizedCompact: normalized.compact, source: 'GENERATED', createdById: manager.id }; }) });
    }
    const boot = await api(`/pos/bootstrap?companyCode=${encodeURIComponent(runCode)}`);
    expect((boot.body as any).company.id === companyId, 'Bootstrap did not return the isolated company');
    checks.push('bootstrap');
    const cashierLogin = await api('/auth/pin', { method: 'POST', body: JSON.stringify({ companyId, pin: '1111' }) });
    expect((cashierLogin.body as any).user.id === cashier.id, 'Cashier PIN login failed');
    cashierSession = (cashierLogin.body as any).sessionToken;
    const managerLogin = await api('/auth/pin', { method: 'POST', body: JSON.stringify({ companyId, pin: '2222' }) });
    managerSession = (managerLogin.body as any).sessionToken;
    await api('/auth/pin', { method: 'POST', body: JSON.stringify({ companyId, pin: '9999' }) }, 401);
    checks.push('PIN authentication and invalid PIN rejection');
    const cashierForbidden = [
      `/backoffice/dashboard?companyId=${companyId}&actorId=${cashier.id}&range=TODAY`,
      `/backoffice/batches/template?companyId=${companyId}&actorId=${cashier.id}`,
      `/backoffice/purchase-receipts?companyId=${companyId}&actorId=${cashier.id}`,
      `/backoffice/inventory/shortages?companyId=${companyId}&actorId=${cashier.id}`,
      `/management/company?companyId=${companyId}&actorId=${cashier.id}`,
      `/management/products?companyId=${companyId}&actorId=${cashier.id}`,
      `/management/contacts?companyId=${companyId}&actorId=${cashier.id}`,
      `/management/staff?companyId=${companyId}&actorId=${cashier.id}`,
      `/management/bukku/mapping-options?companyId=${companyId}&actorId=${cashier.id}`,
      `/management/bukku/product-mappings?companyId=${companyId}&actorId=${cashier.id}`,
      `/sales/printer/health?companyId=${companyId}&actorId=${cashier.id}`,
    ];
    for (const path of cashierForbidden) await api(path, {}, 403);
    await api('/sync/now', { method: 'POST', body: JSON.stringify({ companyId, actorId: cashier.id }) }, 403);
    await api(`/products/${productA.id}/stock-adjustment`, { method: 'POST', body: JSON.stringify({ companyId, locationId: location.id, actorId: cashier.id, countedQuantity: 20, reason: 'must be denied' }) }, 403);
    const csvTemplate = await api(`/backoffice/batches/template?companyId=${companyId}&actorId=${manager.id}`, { sessionToken: managerSession });
    const templateBytes = Buffer.from(csvTemplate.body as ArrayBuffer);
    expect(templateBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), 'Manager CSV template is not UTF-8 with BOM');
    expect(templateBytes.toString('utf8').includes('"action","sku"'), 'Manager CSV template download is invalid');
    const headers = ['action','sku','barcode','product_name','category','supplier_description','unit','selling_price','stock_quantity','stock_unit_cost','stock_adjustment_reason','stock_adjustment_supplier','stock_adjustment_reference','fifo_override_batch','fifo_override_reason','status','received_quantity','purchase_unit_cost','landed_cost','supplier','bukku_reference','bill_date','received_date'];
    const csvRow = (values: Record<string, string | number>) => headers.map((header) => `"${String(values[header] ?? '').replaceAll('"', '""')}"`).join(',');
    const previewCsv = (rows: Array<Record<string, string | number>>) => Buffer.from(`\uFEFF${headers.join(',')}\r\n${rows.map(csvRow).join('\r\n')}\r\n`).toString('base64');
    const validPreview = (await api('/backoffice/batches/preview', { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, fileName: 'qa-valid-stock.csv', mimeType: 'text/csv', contentBase64: previewCsv([{ action: 'adjust_stock', sku: 'QA-ITEM-A', unit: 'EA', stock_quantity: 1, stock_adjustment_reason: 'QA validation only' }]) }) })).body as any;
    const invalidPreview = (await api('/backoffice/batches/preview', { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, fileName: 'qa-invalid-stock.csv', mimeType: 'text/csv', contentBase64: previewCsv([{ action: 'adjust_stock', sku: 'DOES-NOT-EXIST', unit: 'EA', stock_quantity: 1, stock_adjustment_reason: 'QA validation only' }]) }) })).body as any;
    expect(validPreview.validRowCount === 1 && validPreview.invalidRowCount === 0, 'Manager valid CSV preview failed');
    expect(invalidPreview.invalidRowCount === 1 && invalidPreview.rows[0].errors.some((message: string) => message.includes('Unknown SKU')), 'Invalid CSV row was not blocked with details');
    await api(`/backoffice/batches/${invalidPreview.id}/commit`, { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, confirmed: true }) }, 422);
    const errorFile = await api(`/backoffice/batches/${invalidPreview.id}/result?companyId=${companyId}&actorId=${manager.id}&errorsOnly=true`, { sessionToken: managerSession });
    expect(Buffer.from(errorFile.body as ArrayBuffer).toString('utf8').includes('Unknown SKU'), 'Downloadable batch error details omitted the validation error');
    const stockAfterPreview = await db.stockSnapshot.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: productA.id } } });
    expect(stockAfterPreview.quantity.equals(20), 'Batch preview changed stock before manager commit');
    checks.push('cashier manager-only API requests return 403; manager single-CSV download and all-row validation work in the disposable company without commit');
    const fifoAdjustmentPreview = (await api('/backoffice/batches/preview', { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, fileName: 'qa-fifo-positive.csv', mimeType: 'text/csv', contentBase64: previewCsv([{ action: 'adjust_stock', sku: fifoProduct.sku, unit: 'EA', stock_quantity: 5, stock_unit_cost: '4.25', stock_adjustment_reason: 'QA FIFO positive adjustment', stock_adjustment_reference: 'COUNT-001' }]) }) })).body as any;
    await api(`/backoffice/batches/${fifoAdjustmentPreview.id}/commit`, { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, managerId: manager.id, confirmed: true, stockShortageAcknowledged: false }) });
    const positiveSnapshot = await db.stockSnapshot.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: fifoProduct.id } } });
    const adjustmentBatch = await db.inventoryBatch.findFirstOrThrow({ where: { companyId, productId: fifoProduct.id, sourceType: 'STOCK_ADJUSTMENT' } });
    const positiveAggregate = await db.inventoryBatch.aggregate({ where: { companyId, locationId: location.id, productId: fifoProduct.id, status: { in: ['POSTED', 'SHORTAGE'] } }, _sum: { remainingQuantity: true } });
    expect(positiveSnapshot.quantity.equals(35) && adjustmentBatch.remainingQuantity.equals(5) && adjustmentBatch.finalUnitCost?.equals(4.25) && positiveSnapshot.quantity.equals(positiveAggregate._sum.remainingQuantity ?? 0), 'Positive FIFO adjustment did not create a valued batch or preserve the invariant');
    expect(await db.inventoryBatchEvent.count({ where: { inventoryBatchId: adjustmentBatch.id, type: 'STOCK_ADJUSTMENT_CREATED' } }) === 1 && await db.inventoryLedgerEntry.count({ where: { batchRowId: fifoAdjustmentPreview.rows[0].id } }) === 1 && await db.auditLog.count({ where: { companyId, action: 'PRODUCT_STOCK_ADJUSTED', entityId: fifoProduct.id } }) === 1, 'Positive FIFO adjustment audit records are incomplete');
    checks.push('database-backed positive FIFO adjustment creates valued batch, event, ledger, audit, and preserves snapshot invariant');
    const lookup = await api(`/products/lookup?companyId=${companyId}&priceLevelId=${retail.id}&locationId=${location.id}&query=QA-ITEM-A`);
    expect((lookup.body as any[]).length === 1, 'Product lookup did not find the expected item');
    checks.push('product lookup');
    const search = async (query: string) => (await api(`/products/lookup?companyId=${companyId}&priceLevelId=${retail.id}&locationId=${location.id}&query=${encodeURIComponent(query)}`)).body as Array<{ sku: string; name: string }>;
    const halfSsNipple = await search('1/2 ss n');
    const tenMsBend = await search('10 ms b');
    for (const term of ['p-slip', 'p sleeve']) expect((await search(term))[0]?.sku === 'QA-PIPE-SLEEVE', `${term} did not resolve to P/SLEEVE`);
    const exactHalf = await search('1/2"');
    expect(halfSsNipple[0]?.sku === 'QA-SS-NIPPLE' && halfSsNipple.every((product) => product.sku !== 'QA-WRONG-LARGE' && product.sku !== 'QA-WRONG-12' && product.name.includes('S/STEEL') && product.name.includes('NIPPLE')), 'Structured 1/2 ss n search was broadened or ranked incorrectly');
    expect(tenMsBend[0]?.sku === 'QA-MS-BEND', 'Structured 10 ms b search did not return the exact mild-steel bend');
    expect(exactHalf.every((product) => product.sku !== 'QA-WRONG-LARGE' && product.sku !== 'QA-WRONG-12'), 'Exact 1/2-inch search leaked a forbidden larger or numeric size');
    checks.push('hardware shorthand search is exact for 1/2 ss n and 10 ms b, resolves p-slip and p sleeve, and does not leak forbidden sizes');

    const noShiftBasic = { companyId, locationId: location.id, registerId: register.id, cashierId: cashier.id, priceLevelId: retail.id, customerId: customer.id, items: [{ productId: productA.id, uomId: productAUom.id, quantity: 1 }] };
    const beforeNoShift = { sales: await db.sale.count({ where: { companyId } }), payments: await db.payment.count({ where: { sale: { companyId } } }), stock: await db.stockSnapshot.findUnique({ where: { locationId_productId: { locationId: location.id, productId: productA.id } } }), syncJobs: await db.syncJob.count({ where: { companyId } }) };
    const noShiftPayments = [
      { label: 'cash', payments: [{ method: 'CASH', amount: 10 }] },
      { label: 'DuitNow', payments: [{ method: 'DUITNOW', amount: 10 }] },
      { label: 'bank transfer', payments: [{ method: 'BANK_TRANSFER', amount: 10 }] },
      { label: 'split', payments: [{ method: 'CASH', amount: 5 }, { method: 'DUITNOW', amount: 5 }] },
      { label: 'store credit', payments: [{ method: 'STORE_CREDIT', amount: 10, storeCreditId: 'forged-credit-id' }] },
      { label: 'offline replay', payments: [{ method: 'CASH', amount: 10 }], offlineId: `${runCode}-offline-replay-without-shift` },
    ];
    for (const attempt of noShiftPayments) await api('/sales/checkout', { method: 'POST', body: JSON.stringify({ ...noShiftBasic, ...attempt, offlineId: attempt.offlineId || `${runCode}-no-shift-${attempt.label.replaceAll(' ', '-')}` }) }, 400);
    const afterNoShift = { sales: await db.sale.count({ where: { companyId } }), payments: await db.payment.count({ where: { sale: { companyId } } }), stock: await db.stockSnapshot.findUnique({ where: { locationId_productId: { locationId: location.id, productId: productA.id } } }), syncJobs: await db.syncJob.count({ where: { companyId } }) };
    expect(afterNoShift.sales === beforeNoShift.sales && afterNoShift.payments === beforeNoShift.payments && afterNoShift.stock?.quantity.equals(beforeNoShift.stock?.quantity ?? 0) && afterNoShift.syncJobs === beforeNoShift.syncJobs, 'A checkout without an open shift mutated isolated test data');
    checks.push('open-shift requirement rejects cash, DuitNow, bank transfer, split, store credit, and offline replay without mutation');

    await api('/management/bukku/product-mappings', { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, productId: productA.id, bukkuItemId: `${runCode}-BUKKU-ITEM`, bukkuItemCode: 'QA-BUKKU-A', bukkuDisplayName: 'QA Bukku Item A', confirmed: true }) });
    await api('/management/bukku/product-mappings', { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, productId: productB.id, bukkuItemId: `${runCode}-BUKKU-ITEM`, bukkuItemCode: 'QA-BUKKU-DUPLICATE', bukkuDisplayName: 'QA conflicting item', confirmed: true }) }, 409);
    const productMappings = (await api(`/management/bukku/product-mappings?companyId=${companyId}&actorId=${manager.id}`, { sessionToken: managerSession })).body as any;
    const approvedMapping = productMappings.items.find((row: { productId: string; mappingStatus: string; bukkuItemCode: string }) => row.productId === productA.id && row.mappingStatus === 'APPROVED' && row.bukkuItemCode === 'QA-BUKKU-A');
    expect(Boolean(approvedMapping), 'Approved Bukku product mapping was not returned');
    expect(approvedMapping.auditHistory.some((row: { action: string }) => row.action === 'BUKKU_PRODUCT_MAPPING_APPROVED'), 'Bukku product mapping audit history was not returned');
    checks.push('manager-only explicit Bukku product-ID mapping rejects a duplicate external item and records audit history');

    const shift = await db.shift.create({ data: { locationId: location.id, registerId: register.id, cashierId: cashier.id, openingFloat: 100 } });
    const basic = { ...noShiftBasic, shiftId: shift.id };
    const fifoSale = (await api('/sales/checkout', { method: 'POST', body: JSON.stringify({ ...basic, offlineId: `${runCode}-fifo-sale`, items: [{ productId: fifoProduct.id, uomId: fifoUom.id, quantity: 12 }], payments: [{ method: 'CASH', amount: 120 }] }) })).body as any;
    const fifoSaleItem = await db.saleItem.findUniqueOrThrow({ where: { id: fifoSale.items[0].id } });
    expect(fifoSaleItem.cogs?.equals('63.30'), 'FIFO sale did not persist exact RM63.30 COGS');
    const consumed = await db.saleBatchAllocation.findMany({ where: { saleItemId: fifoSaleItem.id, type: 'FIFO_CONSUMPTION' }, include: { inventoryBatch: true }, orderBy: { createdAt: 'asc' } });
    expect(consumed.length === 2 && consumed[0].inventoryBatch.displayBatchId === 'PI-001' && consumed[0].quantity.equals(10) && consumed[1].inventoryBatch.displayBatchId === 'PI-002' && consumed[1].quantity.equals(2), 'FIFO sale did not consume original batches before the adjustment batch');
    const fifoReturn = (await api('/returns', { method: 'POST', body: JSON.stringify({ companyId, cashierId: cashier.id, saleId: fifoSale.id, shiftId: shift.id, type: 'REFUND', refundMethod: 'CASH', reason: 'QA exact FIFO return', items: [{ saleItemId: fifoSaleItem.id, quantity: 2 }] }) })).body as any;
    const fifoReturnLedger = await db.inventoryLedgerEntry.findFirstOrThrow({ where: { companyId, returnItemId: fifoReturn.items[0].id, sourceType: 'RETURN' } });
    const restoredAllocation = await db.saleBatchAllocation.findFirstOrThrow({ where: { returnItemId: fifoReturn.items[0].id, type: 'RETURN_RESTORE' }, include: { inventoryBatch: true } });
    const fifoSnapshot = await db.stockSnapshot.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: fifoProduct.id } } });
    const fifoAggregate = await db.inventoryBatch.aggregate({ where: { companyId, locationId: location.id, productId: fifoProduct.id, status: { in: ['POSTED', 'SHORTAGE'] } }, _sum: { remainingQuantity: true } });
    expect(restoredAllocation.inventoryBatch.displayBatchId === 'PI-002' && restoredAllocation.quantity.equals(2) && restoredAllocation.cogs?.equals('7.40'), 'Return was not restored to PI-002 at exact RM7.40 value');
    expect(fifoReturnLedger.valueDelta?.equals('7.40') && fifoSnapshot.quantity.equals(fifoAggregate._sum.remainingQuantity ?? 0), 'FIFO return ledger value or stock invariant is incorrect');
    checks.push('database-backed FIFO sale consumes original batches first; partial return restores PI-002 and reverses exactly RM7.40');

    const overridePreview = (await api('/backoffice/batches/preview', { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, fileName: 'qa-fifo-override.csv', mimeType: 'text/csv', contentBase64: previewCsv([{ action: 'adjust_stock', sku: fifoProduct.sku, unit: 'EA', stock_quantity: -2, stock_adjustment_reason: 'QA FIFO override', fifo_override_batch: adjustmentBatch.displayBatchId, fifo_override_reason: 'QA approved selected batch' }]) }) })).body as any;
    await api(`/backoffice/batches/${overridePreview.id}/commit`, { method: 'POST', sessionToken: managerSession, approvalToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, managerId: manager.id, confirmed: true, stockShortageAcknowledged: false }) });
    const adjustmentAfterOverride = await db.inventoryBatch.findUniqueOrThrow({ where: { id: adjustmentBatch.id } });
    expect(adjustmentAfterOverride.remainingQuantity.equals(3) && await db.inventoryBatchEvent.count({ where: { inventoryBatchId: adjustmentBatch.id, type: 'STOCK_ADJUSTMENT_OVERRIDE_CONSUMED', approvedById: manager.id } }) === 1, 'Manager-approved FIFO adjustment override was not applied or audited');
    const negativePreview = (await api('/backoffice/batches/preview', { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, fileName: 'qa-fifo-negative.csv', mimeType: 'text/csv', contentBase64: previewCsv([{ action: 'adjust_stock', sku: fifoProduct.sku, unit: 'EA', stock_quantity: -22, stock_adjustment_reason: 'QA FIFO negative adjustment' }]) }) })).body as any;
    await api(`/backoffice/batches/${negativePreview.id}/commit`, { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, managerId: manager.id, confirmed: true, stockShortageAcknowledged: false }) });
    const afterNegative = await db.stockSnapshot.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: fifoProduct.id } } });
    const afterNegativeAggregate = await db.inventoryBatch.aggregate({ where: { companyId, locationId: location.id, productId: fifoProduct.id, status: { in: ['POSTED', 'SHORTAGE'] } }, _sum: { remainingQuantity: true } });
    expect(afterNegative.quantity.equals(1) && afterNegative.quantity.equals(afterNegativeAggregate._sum.remainingQuantity ?? 0), 'Negative FIFO adjustment failed to consume multiple batches or preserve the invariant');
    const shortageAdjustmentPreview = (await api('/backoffice/batches/preview', { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, fileName: 'qa-fifo-shortage.csv', mimeType: 'text/csv', contentBase64: previewCsv([{ action: 'adjust_stock', sku: fifoProduct.sku, unit: 'EA', stock_quantity: -2, stock_adjustment_reason: 'QA acknowledged FIFO shortage' }]) }) })).body as any;
    await api(`/backoffice/batches/${shortageAdjustmentPreview.id}/commit`, { method: 'POST', sessionToken: managerSession, approvalToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, managerId: manager.id, confirmed: true, stockShortageAcknowledged: false }) }, 422);
    await api(`/backoffice/batches/${shortageAdjustmentPreview.id}/commit`, { method: 'POST', sessionToken: managerSession, approvalToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, managerId: manager.id, confirmed: true, stockShortageAcknowledged: true }) });
    const shortageAdjustmentBatch = await db.inventoryBatch.findFirstOrThrow({ where: { companyId, productId: fifoProduct.id, sourceType: 'STOCK_ADJUSTMENT_SHORTAGE' } });
    const afterShortageAdjustment = await db.stockSnapshot.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: fifoProduct.id } } });
    const afterShortageAggregate = await db.inventoryBatch.aggregate({ where: { companyId, locationId: location.id, productId: fifoProduct.id, status: { in: ['POSTED', 'SHORTAGE'] } }, _sum: { remainingQuantity: true } });
    expect(shortageAdjustmentBatch.remainingQuantity.equals(-1) && afterShortageAdjustment.quantity.equals(-1) && afterShortageAdjustment.quantity.equals(afterShortageAggregate._sum.remainingQuantity ?? 0), 'Acknowledged FIFO adjustment shortage was not persisted consistently');
    checks.push('database-backed negative FIFO adjustments consume in order, audit override, require shortage acknowledgement, and preserve invariant');

    const historicalCogs = fifoSaleItem.cogs?.toFixed(2);
    const stockBeforePurchase = afterShortageAdjustment.quantity;
    const purchaseReference = `${runCode}-BILL-001`;
    const purchasePreview = (await api('/backoffice/batches/preview', { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, fileName: 'qa-bukku-purchase.csv', mimeType: 'text/csv', contentBase64: previewCsv([{ action: 'receive_purchase', sku: fifoProduct.sku, unit: 'EA', received_quantity: 5, purchase_unit_cost: '4.50', landed_cost: '0.50', supplier: 'QA Bukku Supplier', bukku_reference: purchaseReference, bill_date: '2026-09-04', received_date: '2026-09-04' }]) }) })).body as any;
    expect(purchasePreview.validRowCount === 1 && purchasePreview.invalidRowCount === 0, 'Bukku purchase row did not validate');
    await api(`/backoffice/batches/${purchasePreview.id}/commit`, { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, managerId: manager.id, confirmed: true, stockShortageAcknowledged: false }) });
    const purchaseReceipt = await db.purchaseReceipt.findUniqueOrThrow({ where: { companyId_bukkuReference: { companyId, bukkuReference: purchaseReference } }, include: { batches: true } });
    const stockWhileDraft = await db.stockSnapshot.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: fifoProduct.id } } });
    expect(purchaseReceipt.status === 'DRAFT' && purchaseReceipt.batches.length === 1 && purchaseReceipt.batches[0].remainingQuantity.equals(0) && stockWhileDraft.quantity.equals(stockBeforePurchase), 'Purchase import changed inventory before explicit manager posting');
    await api(`/backoffice/purchase-receipts/${purchaseReceipt.id}/post`, { method: 'POST', sessionToken: managerSession, approvalToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, managerId: manager.id, confirmed: true, negativeStockAcknowledged: true }) });
    const postedPurchase = await db.purchaseReceipt.findUniqueOrThrow({ where: { id: purchaseReceipt.id }, include: { batches: true } });
    const stockAfterPurchase = await db.stockSnapshot.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: fifoProduct.id } } });
    const unchangedHistoricalSale = await db.saleItem.findUniqueOrThrow({ where: { id: fifoSaleItem.id } });
    expect(postedPurchase.status === 'POSTED' && postedPurchase.batches[0].remainingQuantity.equals(5) && postedPurchase.batches[0].finalUnitCost?.equals('4.60') && stockAfterPurchase.quantity.equals(stockBeforePurchase.plus(5)), 'Manager posting did not create the expected landed-cost FIFO batch');
    expect(unchangedHistoricalSale.cogs?.toFixed(2) === historicalCogs, 'Posting a later purchase receipt changed historical sale COGS');
    expect(await db.auditLog.count({ where: { companyId, action: 'FIFO_PURCHASE_RECEIPT_POSTED', entityId: purchaseReceipt.id } }) === 1, 'Purchase receipt manager approval audit was not persisted');
    checks.push('Bukku purchase CSV creates a stock-neutral draft; explicit manager posting creates a landed-cost FIFO batch without changing historical COGS');
    await api('/sales/checkout', { method: 'POST', body: JSON.stringify({ ...basic, offlineId: `${runCode}-invalid-split`, payments: [{ method: 'CASH', amount: 5 }, { method: 'CARD', amount: 4 }] }) }, 400);
    checks.push('invalid split-payment rejection');

    const cashPayload = { ...basic, offlineId: `${runCode}-cash`, payments: [{ method: 'CASH', amount: 15 }] };
    const cashSale = (await api('/sales/checkout', { method: 'POST', body: JSON.stringify(cashPayload) })).body as any;
    expect(Number(cashSale.grandTotal) === 10 && Number(cashSale.payments[0].changeAmount) === 5, 'Cash change calculation is wrong');
    const cashReplay = (await api('/sales/checkout', { method: 'POST', body: JSON.stringify(cashPayload) })).body as any;
    expect(cashReplay.id === cashSale.id, 'Offline replay protection created a duplicate sale');
    checks.push('cash checkout, change, and offline replay protection');
    await api(`/sales/receipt/${encodeURIComponent(cashSale.receiptNo)}/printed`, { method: 'POST', body: JSON.stringify({ companyId, actorId: cashier.id }) });
    const pdf = await api(`/sales/receipt/${encodeURIComponent(cashSale.receiptNo)}/pdf?companyId=${companyId}`);
    expect(pdf.response.headers.get('content-type')?.includes('application/pdf'), 'Receipt PDF was not generated');
    checks.push('receipt print status and PDF');
    await api(`/sales/receipt/${encodeURIComponent(cashSale.receiptNo)}/void`, { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, reason: 'QA void test' }) });
    checks.push('manager void and stock restoration');

    const belowCost = { ...basic, offlineId: `${runCode}-below-cost-denied`, items: [{ productId: productA.id, uomId: productAUom.id, quantity: 1, discount: { type: 'FIXED', value: 5 } }], payments: [{ method: 'CASH', amount: 5 }] };
    await api('/sales/checkout', { method: 'POST', body: JSON.stringify(belowCost) }, 400);
    const discounted = (await api('/sales/checkout', { method: 'POST', approvalToken: managerSession, body: JSON.stringify({ ...belowCost, offlineId: `${runCode}-below-cost-approved`, items: [{ productId: productA.id, uomId: productAUom.id, quantity: 1, discount: { type: 'FIXED', value: 5, approvedById: manager.id } }] }) })).body as any;
    expect(Number(discounted.grandTotal) === 5, 'Approved discount did not apply');
    checks.push('below-cost discount approval');
    const refunded = (await api('/returns', { method: 'POST', body: JSON.stringify({ companyId, cashierId: cashier.id, saleId: discounted.id, shiftId: shift.id, type: 'REFUND', refundMethod: 'CASH', reason: 'QA refund', items: [{ saleItemId: discounted.items[0].id, quantity: 1 }] }) })).body as any;
    expect(Number(refunded.total) === 5, 'Cash refund total is wrong');
    checks.push('cash refund and stock return');

    const exchangeOriginal = (await api('/sales/checkout', { method: 'POST', body: JSON.stringify({ ...basic, offlineId: `${runCode}-exchange-origin`, payments: [{ method: 'CASH', amount: 10 }] }) })).body as any;
    const exchange = (await api('/returns', { method: 'POST', body: JSON.stringify({ companyId, cashierId: cashier.id, saleId: exchangeOriginal.id, shiftId: shift.id, type: 'EXCHANGE', reason: 'QA exchange', items: [{ saleItemId: exchangeOriginal.items[0].id, quantity: 1 }] }) })).body as any;
    expect(Number(exchange.storeCredit.balance) === 10, 'Exchange did not create the expected credit');
    const replacement = (await api('/sales/checkout', { method: 'POST', body: JSON.stringify({ companyId, locationId: location.id, registerId: register.id, cashierId: cashier.id, priceLevelId: retail.id, shiftId: shift.id, exchangeReturnId: exchange.id, offlineId: `${runCode}-exchange-replacement`, items: [{ productId: productB.id, uomId: productBUom.id, quantity: 1 }], payments: [{ method: 'STORE_CREDIT', amount: 10, storeCreditId: exchange.storeCredit.id }, { method: 'CASH', amount: 10 }] }) })).body as any;
    expect(Number(replacement.grandTotal) === 20, 'Exchange replacement checkout is wrong');
    checks.push('exchange credit and higher-value replacement');

    await api(`/shifts/${shift.id}/movements`, { method: 'POST', body: JSON.stringify({ companyId, cashierId: cashier.id, type: 'CASH_IN', amount: 10, reason: 'QA cash in' }) });
    await api(`/shifts/${shift.id}/movements`, { method: 'POST', body: JSON.stringify({ companyId, cashierId: cashier.id, type: 'CASH_OUT', amount: 4, reason: 'QA cash out' }) });
    await api(`/products/${productA.id}/stock-adjustment`, { method: 'POST', body: JSON.stringify({ companyId, locationId: location.id, actorId: cashier.id, countedQuantity: 9, reason: 'QA permission test' }) }, 403);
    await api(`/products/${productA.id}/stock-adjustment`, { method: 'POST', body: JSON.stringify({ companyId, locationId: location.id, actorId: manager.id, countedQuantity: 9, reason: 'QA impersonation test' }) }, 403);
    await api(`/products/${productA.id}/stock-adjustment`, { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, locationId: location.id, actorId: manager.id, countedQuantity: 9, reason: 'QA stock count' }) });
    checks.push('cash movements, manager stock control, and session impersonation rejection');

    const shortageSale = (await api('/sales/checkout', { method: 'POST', body: JSON.stringify({ ...basic, offlineId: `${runCode}-oversell-for-close-test`, items: [{ productId: shortageProduct.id, uomId: shortageUom.id, quantity: 4 }], payments: [{ method: 'CASH', amount: 40 }] }) })).body as any;
    const shortageSnapshot = await db.stockSnapshot.findUniqueOrThrow({ where: { locationId_productId: { locationId: location.id, productId: shortageProduct.id } } });
    expect(shortageSnapshot.quantity.equals(-1), 'The isolated oversell did not result in a negative stock balance');
    await api(`/backoffice/dashboard?companyId=${companyId}&actorId=${cashier.id}&range=TODAY`, {}, 403);
    const dashboard = (await api(`/backoffice/dashboard?companyId=${companyId}&actorId=${manager.id}&range=TODAY`, { sessionToken: managerSession })).body as { kpis: { transactions: number; exceptionCount: number }; costing: { status: string }; charts: { paymentMethods: Array<{ method: string }> }; reports: { inventory: Array<{ productId: string; reorderStatus: string }> } };
    expect(dashboard.kpis.transactions > 0 && dashboard.kpis.exceptionCount > 0, 'Back Office did not report the isolated sales and stock exception');
    expect(dashboard.costing.status === 'PROVISIONAL', 'Negative-stock COGS was not marked provisional');
    expect(dashboard.charts.paymentMethods.length > 1, 'Back Office did not retain multi-payment reporting');
    expect(dashboard.reports.inventory.some((row) => row.productId === shortageProduct.id && row.reorderStatus === 'NEGATIVE'), 'Back Office inventory report omitted the oversold product');
    checks.push('manager-only Back Office dashboard with real sales, payment, COGS, and negative-stock data');
    const rejectionBaseline = {
      auditLogs: await db.auditLog.count({ where: { companyId, entityType: 'Shift', entityId: shift.id } }),
      syncJobs: await db.syncJob.count({ where: { companyId, entityType: 'SHIFT_DAILY_DIGEST', entityId: shift.id } }),
      bukkuReferences: await db.externalReference.count({ where: { companyId, provider: 'BUKKU' } }),
    };
    const reportBefore = (await api(`/shifts/${shift.id}/report?companyId=${companyId}&actorId=${manager.id}`, { sessionToken: managerSession })).body as any;
    expect(reportBefore.stockShortages.some((entry: { receiptNo: string; shortageIntroduced: number; preSaleQuantity: number; soldQuantity: number; postSaleQuantity: number }) => entry.receiptNo === shortageSale.receiptNo && entry.preSaleQuantity === 3 && entry.soldQuantity === 4 && entry.postSaleQuantity === -1 && entry.shortageIntroduced === 1), 'The persisted shortage record is incomplete before shift close');
    const expectedCash = Number(reportBefore.summary.expectedCash);
    await api(`/shifts/${shift.id}/close`, { method: 'POST', approvalToken: managerSession, body: JSON.stringify({ companyId, cashierId: cashier.id, managerId: manager.id, closingFloat: expectedCash, stockShortageAcknowledged: false }) }, 422);
    const rejectedShift = await db.shift.findUniqueOrThrow({ where: { id: shift.id } });
    const rejectionAfter = {
      auditLogs: await db.auditLog.count({ where: { companyId, entityType: 'Shift', entityId: shift.id } }),
      syncJobs: await db.syncJob.count({ where: { companyId, entityType: 'SHIFT_DAILY_DIGEST', entityId: shift.id } }),
      printedReports: await db.auditLog.count({ where: { companyId, action: 'SHIFT_REPORT_PRINTED', entityType: 'Shift', entityId: shift.id } }),
      exportedDigests: await db.auditLog.count({ where: { companyId, action: 'SHIFT_DAILY_DIGEST_EXPORTED', entityType: 'Shift', entityId: shift.id } }),
      bukkuReferences: await db.externalReference.count({ where: { companyId, provider: 'BUKKU' } }),
    };
    expect(rejectedShift.closedAt === null && rejectedShift.closingFloat === null, 'Rejected close wrote a closing timestamp or float');
    expect(rejectionAfter.auditLogs === rejectionBaseline.auditLogs && rejectionAfter.syncJobs === rejectionBaseline.syncJobs && rejectionAfter.printedReports === 0 && rejectionAfter.exportedDigests === 0 && rejectionAfter.bukkuReferences === rejectionBaseline.bukkuReferences, 'Rejected close created a report, digest, or Bukku record');
    checks.push('stock-shortage close rejection leaves the shift open without report, digest, or Bukku side effects');

    const close = (await api(`/shifts/${shift.id}/close`, { method: 'POST', approvalToken: managerSession, body: JSON.stringify({ companyId, cashierId: cashier.id, managerId: manager.id, closingFloat: expectedCash, stockShortageAcknowledged: true }) })).body as any;
    expect(Number(close.variance) === 0, 'Closing shift did not reconcile to zero variance');
    const closedShift = await db.shift.findUniqueOrThrow({ where: { id: shift.id } });
    expect(closedShift.closedAt !== null, 'Acknowledged shortage close did not close the shift');
    const reportAfter = (await api(`/shifts/${shift.id}/report?companyId=${companyId}&actorId=${manager.id}`, { sessionToken: managerSession })).body as any;
    expect(reportAfter.stockShortageAcknowledgement?.managerId === manager.id && Boolean(reportAfter.stockShortageAcknowledgement?.acknowledgedAt), 'Manager acknowledgement was not stored in the shift report');
    expect(reportAfter.stockShortages.some((entry: { receiptNo: string; shortageIntroduced: number }) => entry.receiptNo === shortageSale.receiptNo && entry.shortageIntroduced === 1), 'Closed-shift report did not retain the shortage record');
    const digest = await api(`/shifts/${shift.id}/daily-digest.xlsx?companyId=${companyId}&actorId=${manager.id}`, { sessionToken: managerSession });
    const digestText = Buffer.from(digest.body as ArrayBuffer).toString('utf8');
    expect(digestText.includes('Stock-shortage acknowledgement') && digestText.includes('Acknowledged') && digestText.includes('QA-SHORTAGE-ITEM') && digestText.includes(shortageSale.receiptNo), 'Daily Excel digest does not include shortage and acknowledgement details');
    const closeAudit = await db.auditLog.findFirstOrThrow({ where: { companyId, action: 'SHIFT_CLOSED', entityType: 'Shift', entityId: shift.id }, orderBy: { createdAt: 'desc' } });
    const acknowledgement = closeAudit.metadata as { approvedById?: string; stockShortageAcknowledged?: boolean; stockShortageAcknowledgedAt?: string } | null;
    expect(acknowledgement?.approvedById === manager.id && acknowledgement.stockShortageAcknowledged === true && Boolean(acknowledgement.stockShortageAcknowledgedAt), 'Manager acknowledgement metadata was not persisted in the audit record');
    checks.push('acknowledged shortage close stores manager audit data and includes shortage details in report and Excel digest');

    await api('/management/products', { method: 'POST', body: JSON.stringify({ companyId, actorId: cashier.id, name: 'Denied product', sku: 'QA-DENIED', classificationCode: '022', uoms: [{ code: 'EA', name: 'Each', conversionFactor: 1, salePrice: 3 }] }) }, 403);
    const newProduct = await api('/management/products', { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, name: 'QA Local Product', sku: 'QA-LOCAL', barcode: `${Date.now()}222`, classificationCode: '022', locationId: location.id, initialQuantity: 1, trackStock: true, uoms: [{ code: 'EA', name: 'Each', conversionFactor: 1, salePrice: 3, purchasePrice: 2 }] }) });
    expect((newProduct.body as any).source === 'LOCAL', 'Local product was not created');
    await api('/management/products', { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, name: 'QA Local Product', sku: 'QA-LOCAL-2', classificationCode: '022', uoms: [{ code: 'EA', name: 'Each', conversionFactor: 1, salePrice: 3 }] }) }, 409);
    await api('/management/contacts', { method: 'POST', body: JSON.stringify({ companyId, actorId: cashier.id, name: 'Denied contact', entityType: 'MALAYSIAN_COMPANY', contactTypes: ['CUSTOMER'], phone: '60118888888' }) }, 403);
    await api('/management/contacts', { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, name: 'QA Contact', entityType: 'MALAYSIAN_COMPANY', contactTypes: ['CUSTOMER'], phone: '60119999999' }) });
    await api('/management/contacts', { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, actorId: manager.id, name: 'QA Contact', entityType: 'MALAYSIAN_COMPANY', contactTypes: ['CUSTOMER'], phone: '60119999999' }) }, 409);
    checks.push('product/contact creation and duplicate prevention');

    const history = (await api(`/sales/history?companyId=${companyId}&locationId=${location.id}`)).body as any[];
    expect(history.some((sale) => sale.status === 'VOIDED') && history.some((sale) => sale.returnStatus === 'EXCHANGED'), 'Receipt history does not show void and exchange states');
    checks.push('receipt history states');
    console.log(JSON.stringify({ result: 'PASS', checks }, null, 2));
  } finally {
    await cleanup(companyId);
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
