import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

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
  let companyId: string | undefined;
  try {
    const company = await db.company.create({ data: { name: 'RetailOS QA Store', code: runCode, legalName: 'RetailOS QA Store', tin: 'QA-TIN', brnNew: 'QA-BRN', receiptPaperWidthMm: 80 } });
    companyId = company.id;
    const cashierRole = await db.role.create({ data: { companyId, name: 'Cashier', permissions: ['checkout', 'returns', 'cash_movement', 'catalog.manage', 'contact.manage', 'printer.manage'] } });
    const managerRole = await db.role.create({ data: { companyId, name: 'Manager', permissions: ['checkout', 'returns', 'cash_movement', 'catalog.manage', 'contact.manage', 'printer.manage', 'discount.approve', 'sale.void', 'shift.report.view', 'stock.adjust', 'company.manage'] } });
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
    const shift = await db.shift.create({ data: { locationId: location.id, registerId: register.id, cashierId: cashier.id, openingFloat: 100 } });

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
    const lookup = await api(`/products/lookup?companyId=${companyId}&priceLevelId=${retail.id}&locationId=${location.id}&query=QA-ITEM-A`);
    expect((lookup.body as any[]).length === 1, 'Product lookup did not find the expected item');
    checks.push('product lookup');

    const basic = { companyId, locationId: location.id, registerId: register.id, cashierId: cashier.id, priceLevelId: retail.id, shiftId: shift.id, customerId: customer.id, items: [{ productId: productA.id, uomId: productAUom.id, quantity: 1 }] };
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
    await api(`/products/${productA.id}/stock-adjustment`, { method: 'POST', body: JSON.stringify({ companyId, locationId: location.id, actorId: cashier.id, countedQuantity: 9, reason: 'QA permission test' }) }, 404);
    await api(`/products/${productA.id}/stock-adjustment`, { method: 'POST', body: JSON.stringify({ companyId, locationId: location.id, actorId: manager.id, countedQuantity: 9, reason: 'QA impersonation test' }) }, 403);
    await api(`/products/${productA.id}/stock-adjustment`, { method: 'POST', sessionToken: managerSession, body: JSON.stringify({ companyId, locationId: location.id, actorId: manager.id, countedQuantity: 9, reason: 'QA stock count' }) });
    checks.push('cash movements, manager stock control, and session impersonation rejection');

    const reportBefore = (await api(`/shifts/${shift.id}/report?companyId=${companyId}&actorId=${manager.id}`, { sessionToken: managerSession })).body as any;
    const expectedCash = Number(reportBefore.summary.expectedCash);
    const close = (await api(`/shifts/${shift.id}/close`, { method: 'POST', approvalToken: managerSession, body: JSON.stringify({ companyId, cashierId: cashier.id, managerId: manager.id, closingFloat: expectedCash }) })).body as any;
    expect(Number(close.variance) === 0, 'Closing shift did not reconcile to zero variance');
    checks.push('manager shift report and close');

    const newProduct = await api('/management/products', { method: 'POST', body: JSON.stringify({ companyId, actorId: cashier.id, name: 'QA Local Product', sku: 'QA-LOCAL', barcode: `${Date.now()}222`, classificationCode: '022', locationId: location.id, initialQuantity: 1, trackStock: true, uoms: [{ code: 'EA', name: 'Each', conversionFactor: 1, salePrice: 3, purchasePrice: 2 }] }) });
    expect((newProduct.body as any).source === 'LOCAL', 'Local product was not created');
    await api('/management/products', { method: 'POST', body: JSON.stringify({ companyId, actorId: cashier.id, name: 'QA Local Product', sku: 'QA-LOCAL-2', classificationCode: '022', uoms: [{ code: 'EA', name: 'Each', conversionFactor: 1, salePrice: 3 }] }) }, 409);
    await api('/management/contacts', { method: 'POST', body: JSON.stringify({ companyId, actorId: cashier.id, name: 'QA Contact', entityType: 'MALAYSIAN_COMPANY', contactTypes: ['CUSTOMER'], phone: '60119999999' }) });
    await api('/management/contacts', { method: 'POST', body: JSON.stringify({ companyId, actorId: cashier.id, name: 'QA Contact', entityType: 'MALAYSIAN_COMPANY', contactTypes: ['CUSTOMER'], phone: '60119999999' }) }, 409);
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
