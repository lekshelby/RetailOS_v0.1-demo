const state = { config: null, user: null, sessionToken: null, approvalTokens: {}, cart: [], saleDiscount: null, exchangeCredit: null, exchangeItems: [], exchangeRefundPreference: null, searchResults: [], recentItems: [], exchangeSearchResults: [], receiptHistory: [], discountTarget: null, voidSale: null, editingProduct: null, shift: null, returnSale: null, scannerStream: null, scannerActive: false, searchTimer: null, searchEpoch: 0, managementSearchTimer: null, alertTimer: null, toastTimer: null, syncProgressTimer: null, catalogue: [], catalogueSavedAt: null, replayingOfflineSales: false, language: localStorage.getItem('retailos-language') || 'en' };
const $ = (selector) => document.querySelector(selector);
const money = (value) => `RM${Number(value || 0).toFixed(2)}`;
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const languageText = {
  en: { sale: 'New sale', cart: 'Cart', signOut: 'Sign out', settings: 'Settings', dashboard: 'Dashboard', receipts: 'Receipts', contacts: 'Contacts', products: 'Products', cashMove: 'Cash in/out', sync: 'Sync now', report: 'Shift report', addItem: 'Add item', cashCheckout: 'Cash checkout', findReceipt: 'Find / reprint receipt' },
  zh: { sale: '新销售', cart: '购物车', signOut: '退出', settings: '设置', dashboard: '主页', receipts: '收据', contacts: '联系人', products: '产品', cashMove: '现金存取', sync: '立即同步', report: '班次报表', addItem: '添加商品', cashCheckout: '现金结账', findReceipt: '查找 / 重印收据' },
};
function applyLanguage() {
  const text = languageText[state.language] || languageText.en;
  document.documentElement.lang = state.language === 'zh' ? 'zh-Hans' : 'en';
  $('#language-select').value = state.language;
  const labels = { '.pos header h1': text.sale, '#open-cart span': text.cart, '#sign-out': text.signOut, '#nav-company span:last-child': text.settings, '#nav-dashboard span:last-child': text.dashboard, '#nav-receipts span:last-child': text.receipts, '#nav-contacts span:last-child': text.contacts, '#nav-products span:last-child': text.products, '#cash-movement': text.cashMove, '#sync-now': text.sync, '#shift-report': text.report, '.lookup h2': text.addItem, '#pay-cash': text.cashCheckout, '#receipt-panel h2': text.findReceipt };
  Object.entries(labels).forEach(([selector, value]) => { const element = $(selector); if (element) element.textContent = value; });
}
function showAlert(error) {
  const message = error instanceof Error ? error.message : String(error || 'Something went wrong');
  $('#app-alert-text').textContent = message; $('#app-alert').classList.remove('hidden');
  clearTimeout(state.alertTimer); state.alertTimer = setTimeout(() => $('#app-alert').classList.add('hidden'), 7000);
}
function showToast(message) {
  $('#app-toast-text').textContent = message; $('#app-toast').classList.remove('hidden');
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => $('#app-toast').classList.add('hidden'), 4500);
}
function setSyncProgress(percent, label) {
  const button = $('#sync-now'); if (!button) return;
  button.textContent = `Sync ${percent}%${label ? ` · ${label}` : ''}`;
  button.setAttribute('aria-label', `Sync progress ${percent} percent${label ? `: ${label}` : ''}`);
}
function startSyncProgress() {
  clearInterval(state.syncProgressTimer); let percent = 10;
  setSyncProgress(percent, 'starting');
  state.syncProgressTimer = setInterval(() => { percent = Math.min(65, percent + 5); setSyncProgress(percent, 'syncing Bukku'); }, 1000);
}
function finishSyncProgress() { clearInterval(state.syncProgressTimer); state.syncProgressTimer = null; setTimeout(() => { const button = $('#sync-now'); if (button) { button.textContent = languageText[state.language]?.sync || 'Sync now'; button.removeAttribute('aria-label'); } }, 900); }
function reveal(element) { element.classList.remove('hidden'); }
function mirrorErrorMessage(selector, isSuccess = () => false) {
  const element = $(selector);
  new MutationObserver(() => { const text = element.textContent.trim(); if (text && !isSuccess(text)) showAlert(new Error(text)); }).observe(element, { childList: true, characterData: true, subtree: true });
}
mirrorErrorMessage('#login-message');
mirrorErrorMessage('#checkout-message', (text) => text.startsWith('Recovered your saved cart') || text.startsWith('Exchange replacement cancelled'));
mirrorErrorMessage('#management-message', (text) => /saved\.$|created as a local (product|contact)\.$/.test(text));
function makeMessageDismissible(selector) {
  const message = $(selector); if (!message || message.parentElement?.classList.contains('message-with-dismiss')) return;
  const wrapper = document.createElement('div'); wrapper.className = 'message-with-dismiss hidden';
  message.before(wrapper); wrapper.append(message);
  const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'message-dismiss'; dismiss.setAttribute('aria-label', 'Dismiss message'); dismiss.textContent = '×';
  dismiss.addEventListener('click', () => { message.textContent = ''; }); wrapper.append(dismiss);
  new MutationObserver(() => wrapper.classList.toggle('hidden', !message.textContent.trim())).observe(message, { childList: true, characterData: true, subtree: true });
}
['#login-message', '#checkout-message', '#management-message', '#split-error'].forEach(makeMessageDismissible);

async function request(path, options = {}) {
  const { sessionToken, approvalToken, headers: optionHeaders, ...fetchOptions } = options;
  const token = sessionToken || state.sessionToken;
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(approvalToken ? { 'X-RetailOS-Approval': approvalToken } : {}), ...(optionHeaders || {}) };
  const response = await fetch(`/api${path}`, { ...fetchOptions, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message || 'Request failed'); showAlert(error); throw error; }
  return body;
}

function selectedLocation() { return state.config.locations.find((location) => location.id === $('#location-select').value); }
function selectedPriceLevel() { return state.config.priceLevels.find((level) => level.id === $('#price-level-select').value); }
function cartStorageKey() { return state.config && state.user ? `retailos-cart:${state.config.company.id}:${state.user.id}` : null; }
function persistCart() { const key = cartStorageKey(); if (!key) return; if (!state.cart.length) { localStorage.removeItem(key); return; } localStorage.setItem(key, JSON.stringify({ cart: state.cart, savedAt: new Date().toISOString() })); }
function restoreCart() { const key = cartStorageKey(); if (!key) return false; try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (!Array.isArray(saved?.cart) || !saved.cart.length) return false; state.cart = saved.cart; return true; } catch (_) { localStorage.removeItem(key); return false; } }
function clearSavedCart() { const key = cartStorageKey(); if (key) localStorage.removeItem(key); }
function offlineSessionKey() { return 'retailos-offline-session'; }
function persistentSessionKey() { return 'retailos-session'; }
function catalogueKey() { return state.config && selectedLocation() && selectedPriceLevel() ? `${state.config.company.id}:${selectedLocation().id}:${selectedPriceLevel().id}` : null; }
function isNetworkIssue(error) { return !navigator.onLine || error instanceof TypeError || /network|fetch|failed to fetch|load failed/i.test(String(error?.message || error)); }
function offlineId() { return typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function saveOfflineSession() { if (!state.config || !state.user) return; sessionStorage.setItem(offlineSessionKey(), JSON.stringify({ config: state.config, user: state.user, shift: state.shift, savedAt: new Date().toISOString() })); }
function savePersistentSession() {
  if (!state.config || !state.user || !state.sessionToken) return;
  localStorage.setItem(persistentSessionKey(), JSON.stringify({ config: state.config, user: state.user, sessionToken: state.sessionToken, shift: state.shift, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 }));
}
function clearPersistentSession() { localStorage.removeItem(persistentSessionKey()); sessionStorage.removeItem(offlineSessionKey()); }
function closeItemSearch(clearInput = true) {
  state.searchEpoch += 1; clearTimeout(state.searchTimer); state.searchResults = []; $('#search-results').innerHTML = '';
  if (clearInput) $('#lookup-query').value = '';
  $('#lookup-query').blur();
}
function updateConnectionStatus(pendingCount = null, needsReviewCount = 0) {
  const status = $('#connection-status'); if (!status) return;
  const pending = pendingCount == null ? 0 : pendingCount;
  status.classList.toggle('offline', !navigator.onLine); status.classList.toggle('pending', navigator.onLine && pending > 0);
  if (!navigator.onLine) status.textContent = pending ? `Offline · ${pending} sale${pending === 1 ? '' : 's'} pending` : 'Offline · orders saved on this device';
  else status.textContent = needsReviewCount ? `Online · ${needsReviewCount} sale${needsReviewCount === 1 ? '' : 's'} needs review` : pending ? `Online · ${pending} sale${pending === 1 ? '' : 's'} syncing` : state.catalogueSavedAt ? 'Online · catalogue saved' : 'Online';
}
async function refreshOfflineStatus() { try { const sales = await window.RetailOffline.getSales(); updateConnectionStatus(sales.length, sales.filter((sale) => sale.status === 'NEEDS_REVIEW').length); } catch (_) { updateConnectionStatus(0); } }
function productFromCatalogue(product) {
  const availableUoms = product.uoms.map((uom) => { const price = product.prices.find((value) => value.uomId === uom.id); return price ? { uom, unitPrice: Number(price.amount) } : null; }).filter(Boolean);
  const first = availableUoms[0];
  return !first ? null : { id: product.id, name: product.name, sku: product.sku, supplierDescription: product.supplierDescription, supplierName: product.supplierName, lastPurchasedAt: product.lastPurchasedAt, uom: first.uom, unitPrice: first.unitPrice, availableUoms, availableStock: product.stock == null ? null : Number(product.stock), basePurchaseCost: product.basePurchaseCost == null ? null : Number(product.basePurchaseCost) };
}
function searchCachedCatalogue(query) {
  const term = query.trim().toLowerCase();
  return state.catalogue.filter((product) => [product.sku, product.name, product.supplierDescription, ...(product.barcodes || [])].some((value) => String(value || '').toLowerCase().includes(term))).slice(0, 20).map(productFromCatalogue).filter(Boolean);
}
function renderSearchResults(products, source = '') {
  state.searchResults = products;
  $('#search-results').innerHTML = products.length ? `${source ? `<p class="muted small">${source}</p>` : ''}${products.map((product, index) => `<article class="product"><div><strong>${escapeHtml(product.name)}</strong><p>${escapeHtml(product.sku)} · ${escapeHtml(product.uom.name)} · ${money(product.unitPrice)} · ${product.availableStock == null ? 'Stock not tracked' : `Available ${product.availableStock}`}${product.supplierDescription ? ` · ${escapeHtml(product.supplierDescription)}` : ''}</p></div><button data-product-index="${index}">Add</button></article>`).join('')}` : '<p class="muted">No matching cached items.</p>';
}
async function loadOfflineCatalogue() {
  const key = catalogueKey(); if (!key || !window.RetailOffline) return;
  const cached = await window.RetailOffline.getCatalogue(key);
  if (!cached) return;
  state.catalogue = cached.items || []; state.catalogueSavedAt = cached.savedAt || null; await refreshOfflineStatus();
}
async function cacheCatalogue() {
  if (!navigator.onLine || !state.config || !window.RetailOffline) return false;
  const key = catalogueKey(); if (!key) return false;
  const items = []; let offset = 0;
  do {
    const page = await request(`/products/catalog?companyId=${encodeURIComponent(state.config.company.id)}&priceLevelId=${encodeURIComponent(selectedPriceLevel().id)}&locationId=${encodeURIComponent(selectedLocation().id)}&offset=${offset}&limit=500`);
    items.push(...page.items); offset = page.nextOffset;
  } while (offset != null);
  await window.RetailOffline.putCatalogue(key, items);
  state.catalogue = items; state.catalogueSavedAt = new Date().toISOString(); await refreshOfflineStatus();
  return true;
}
function localReceipt(entry) {
  return { receiptNo: entry.provisionalReceiptNo, completedAt: entry.createdAt, offline: true, company: { ...state.config.company }, location: selectedLocation(), register: { name: $('#register-select').selectedOptions[0]?.textContent || 'Register' }, cashier: { name: state.user.name }, items: entry.items.map((item) => ({ description: item.name, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: Number((item.quantity * item.unitPrice - lineDiscount(item)).toFixed(2)), uom: item.uom })), payments: entry.payload.payments.map((payment) => payment.method === 'CASH' ? { ...payment, tenderedAmount: payment.amount, amount: Math.min(payment.amount, entry.total), changeAmount: Math.max(0, Number(payment.amount) - Number(entry.total)) } : payment), grandTotal: entry.total, subtotal: entry.subtotal, discountTotal: entry.discount };
}
async function queueOfflineSale(payload, snapshot) {
  const entry = { offlineId: payload.offlineId, companyId: payload.companyId, payload, items: snapshot, subtotal: totals().subtotal, discount: totals().discount, total: totals().total, provisionalReceiptNo: `OFF-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${payload.offlineId.slice(0, 6).toUpperCase()}`, createdAt: new Date().toISOString(), status: 'PENDING' };
  await window.RetailOffline.putSale(entry); await refreshOfflineStatus();
  return { receiptNo: entry.provisionalReceiptNo, offline: true, local: localReceipt(entry) };
}
async function replayOfflineSales() {
  if (!navigator.onLine || state.replayingOfflineSales || !state.config || !window.RetailOffline) return;
  state.replayingOfflineSales = true;
  try {
    const entries = (await window.RetailOffline.getSales()).filter((entry) => entry.companyId === state.config.company.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let replayed = 0;
    for (const entry of entries) {
      try { await request('/sales/checkout', { method: 'POST', body: JSON.stringify(entry.payload) }); await window.RetailOffline.removeSale(entry.offlineId); replayed += 1; }
      catch (error) { await window.RetailOffline.putSale({ ...entry, status: 'NEEDS_REVIEW', lastError: error.message, lastAttemptAt: new Date().toISOString() }); }
    }
    if (replayed) showToast(`${replayed} offline sale${replayed === 1 ? '' : 's'} synced successfully.`);
  } finally { state.replayingOfflineSales = false; await refreshOfflineStatus(); }
}
function lineGross(line) { return line.quantity * line.unitPrice; }
function discountAmount(gross, discount, quantity = 1) { if (!discount) return 0; const amount = discount.type === 'PERCENTAGE' ? gross * Math.min(discount.value, 100) / 100 : discount.value * (discount.basis === 'PER_UNIT' ? quantity : 1); return Math.min(gross, amount); }
function lineDiscount(line) { return discountAmount(lineGross(line), line.discount, line.quantity); }
function formulaValue(value) { const text = String(value || '').trim(); if (!text) return 0; if (!/^[0-9. +*/()-]+$/.test(text)) return NaN; try { const result = Function(`"use strict"; return (${text})`)(); return Number.isFinite(result) && result >= 0 ? result : NaN; } catch (_) { return NaN; } }
function parseDiscountExpression(value) { const text = String(value || '').trim(); const percentage = text.endsWith('%'); const amount = formulaValue(percentage ? text.slice(0, -1) : text); return Number.isFinite(amount) ? { type: percentage ? 'PERCENTAGE' : 'FIXED', value: amount } : null; }
function totals() { const subtotal = state.cart.reduce((sum, line) => sum + lineGross(line), 0); const lineDiscountTotal = state.cart.reduce((sum, line) => sum + lineDiscount(line), 0); const afterLines = subtotal - lineDiscountTotal; const saleDiscount = discountAmount(afterLines, state.saleDiscount); return { subtotal, discount: lineDiscountTotal + saleDiscount, total: afterLines - saleDiscount }; }

function renderConfig() {
  $('#company-name').textContent = state.config.company.name;
  $('#cashier-name').textContent = state.user.name;
  $('#location-select').innerHTML = state.config.locations.map((location) => `<option value="${location.id}">${location.name}</option>`).join('');
  $('#price-level-select').innerHTML = state.config.priceLevels.map((level) => `<option value="${level.id}">${level.name}</option>`).join('');
  const retail = state.config.priceLevels.find((level) => level.code === 'RETAIL');
  if (retail) $('#price-level-select').value = retail.id;
  $('#shift-report').classList.toggle('hidden', !state.user.permissions.includes('shift.report.view'));
  // Settings is available at the till too; the individual cards still enforce
  // the user's specific access level.
  $('#nav-company').classList.remove('hidden');
  renderRegisters();
  applyLanguage();
}

function renderRegisters() { const location = selectedLocation(); $('#register-select').innerHTML = location.registers.map((register) => `<option value="${register.id}">${register.name}</option>`).join(''); }
async function loadCurrentShift() {
  try {
    state.shift = await request(`/shifts/current?registerId=${encodeURIComponent($('#register-select').value)}&companyId=${encodeURIComponent(state.config.company.id)}`);
    const openedAt = new Date(state.shift.openedAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
    $('#shift-status').textContent = `Shift: open since ${openedAt}`;
    $('#shift-action').textContent = 'Close shift'; $('#cash-movement').disabled = false;
    saveOfflineSession();
  } catch (_) {
    if (!navigator.onLine && state.shift) {
      const openedAt = new Date(state.shift.openedAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
      $('#shift-status').textContent = `Shift: offline · opened since ${openedAt}`;
      $('#shift-action').textContent = 'Close shift'; $('#cash-movement').disabled = true;
      return;
    }
    state.shift = null;
    $('#shift-status').textContent = 'Shift: not open';
    $('#shift-action').textContent = 'Open shift'; $('#cash-movement').disabled = true;
    saveOfflineSession();
  }
}

async function operateShift() {
  const location = selectedLocation(); const registerId = $('#register-select').value;
  if (!state.shift) {
    $('#shift-opening-float').value = '0.00'; $('#shift-open-dialog').classList.remove('hidden'); $('#shift-opening-float').focus(); return;
  }
  $('#shift-closing-float').value = state.user.permissions.includes('shift.report.view') ? Number(state.shift.expectedCash).toFixed(2) : '';
  $('#shift-manager-pin').value = '';
  $('#shift-close-dialog').classList.remove('hidden');
}

async function openShiftFromDialog() {
  if (state.shift) throw new Error('A shift is already open');
  const openingFloat = Number($('#shift-opening-float').value);
  if (!Number.isFinite(openingFloat) || openingFloat < 0) throw new Error('Enter a valid opening cash float');
  const location = selectedLocation();
  state.shift = await request('/shifts/open', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, locationId: location.id, registerId: $('#register-select').value, cashierId: state.user.id, openingFloat }) });
  $('#shift-open-dialog').classList.add('hidden'); await loadCurrentShift(); showToast('Shift opened. Bukku and the local catalogue will sync automatically.');
}

async function addCashMovement() {
  if (!state.shift) throw new Error('Open a shift before recording cash movement');
  $('#cash-movement-form').reset();
  $('#cash-movement-type').value = 'CASH_IN';
  $('#cash-movement-dialog').classList.remove('hidden');
  $('#cash-movement-amount').focus();
}

async function saveCashMovement() {
  if (!state.shift) throw new Error('Open a shift before recording cash movement');
  const amount = Number($('#cash-movement-amount').value);
  const reason = $('#cash-movement-reason').value.trim();
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid cash amount');
  if (!reason) throw new Error('A reason is required');
  await request(`/shifts/${state.shift.id}/movements`, { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, cashierId: state.user.id, type: $('#cash-movement-type').value, amount, reason }) });
  $('#cash-movement-dialog').classList.add('hidden');
  await loadCurrentShift();
  showToast('Cash movement saved.');
}

async function showShiftReport(shiftId = state.shift?.id, reportActorId = state.user.id, sessionToken = null) {
  if (!shiftId) return showShiftReportHistory();
  if (reportActorId === state.user.id && !state.user.permissions.includes('shift.report.view')) throw new Error('Manager access is required for shift reports');
  const report = await request(`/shifts/${shiftId}/report?companyId=${encodeURIComponent(state.config.company.id)}&actorId=${encodeURIComponent(reportActorId)}`, { sessionToken });
  const payments = Object.entries(report.paymentTotals).map(([method, amount]) => `<li>${escapeHtml(method)}: ${money(amount)}</li>`).join('') || '<li>No completed payments</li>';
  const refunds = report.returns.length ? report.returns.map((item) => `<li>${escapeHtml(item.type)}: ${money(item.total)}</li>`).join('') : '<li>No returns processed in this shift</li>';
  const stockFollowUp = report.negativeStock?.length ? `<section class="receipt-stock-warning"><h3>Stock follow-up required</h3><p>These items were sold after the recorded stock reached zero. Count and correct them in Bukku before the next stock sync.</p><ul>${report.negativeStock.map((item) => `<li><strong>${escapeHtml(item.name)}</strong> (${escapeHtml(item.sku)}) — short ${Number(item.shortageQuantity).toFixed(4).replace(/\.0+$/, '')}</li>`).join('')}</ul></section>` : '';
  $('#printable-receipt').style.setProperty('--receipt-width', '80mm');
  $('#printable-receipt').innerHTML = `<div class="receipt-head"><h3>Shift report</h3><p>${escapeHtml(report.shift.location)} · ${escapeHtml(report.shift.register)}</p><p>Cashier: ${escapeHtml(report.shift.cashier)}</p><p>Opened: ${new Date(report.shift.openedAt).toLocaleString('en-MY')}</p>${report.shift.closedAt ? `<p>Closed: ${new Date(report.shift.closedAt).toLocaleString('en-MY')}</p>` : ''}</div><div class="receipt-lines"><p>Sales ${report.summary.salesCount} · Gross ${money(report.summary.grossSales)}</p><p>Discounts ${money(report.summary.discountTotal)}</p><p>Cash sales ${money(report.summary.cashSales)} · Cash refunds ${money(report.summary.cashRefunds)}</p><p>Cash in ${money(report.summary.cashIn)} · Cash out ${money(report.summary.cashOut)}</p></div><div class="receipt-summary"><div><span>Expected cash</span><strong>${money(report.summary.expectedCash)}</strong></div>${report.summary.variance !== undefined ? `<div><span>Variance</span><strong>${money(report.summary.variance)}</strong></div>` : ''}</div>${stockFollowUp}<div class="receipt-payment"><h3>Payments</h3><ul>${payments}</ul><h3>Returns</h3><ul>${refunds}</ul></div><div class="receipt-actions"><button type="button" class="primary" data-print-shift-report="${escapeHtml(report.shift.id)}">Print shift report</button></div>`;
  $('#receipt-panel').classList.remove('hidden');
}

async function showShiftReportHistory() {
  if (!state.user.permissions.includes('shift.report.view')) throw new Error('Manager access is required for shift reports');
  const reports = await request(`/shifts/history?${managerQuery()}&registerId=${encodeURIComponent($('#register-select').value)}`);
  $('#receipt-history').innerHTML = reports.length ? reports.map((report) => `<button type="button" class="receipt-row" data-shift-report-id="${escapeHtml(report.id)}"><strong>${escapeHtml(report.location)} · ${escapeHtml(report.register)}</strong><span>${escapeHtml(report.cashier)} · ${new Date(report.closedAt).toLocaleString('en-MY')}</span><span>Opening ${money(report.openingFloat)} · Closing ${report.closingFloat == null ? '—' : money(report.closingFloat)}</span></button>`).join('') : '<p class="muted">No closed shift reports for this register yet.</p>';
  $('#printable-receipt').innerHTML = '<p class="muted">Choose a closed shift to view or print its auditable report.</p>';
  $('#receipt-panel').classList.remove('hidden');
}

async function syncBeforeShiftClose() {
  if (!navigator.onLine) throw new Error('Reconnect to the RetailOS PC before closing. Offline sales must be synced first.');
  $('#shift-action').disabled = true; startSyncProgress(); setSyncProgress(15, 'syncing offline sales');
  await replayOfflineSales();
  const queued = (await window.RetailOffline.getSales()).filter((entry) => entry.companyId === state.config.company.id);
  if (queued.length) throw new Error(`${queued.length} offline sale${queued.length === 1 ? '' : 's'} could not sync. Resolve them before closing the shift.`);
  setSyncProgress(55, 'syncing Bukku');
  await request('/sync/now', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id }) });
  setSyncProgress(100, 'complete');
}

async function closeShiftFromDialog() {
  if (!state.shift) throw new Error('There is no open shift to close');
  const closingFloat = Number($('#shift-closing-float').value);
  if (!Number.isFinite(closingFloat) || closingFloat < 0) throw new Error('Enter a valid counted cash amount');
  try { await syncBeforeShiftClose(); } finally { clearInterval(state.syncProgressTimer); finishSyncProgress(); $('#shift-action').disabled = false; }
  const manager = await request('/auth/pin', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, pin: $('#shift-manager-pin').value }) });
  if (!manager.user.permissions.includes('shift.report.view')) throw new Error('A manager PIN is required to close a shift');
  const shiftId = state.shift.id;
  const closeResult = await request(`/shifts/${shiftId}/close`, { method: 'POST', approvalToken: manager.sessionToken, body: JSON.stringify({ companyId: state.config.company.id, cashierId: state.user.id, managerId: manager.user.id, closingFloat }) });
  $('#shift-close-dialog').classList.add('hidden'); await loadCurrentShift(); await showShiftReport(shiftId, manager.user.id, manager.sessionToken); showToast(closeResult.reportPrintError ? `Shift closed, but automatic report print failed: ${closeResult.reportPrintError}` : closeResult.negativeStock?.length ? `Shift closed and report printed. ${closeResult.negativeStock.length} stock shortage${closeResult.negativeStock.length === 1 ? '' : 's'} need review.` : 'Shift closed and report printed.');
}

function renderCart() {
  // A split tender belongs to the current sale only.  When its final line is
  // removed, do not leave an amount from the discarded sale on screen.
  if (!state.cart.length) {
    ['#split-cash', '#split-duitnow', '#split-bank-transfer'].forEach((selector) => { $(selector).value = '0.00'; });
  }
  $('#cart-count').textContent = String(state.cart.reduce((total, line) => total + Number(line.quantity || 0), 0));
  const target = $('#cart-lines');
  if (!state.cart.length) target.innerHTML = '<p class="muted">No items yet.</p>';
  else target.innerHTML = state.cart.map((line, index) => {
    const discount = lineDiscount(line);
    const unitPicker = line.availableUoms?.length > 1 ? `<select data-uom-index="${index}" aria-label="Unit for ${escapeHtml(line.name)}">${line.availableUoms.map((choice, choiceIndex) => `<option value="${choiceIndex}" ${choice.uom.id === line.uom.id ? 'selected' : ''}>${escapeHtml(choice.uom.name)} · ${money(choice.unitPrice)}</option>`).join('')}</select>` : `<p>${escapeHtml(line.uom.name)} · ${money(line.unitPrice)}</p>`;
    const discountValue = line.discount ? `${line.discount.value}${line.discount.type === 'PERCENTAGE' ? '%' : ''}` : '';
    const cost = line.unitCost == null ? null : Number(line.unitCost);
    const belowCost = cost != null && Number.isFinite(cost) && line.unitPrice - (discount / line.quantity) < cost - 0.00001;
    const purchaseInfo = `${line.unitCost == null ? 'Cost: —' : `Cost: ${money(line.unitCost)}`} · ${line.supplierName ? `Supplier: ${escapeHtml(line.supplierName)}` : 'Supplier: —'} · ${line.lastPurchasedAt ? `Last bought: ${new Date(line.lastPurchasedAt).toLocaleDateString('en-MY')}` : 'Last bought: —'}`;
    return `<article class="cart-line"><div class="line-product"><strong>${escapeHtml(line.name)}</strong>${unitPicker}<p>${purchaseInfo} · ${line.availableStock == null ? 'Stock not tracked' : `Available: ${Number(line.availableStock).toFixed(4).replace(/\.0+$/, '')}`}${discount ? ` · Discount ${money(discount)}` : ''}</p><div class="line-actions"><button data-action="minus" data-index="${index}">−</button><button data-action="plus" data-index="${index}">+</button><button data-action="remove" data-index="${index}">Remove</button></div></div><input data-quantity="${index}" type="number" min="0.0001" step="0.0001" value="${line.quantity}" aria-label="Quantity for ${escapeHtml(line.name)}" /><div class="line-discount"><input data-discount-value="${index}" value="${escapeHtml(discountValue)}" inputmode="decimal" placeholder="Discount: RM or 5%" aria-label="Discount amount for ${escapeHtml(line.name)}" />${belowCost ? '<small class="below-cost">Manager approved below cost</small>' : ''}</div><div class="line-total">${money(lineGross(line) - discount)}</div></article>`;
  }).join('');
  const total = totals();
  $('#subtotal').textContent = money(total.subtotal); $('#discount-total').textContent = `− ${money(total.discount)}`; $('#grand-total').textContent = money(total.total);
  renderExchangeCredit();
  syncPaymentMethod();
  persistCart();
}

function renderExchangeCredit() {
  const credit = state.exchangeCredit;
  $('#exchange-credit-banner').classList.toggle('hidden', !credit);
  if (credit) $('#exchange-credit-text').textContent = `${money(credit.balance)} will be applied automatically to this replacement sale.`;
}

function openDiscountDialog(target) {
  state.discountTarget = target;
  $('#discount-form').reset();
  $('#discount-dialog').classList.remove('hidden');
  $('#discount-manager-pin').focus();
}

async function applyDiscountFromDialog() {
  const pin = $('#discount-manager-pin').value;
  const manager = await request('/auth/pin', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, pin }) });
  if (!manager.user.permissions.includes('discount.approve')) throw new Error('This PIN cannot approve discounts');
  const target = state.discountTarget;
  if (!target) throw new Error('The discount is no longer available');
  state.cart[target.index].discount = { ...target.discount, approvedById: manager.user.id };
  state.approvalTokens[manager.user.id] = manager.sessionToken;
  state.discountTarget = null; $('#discount-dialog').classList.add('hidden'); renderCart(); showToast('Discount approved and applied.');
}

async function search(epoch = state.searchEpoch) {
  const query = $('#lookup-query').value.trim();
  if (!query) { state.searchResults = []; $('#search-results').innerHTML = ''; return; }
  const location = selectedLocation(); const priceLevel = selectedPriceLevel();
  try {
    if (!navigator.onLine) throw new TypeError('Offline');
    const products = await request(`/products/lookup?companyId=${encodeURIComponent(state.config.company.id)}&query=${encodeURIComponent(query)}&priceLevelId=${encodeURIComponent(priceLevel.id)}&locationId=${encodeURIComponent(location.id)}`);
    if (epoch !== state.searchEpoch || $('#lookup-query').value.trim() !== query) return;
    const addable = products.map((product) => {
      const availableUoms = product.uoms.map((uom) => { const price = product.prices.find((value) => value.uomId === uom.id); return price ? { uom, unitPrice: Number(price.amount) } : null; }).filter(Boolean);
      const first = availableUoms[0]; const stock = product.stockSnapshots[0] ? Number(product.stockSnapshots[0].quantity) : null;
      return !first ? null : { id: product.id, name: product.name, sku: product.sku, supplierDescription: product.supplierDescription, supplierName: product.supplierName, lastPurchasedAt: product.lastPurchasedAt, uom: first.uom, unitPrice: first.unitPrice, availableUoms, availableStock: stock, basePurchaseCost: product.basePurchaseCost == null ? null : Number(product.basePurchaseCost) };
    }).filter(Boolean);
    renderSearchResults(addable);
  } catch (error) {
    if (!isNetworkIssue(error) || !state.catalogue.length) throw error;
    if (epoch !== state.searchEpoch || $('#lookup-query').value.trim() !== query) return;
    renderSearchResults(searchCachedCatalogue(query), 'Offline results from the last saved catalogue.');
  }
}

function stopBarcodeScanner() {
  state.scannerActive = false;
  if (state.scannerStream) state.scannerStream.getTracks().forEach((track) => track.stop());
  state.scannerStream = null;
  $('#barcode-video').srcObject = null;
  $('#barcode-scanner').classList.add('hidden');
}

async function startBarcodeScanner() {
  if (!window.isSecureContext && location.hostname !== 'localhost') throw new Error('Phone camera scanning requires a secure HTTPS address. You can still type the barcode number.');
  if (!('BarcodeDetector' in window)) throw new Error('This phone browser does not support barcode scanning. Type the barcode number instead.');
  stopBarcodeScanner();
  $('#barcode-scanner').classList.remove('hidden');
  $('#barcode-scan-message').textContent = 'Requesting the rear camera…';
  try {
    state.scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    const video = $('#barcode-video');
    video.srcObject = state.scannerStream;
    await video.play();
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf'] });
    state.scannerActive = true;
    $('#barcode-scan-message').textContent = 'Point the rear camera at the barcode.';
    const scanFrame = async () => {
      if (!state.scannerActive) return;
      try {
        const codes = await detector.detect(video);
        const code = codes.find((item) => item.rawValue)?.rawValue;
        if (code) {
          $('#lookup-query').value = code;
          $('#barcode-scan-message').textContent = `Barcode ${code} scanned.`;
          stopBarcodeScanner();
          await search();
          return;
        }
      } catch (_) { /* Keep scanning while the camera frame is becoming available. */ }
      if (state.scannerActive) requestAnimationFrame(scanFrame);
    };
    requestAnimationFrame(scanFrame);
  } catch (error) {
    stopBarcodeScanner();
    throw new Error(error.name === 'NotAllowedError' ? 'Camera permission was denied. Type the barcode number instead.' : 'The phone camera could not be started. Type the barcode number instead.');
  }
}

function renderRecentItems() {
  $('#recent-items').innerHTML = state.recentItems.length ? state.recentItems.map((item, index) => `<article class="product recent-item"><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.sku)} · ${escapeHtml(item.uom.name)} · ${money(item.unitPrice)} · ${item.availableStock == null ? 'Stock not tracked' : `Available ${item.availableStock}`}</p></div><button type="button" data-recent-item-index="${index}">Add</button></article>`).join('') : '<p class="muted small">Items you add will appear here.</p>';
}
function addProduct(item) {
  const unitCost = item.basePurchaseCost == null ? null : Number(item.basePurchaseCost) * Number(item.uom.conversionFactor);
  const existing = state.cart.find((line) => line.productId === item.id && line.uom.id === item.uom.id && !line.discount);
  if (existing) existing.quantity += 1;
  else state.cart.push({ productId: item.id, name: item.name, sku: item.sku, uom: item.uom, unitPrice: item.unitPrice, unitCost, availableStock: item.availableStock, availableUoms: item.availableUoms, basePurchaseCost: item.basePurchaseCost, supplierName: item.supplierName, lastPurchasedAt: item.lastPurchasedAt, quantity: 1 });
  state.recentItems = [item, ...state.recentItems.filter((recent) => !(recent.id === item.id && recent.uom.id === item.uom.id))].slice(0, 10);
  renderRecentItems(); renderCart();
  state.searchResults = []; $('#search-results').innerHTML = ''; $('#lookup-query').value = '';
  const cartShortcut = $('#open-cart');
  cartShortcut.classList.add('cart-added');
  window.setTimeout(() => cartShortcut.classList.remove('cart-added'), 650);
  showToast(`${item.name} added to cart.`);
  $('#lookup-query').focus();
}

function applyInlineDiscount(index) {
  const line = state.cart[index];
  const discount = parseDiscountExpression($(`[data-discount-value="${index}"]`).value);
  if (!discount) throw new Error('Enter RM, a simple calculation such as 0.10*3, or a percentage such as 5%.');
  if (discount.value === 0) { delete line.discount; renderCart(); return; }
  discount.reason = 'Inline item discount';
  const totalDiscount = discountAmount(lineGross(line), discount, line.quantity);
  const finalUnitPrice = line.unitPrice - totalDiscount / line.quantity;
  if (line.unitCost != null && finalUnitPrice < line.unitCost - 0.00001) { openDiscountDialog({ index, discount }); return; }
  line.discount = discount; renderCart(); showToast('Item discount applied.');
}

async function adjustStock(product) {
  if (!state.user.permissions.includes('stock.adjust')) throw new Error('Manager access is required for stock adjustment');
  const unit = product.uoms.find((uom) => uom.code === 'LEN')?.name ?? product.uoms[0]?.name ?? 'base unit';
  const countedQuantity = Number(window.prompt(`Counted stock for ${product.name} (${unit}):`, String(product.stock)));
  if (!Number.isFinite(countedQuantity) || countedQuantity < 0) throw new Error('Enter a valid non-negative stock quantity');
  const reason = window.prompt('Reason for this stock adjustment:');
  if (!reason?.trim()) throw new Error('A stock-adjustment reason is required');
  const result = await request(`/products/${encodeURIComponent(product.id)}/stock-adjustment`, { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, locationId: selectedLocation().id, actorId: state.user.id, countedQuantity, reason: reason.trim() }) });
  $('#checkout-message').textContent = `${result.productName}: stock updated from ${result.previousQuantity} to ${result.countedQuantity}.`;
  await loadManagedProducts();
}

function renderReturnSale() {
  const sale = state.returnSale;
  if (!sale) { $('#return-sale').innerHTML = ''; return; }
  const soldItems = sale.items.map((item, index) => `<div class="return-item"><div><strong>${escapeHtml(item.description)}</strong><p class="muted small">Sold ${item.quantity} ${escapeHtml(item.uom.name)} · ${money(item.lineTotal)}</p></div><input data-return-index="${index}" type="number" min="0" max="${item.quantity}" step="0.0001" value="0" aria-label="Return quantity for ${escapeHtml(item.description)}" /></div>`).join('');
  $('#return-sale').innerHTML = `<p><strong>${escapeHtml(sale.receiptNo)}</strong> · ${money(sale.grandTotal)}</p>${soldItems}<div class="return-options"><label>Outcome<select id="return-type"><option value="REFUND">Refund and return</option><option value="DISPOSE">Dispose (bad condition)</option><option value="EXCHANGE">Exchange for other item(s)</option></select></label><label id="refund-method-wrap">Refund method<select id="refund-method"><option value="CASH">Cash</option><option value="CARD">Card</option><option value="DUITNOW">DuitNow</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option></select></label><section id="exchange-selection" class="exchange-selection hidden"><h3>Select replacement items</h3><div class="search-field"><input id="exchange-item-query" placeholder="Type SKU, barcode, or item name" autocomplete="off" /><button type="button" class="clear-search" data-clear-search="exchange-item-query" aria-label="Clear replacement item search">×</button></div><div id="exchange-item-results" class="results"></div><div id="exchange-item-cart" class="exchange-item-cart"></div><p id="exchange-value-summary" class="exchange-value-summary"></p><div id="exchange-balance-wrap" class="hidden"><p id="exchange-balance-note" class="muted small"></p><label>Use the remaining value<select id="exchange-balance-action"><option value="CREDIT">Keep as store credit</option><option value="REFUND">Refund it</option></select></label></div><label id="exchange-refund-method-wrap" class="hidden">Refund method<select id="exchange-refund-method"><option value="CASH">Cash</option><option value="CARD">Card</option><option value="DUITNOW">DuitNow</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option></select></label></section><label>Reason<input id="return-reason" placeholder="Optional note" /></label><button id="complete-return" type="button" class="primary">Complete return</button></div>`;
}

function cartProductFromLookup(product) {
  const availableUoms = product.uoms.map((uom) => { const price = product.prices.find((value) => value.uomId === uom.id); return price ? { uom, unitPrice: Number(price.amount) } : null; }).filter(Boolean);
  const first = availableUoms[0];
  return first ? { id: product.id, name: product.name, sku: product.sku, supplierDescription: product.supplierDescription, supplierName: product.supplierName, lastPurchasedAt: product.lastPurchasedAt, uom: first.uom, unitPrice: first.unitPrice, availableUoms } : null;
}

function returnedValue() {
  if (!state.returnSale) return 0;
  return [...document.querySelectorAll('[data-return-index]')].reduce((sum, input) => {
    const item = state.returnSale.items[Number(input.dataset.returnIndex)];
    return sum + (Number(input.value) || 0) * Number(item.lineTotal) / Number(item.quantity);
  }, 0);
}
function replacementValue() { return state.exchangeItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0); }
function renderExchangeBalanceAction() {
  const returned = Math.round(returnedValue() * 100) / 100;
  const replacement = Math.round(replacementValue() * 100) / 100;
  const difference = Math.round((returned - replacement) * 100) / 100;
  const visible = difference > 0.00001;
  if (returned <= 0) $('#exchange-value-summary').textContent = 'Choose the returned quantity, then add the replacement item(s).';
  else if (difference > 0.00001) $('#exchange-value-summary').textContent = `Returned value ${money(returned)} · Replacement value ${money(replacement)} · ${money(difference)} to refund or keep as credit.`;
  else if (difference < -0.00001) $('#exchange-value-summary').textContent = `Returned value ${money(returned)} · Replacement value ${money(replacement)} · Customer pays ${money(-difference)} more at checkout.`;
  else $('#exchange-value-summary').textContent = `Returned value ${money(returned)} · Replacement value ${money(replacement)} · Values are equal.`;
  $('#exchange-balance-wrap').classList.toggle('hidden', !visible);
  if (visible) $('#exchange-balance-note').textContent = `${money(difference)} remains after the replacement items.`;
  if (!visible) { state.exchangeRefundPreference = null; $('#exchange-refund-method-wrap').classList.add('hidden'); }
}
function renderExchangeItems() {
  $('#exchange-item-cart').innerHTML = state.exchangeItems.length ? `<p class="muted small">Replacement items will move to the checkout cart after this return.</p>${state.exchangeItems.map((item, index) => `<div class="exchange-line"><span>${escapeHtml(item.name)} · ${escapeHtml(item.uom.name)} · ${money(item.unitPrice)}</span><button type="button" class="quiet" data-remove-exchange-item="${index}">Remove</button></div>`).join('')}` : '<p class="muted small">No replacement item selected yet.</p>';
  renderExchangeBalanceAction();
}

async function searchExchangeProducts() {
  const query = $('#exchange-item-query').value.trim();
  if (!query) { state.exchangeSearchResults = []; $('#exchange-item-results').innerHTML = ''; return; }
  const products = await request(`/products/lookup?companyId=${encodeURIComponent(state.config.company.id)}&query=${encodeURIComponent(query)}&priceLevelId=${encodeURIComponent(selectedPriceLevel().id)}&locationId=${encodeURIComponent(selectedLocation().id)}`);
  if ($('#exchange-item-query').value.trim() !== query) return;
  state.exchangeSearchResults = products.map(cartProductFromLookup).filter(Boolean);
  $('#exchange-item-results').innerHTML = state.exchangeSearchResults.length ? state.exchangeSearchResults.map((product, index) => `<article class="product"><div><strong>${escapeHtml(product.name)}</strong><p>${escapeHtml(product.sku)} · ${escapeHtml(product.uom.name)} · ${money(product.unitPrice)}</p></div><button type="button" data-exchange-product-index="${index}">Select</button></article>`).join('') : '<p class="muted">No matching priced item.</p>';
}

function toggleReturnType() {
  const exchange = $('#return-type').value === 'EXCHANGE';
  $('#refund-method-wrap').classList.toggle('hidden', exchange);
  $('#exchange-selection').classList.toggle('hidden', !exchange);
  if (exchange) renderExchangeItems();
}

async function loadReceiptForReturn(receiptNo = $('#receipt-lookup-no').value.trim()) {
  if (!receiptNo) throw new Error('Enter the receipt number');
  state.returnSale = await request(`/sales/receipt/${encodeURIComponent(receiptNo)}?companyId=${encodeURIComponent(state.config.company.id)}`);
  state.exchangeItems = []; state.exchangeRefundPreference = null;
  renderReturnSale();
  $('#return-dialog').classList.remove('hidden');
}

async function completeReturn() {
  const type = $('#return-type').value;
  const returnedReceiptNo = state.returnSale.receiptNo;
  const items = [...document.querySelectorAll('[data-return-index]')].map((input) => ({ saleItemId: state.returnSale.items[Number(input.dataset.returnIndex)].id, quantity: Number(input.value) })).filter((item) => item.quantity > 0);
  if (!items.length) throw new Error('Enter at least one returned quantity');
  const data = { companyId: state.config.company.id, cashierId: state.user.id, saleId: state.returnSale.id, type, items, reason: $('#return-reason').value.trim() || undefined, ...(state.shift ? { shiftId: state.shift.id } : {}) };
  if (type === 'REFUND') data.refundMethod = $('#refund-method').value;
  const result = await request('/returns', { method: 'POST', body: JSON.stringify(data) });
  if (result.storeCredit) {
    state.exchangeCredit = result.storeCredit;
    state.cart.push(...state.exchangeItems);
    state.exchangeRefundPreference = $('#exchange-balance-action').value === 'REFUND' ? { method: $('#exchange-refund-method').value } : null;
    showToast(state.exchangeItems.length ? 'Exchange recorded. Replacement items are ready in the cart.' : `Exchange recorded. ${money(result.storeCredit.balance)} remains as store credit.`);
  } else if (result.refund) showToast(`Refund of ${money(result.refund.amount)} recorded.`);
  else showToast('Bad-condition return recorded. Stock was not restored.');
  renderCart();
  state.returnSale = null; state.exchangeItems = []; $('#return-sale').innerHTML = ''; $('#return-dialog').classList.add('hidden');
  await loadReceiptHistory();
  await showReceipt(returnedReceiptNo);
}

function renderPrintableReceipt(sale, options = {}) {
  const allowReturns = Boolean(options.allowReturns) && sale.status === 'COMPLETED';
  const allowVoid = Boolean(options.allowVoid) && sale.status === 'COMPLETED';
  const allowShare = Boolean(options.allowShare);
  const target = $(options.target || '#printable-receipt');
  const paymentLines = sale.payments.map((payment) => {
    const tendered = Number(payment.tenderedAmount ?? payment.amount);
    const change = Number(payment.changeAmount || 0);
    if (payment.method === 'CASH') return `<p>Cash Received <strong>${money(tendered)}</strong></p>${change ? `<p>Balance <strong>${money(change)}</strong></p>` : ''}`;
    return `<p>${escapeHtml(payment.method.replaceAll('_', ' '))}: ${money(Number(payment.amount))}${payment.reference ? ` · Ref ${escapeHtml(payment.reference)}` : ''}</p>`;
  }).join('');
  const company = sale.company;
  const address = company.address ? `<p>${escapeHtml(company.address).replaceAll('\n', '<br />')}</p>` : '';
  const brn = company.brnNew || company.registrationNo ? `<p>BRN: ${escapeHtml(company.brnNew || company.registrationNo)}${company.brnOld ? ` (${escapeHtml(company.brnOld)})` : ''}</p>` : '';
  const tin = company.tin ? `<p>TIN: ${escapeHtml(company.tin)}</p>` : '';
  const contact = `<div class="receipt-contact">${company.officePhone ? `<p>Office No.: ${escapeHtml(company.officePhone)}</p>` : ''}${company.phone ? `<p>Phone No.: ${escapeHtml(company.phone)}</p>` : ''}${company.email ? `<p>Email: ${escapeHtml(company.email)}</p>` : ''}</div>`;
  const activities = sale.returns?.length ? `<div class="receipt-activity"><strong>Latest activity</strong>${sale.returns.map((record) => `<p>${escapeHtml(record.type)} · ${money(record.total)} · ${new Date(record.createdAt).toLocaleString('en-MY')}</p>`).join('')}</div>` : '';
  target.style.setProperty('--receipt-width', `${company.receiptPaperWidthMm || 80}mm`);
  const offlineNote = sale.offline ? '<p class="offline-note">OFFLINE SALE — saved on this device and pending automatic sync. The final receipt number and MyInvois QR are issued after sync.</p>' : '';
  const einvoice = sale.offline ? '' : sale.eInvoiceRequestToken ? `<section class="einvoice-request"><img src="/api/e-invoice/request/${encodeURIComponent(sale.eInvoiceRequestToken)}/qr" alt="QR code to request an e-Invoice" /><div><strong>Need an e-Invoice?</strong><p>Scan to submit your details. This receipt is not validated by LHDN. Cash Sales receipts without a request are consolidated later.</p></div></section>` : '<p class="einvoice-pending">This receipt is not validated by LHDN. Customer e-Invoice request QR is available for new receipts after the next update.</p>';
  target.innerHTML = `<div class="receipt-head"><img class="receipt-logo" src="/assets/taiping-hardware-logo.png" alt="Taiping Hardware Trading" /><h3>${escapeHtml(company.legalName || company.name)}</h3>${brn}${tin}${address}<p>Receipt No: <strong>${escapeHtml(sale.receiptNo)}</strong></p><p>${new Date(sale.completedAt).toLocaleString('en-MY')}</p></div>${offlineNote}<div class="receipt-lines">${sale.items.map((item) => `<div class="receipt-line"><div><strong>${escapeHtml(item.description)}</strong><p>${Number(item.quantity)} ${escapeHtml(item.uom.name)} × ${money(item.unitPrice)}${Number(item.lineDiscount) ? ` · Discount ${money(item.lineDiscount)}` : ''}</p></div><strong>${money(item.lineTotal)}</strong></div>`).join('')}</div><div class="receipt-summary"><div><span>Subtotal</span><strong>${money(sale.subtotal)}</strong></div><div><span>Discount</span><strong>− ${money(sale.discountTotal)}</strong></div><div class="receipt-grand"><span>Total</span><strong>${money(sale.grandTotal)}</strong></div></div><div class="receipt-payment"><strong>Payment</strong>${paymentLines}</div>${activities}${einvoice}<div class="receipt-actions"><button type="button" class="primary receipt-print" ${sale.offline ? 'data-print-offline="true"' : `data-print-receipt="${escapeHtml(sale.receiptNo)}"`}>Print receipt</button>${allowShare ? `<button type="button" class="quiet" data-share-receipt="${escapeHtml(sale.receiptNo)}">Share to WhatsApp</button>` : ''}${allowVoid ? `<button type="button" class="quiet" data-void-receipt="${escapeHtml(sale.receiptNo)}">Void</button>` : ''}${allowReturns ? `<button type="button" class="quiet" data-return-receipt="${escapeHtml(sale.receiptNo)}">Return / exchange</button>` : ''}</div>${contact}<p class="receipt-policy">Returns, refunds and exchanges are accepted only until the end of the next working day.</p><p class="receipt-hours">Operating hours: Mon–Sat, 8:30 AM–5:00 PM</p><p class="receipt-note">${escapeHtml(company.receiptFooter || 'Thank you for shopping with us!')}</p>`;
}

async function findReceipt() {
  const receiptNo = $('#receipt-lookup-no').value.trim();
  if (!receiptNo) throw new Error('Enter a receipt number');
  const sale = await request(`/sales/receipt/${encodeURIComponent(receiptNo)}?companyId=${encodeURIComponent(state.config.company.id)}`);
  renderPrintableReceipt(sale, { allowReturns: true, allowVoid: true, allowShare: true, target: '#receipt-dialog-content' });
  $('#receipt-dialog').classList.remove('hidden');
}

async function loadReceiptHistory() {
  state.receiptHistory = await request(`/sales/history?companyId=${encodeURIComponent(state.config.company.id)}&locationId=${encodeURIComponent(selectedLocation().id)}`);
  renderReceiptHistory();
}

function renderReceiptHistory() {
  const query = $('#receipt-lookup-no').value.trim().toLowerCase();
  const history = state.receiptHistory.filter((sale) => !query || sale.receiptNo.toLowerCase().includes(query) || new Date(sale.completedAt).toLocaleDateString('en-CA').includes(query));
  $('#receipt-history').innerHTML = history.length ? history.map((sale) => `<article class="history-item"><div><strong>${escapeHtml(sale.receiptNo)}</strong>${sale.status === 'VOIDED' ? '<span class="status-badge void">VOID</span>' : sale.returnStatus ? `<span class="status-badge returned">${escapeHtml(sale.returnStatus)}</span>` : sale.printed ? '<span class="status-badge printed">PRINTED</span>' : ''}<p>${new Date(sale.completedAt).toLocaleString('en-MY')} · ${escapeHtml(sale.cashier)} · ${sale.payments.map((payment) => `${escapeHtml(payment.method.replaceAll('_', ' '))} ${money(payment.amount)}`).join(', ')}</p></div><div><strong>${money(sale.total)}</strong><span class="history-actions"><button type="button" data-history-receipt="${escapeHtml(sale.receiptNo)}">View</button><button type="button" data-print-history-receipt="${escapeHtml(sale.receiptNo)}">Print</button></span></div></article>`).join('') : '<p class="muted">No matching receipts.</p>';
}

function splitPaymentValues() {
  const cash = Math.max(0, Number($('#split-cash').value) || 0);
  const duitnow = Math.max(0, Number($('#split-duitnow').value) || 0);
  const bankTransfer = Math.max(0, Number($('#split-bank-transfer').value) || 0);
  const entered = Math.round((cash + duitnow + bankTransfer) * 100) / 100;
  const total = Math.round(totals().total * 100) / 100;
  return { cash, duitnow, bankTransfer, entered, total, difference: Math.round((total - entered) * 100) / 100, exact: entered > 0 && entered === total };
}

function renderSplitPayment() {
  // There is no split payment to collect until the cart contains a sale.
  // Hiding the panel prevents obsolete tender values after the cart is cleared.
  const active = $('#payment-method').value === 'SPLIT' && state.cart.length > 0;
  $('#split-payment').classList.toggle('hidden', !active);
  if (!active) return;
  const split = splitPaymentValues();
  $('#split-sale-total').textContent = money(split.total);
  $('#split-entered-total').textContent = money(split.entered);
  $('#split-balance').textContent = split.difference >= 0 ? `Amount remaining ${money(split.difference)}` : `Amount too high ${money(-split.difference)}`;
  $('#split-error').textContent = split.exact ? '' : split.difference > 0 ? `Add ${money(split.difference)} more to complete this payment.` : `Reduce the payment by ${money(-split.difference)}. Split payments must equal the sale total.`;
  $('#split-duitnow-amount').textContent = money(split.duitnow);
  $('#split-bank-amount').textContent = money(split.bankTransfer);
  $('#split-duitnow-details').classList.toggle('hidden', split.duitnow <= 0);
  $('#split-bank-details').classList.toggle('hidden', split.bankTransfer <= 0);
  $('#confirm-split').disabled = !split.exact;
}

function syncPaymentMethod() {
  const method = $('#payment-method').value;
  const label = $('#payment-method').selectedOptions[0].textContent;
  const amountDue = Math.max(0, totals().total - Math.min(Number(state.exchangeCredit?.balance || 0), totals().total));
  const isDirectConfirmation = method === 'DUITNOW' || method === 'BANK_TRANSFER';
  const showCheckout = method !== 'SPLIT' && !isDirectConfirmation;
  $('#pay-cash').classList.toggle('hidden', !showCheckout);
  $('#pay-cash').hidden = !showCheckout;
  $('#pay-cash').textContent = `${label} checkout`;
  $('#duitnow-payment').classList.toggle('hidden', method !== 'DUITNOW');
  $('#bank-transfer-payment').classList.toggle('hidden', method !== 'BANK_TRANSFER');
  if (method === 'DUITNOW') $('#duitnow-amount').textContent = money(amountDue);
  if (method === 'BANK_TRANSFER') $('#bank-transfer-amount').textContent = money(amountDue);
  renderSplitPayment();
}

function openCashPayment(amountDue) {
  $('#cash-payment-due').textContent = money(amountDue);
  $('#cash-payment-received').value = amountDue.toFixed(2);
  updateCashChange();
  $('#cash-payment-dialog').classList.remove('hidden');
  $('#cash-payment-received').focus();
}

function updateCashChange() {
  const due = Number(totals().total) - Math.min(Number(state.exchangeCredit?.balance || 0), Number(totals().total));
  const tendered = Number($('#cash-payment-received').value) || 0;
  const change = Math.max(0, tendered - due);
  $('#cash-payment-change').innerHTML = `Balance to return: <strong>${money(change)}</strong>`;
  $('#complete-cash-sale').textContent = 'Complete';
}

async function completeCheckout(paymentConfirmed = false, cashTendered) {
  if (!state.cart.length) throw new Error('Add an item before checkout');
  const total = totals().total;
  const creditId = state.exchangeCredit?.id;
  const payments = [];
  let remaining = total;
  let exchangeReturnId;
  let exchangeRefund;
  const method = $('#payment-method').value;
  if (method === 'SPLIT') {
    if (creditId) throw new Error('Use either exchange credit or split payment, not both in the same sale');
    const split = splitPaymentValues();
    if (!split.exact) throw new Error('Split-payment amounts must equal the sale total exactly');
    if (split.cash > 0) payments.push({ method: 'CASH', amount: split.cash });
    if (split.duitnow > 0) payments.push({ method: 'DUITNOW', amount: split.duitnow });
    if (split.bankTransfer > 0) payments.push({ method: 'BANK_TRANSFER', amount: split.bankTransfer });
  } else {
    if (creditId) {
      const credit = await request(`/returns/store-credits/${encodeURIComponent(creditId)}?companyId=${encodeURIComponent(state.config.company.id)}`);
      const applied = Math.min(Number(credit.balance), remaining);
      if (applied > 0) {
        payments.push({ method: 'STORE_CREDIT', amount: applied, storeCreditId: credit.id });
        exchangeReturnId = credit.returnId;
        remaining -= applied;
        const unused = Math.round((Number(credit.balance) - applied) * 100) / 100;
        if (unused > 0 && state.exchangeRefundPreference) exchangeRefund = { amount: unused, method: state.exchangeRefundPreference.method };
      }
    }
    if (remaining > 0 && method === 'DUITNOW' && !paymentConfirmed) {
      $('#duitnow-amount').textContent = money(remaining);
      $('#duitnow-payment').classList.remove('hidden');
      $('#duitnow-payment').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (remaining > 0 && method === 'BANK_TRANSFER' && !paymentConfirmed) {
      $('#bank-transfer-amount').textContent = money(remaining);
      $('#bank-transfer-payment').classList.remove('hidden');
      $('#bank-transfer-payment').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (remaining > 0 && method === 'CASH' && !paymentConfirmed) {
      openCashPayment(remaining);
      return;
    }
    if (remaining > 0) {
      if (method === 'CASH') {
        const tendered = Number(cashTendered);
        if (!Number.isFinite(tendered) || tendered < remaining) throw new Error('Cash received must cover the balance');
        payments.push({ method, amount: tendered });
      } else {
        payments.push({ method, amount: remaining });
      }
    }
  }
  const location = selectedLocation(); const snapshot = state.cart.map((line) => ({ ...line, uom: { ...line.uom }, availableUoms: line.availableUoms.map((unit) => ({ uom: { ...unit.uom }, unitPrice: unit.unitPrice })) }));
  const payload = { companyId: state.config.company.id, locationId: location.id, registerId: $('#register-select').value, cashierId: state.user.id, priceLevelId: selectedPriceLevel().id, ...(state.shift ? { shiftId: state.shift.id } : {}), ...(exchangeReturnId ? { exchangeReturnId } : {}), ...(exchangeRefund ? { exchangeRefund } : {}), offlineId: offlineId(), items: state.cart.map((line) => { const discount = line.discount ? { type: line.discount.type, value: line.discount.type === 'FIXED' && line.discount.basis === 'PER_UNIT' ? Number((line.discount.value * line.quantity).toFixed(2)) : line.discount.value, reason: line.discount.reason || 'Inline item discount', ...(line.discount.approvedById ? { approvedById: line.discount.approvedById } : {}) } : undefined; return { productId: line.productId, uomId: line.uom.id, quantity: line.quantity, ...(discount ? { discount } : {}) }; }), payments, deviceId: 'browser-pos' };
  let receipt;
  try { receipt = await request('/sales/checkout', { method: 'POST', approvalToken: Object.values(state.approvalTokens).join(','), body: JSON.stringify(payload) }); }
  catch (error) { if (!isNetworkIssue(error)) throw error; receipt = await queueOfflineSale(payload, snapshot); }
  $('#duitnow-payment').classList.add('hidden'); $('#bank-transfer-payment').classList.add('hidden'); $('#cash-payment-dialog').classList.add('hidden');
  state.cart = []; state.approvalTokens = {}; state.saleDiscount = null; state.exchangeCredit = null; state.exchangeRefundPreference = null; $('#payment-method').value = 'CASH'; clearSavedCart(); renderCart(); $('#search-results').innerHTML = ''; $('#lookup-query').value = ''; $('#cart-panel').classList.remove('cart-open');
  if (receipt.offline) {
    renderPrintableReceipt(receipt.local, { target: '#receipt-dialog-content' }); $('#receipt-dialog-content').classList.add('offline-receipt'); $('#receipt-dialog').classList.remove('hidden'); showToast(`Offline sale saved as ${receipt.receiptNo}. It will sync automatically.`); return;
  }
  $('#receipt-dialog-content').classList.remove('offline-receipt'); await loadCurrentShift();
  const printable = await request(`/sales/receipt/${encodeURIComponent(receipt.receiptNo)}?companyId=${encodeURIComponent(state.config.company.id)}`);
  renderPrintableReceipt(printable, { allowShare: true, target: '#receipt-dialog-content' }); $('#receipt-dialog').classList.remove('hidden'); showToast(`Sale completed. Receipt ${receipt.receiptNo} is ready to print or share.`);
}

function managerQuery() { return `companyId=${encodeURIComponent(state.config.company.id)}&actorId=${encodeURIComponent(state.user.id)}`; }
function hasPermission(permission) { return state.user.permissions.includes(permission); }
function showManagementTab(name) {
  const neededPermission = name === 'company' ? 'company.manage' : name === 'printer' ? 'printer.manage' : name === 'products' ? 'catalog.manage' : name === 'contacts' ? 'contact.manage' : null;
  if (neededPermission && !hasPermission(neededPermission)) throw new Error('You do not have access to this section');
  ['settings', 'company', 'printer', 'products', 'contacts'].forEach((section) => $(`#management-${section}`).classList.toggle('hidden', section !== name));
  $('#show-company-settings').classList.toggle('hidden', !hasPermission('company.manage'));
  $('#show-printer-settings').classList.toggle('hidden', !hasPermission('printer.manage'));
  $('#add-product-float').classList.toggle('hidden', name !== 'products' || !hasPermission('catalog.manage'));
  $('#add-contact-float').classList.toggle('hidden', name !== 'contacts' || !hasPermission('contact.manage'));
  const copy = { settings: ['Settings', 'Company and printer settings.'], company: ['Company details', 'Business details used on every receipt.'], printer: ['Printer settings', 'Receipt paper and footer message.'], products: ['Products', 'Search your product catalogue. Use + to add a new local product.'], contacts: ['Contacts', 'Search your customer and contact list. Use + to add a new local contact.'] };
  $('#management-title').textContent = copy[name][0]; $('#management-intro').textContent = copy[name][1];
}
async function loadCompanyProfile() {
  const profile = await request(`/management/company?${managerQuery()}`);
  $('#profile-name').value = profile.name || ''; $('#profile-legal-name').value = profile.legalName || ''; $('#profile-tin').value = profile.tin || ''; $('#profile-brn-new').value = profile.brnNew || profile.registrationNo || ''; $('#profile-brn-old').value = profile.brnOld || ''; $('#profile-office-phone').value = profile.officePhone || ''; $('#profile-phone').value = profile.phone || ''; $('#profile-email').value = profile.email || ''; $('#profile-address').value = profile.address || ''; $('#profile-receipt-footer').value = profile.receiptFooter || ''; $('#profile-paper-width').value = String(profile.receiptPaperWidthMm || 80);
  $('#printer-lan-host').value = profile.printerLanHost || ''; $('#printer-lan-port').value = String(profile.printerLanPort || 9100); $('#printer-windows-queue').value = profile.printerWindowsQueue || ''; $('#printer-serial-port').value = profile.printerSerialPort || ''; $('#printer-serial-baud-rate').value = String(profile.printerSerialBaudRate || 9600);
  if (profile.printerConnectionMethod) state.config.company.printerConnectionMethod = profile.printerConnectionMethod;
  renderPrinterConnectionSettings();
}

function selectedPrinterConnection() { return state.config?.company?.printerConnectionMethod || 'LAN_ESC_POS'; }
function printerConnectionHelp(method = selectedPrinterConnection()) {
  const copy = {
    LAN_ESC_POS: 'The PC backend sends raw ESC/POS directly to the configured LAN printer. Phones only submit a print job.',
    WINDOWS_RAW: 'The PC backend sends raw ESC/POS through the configured Windows printer queue. Phones never open a print dialog.',
    SERIAL_ESC_POS: 'The PC backend writes raw ESC/POS to its configured Bluetooth or USB serial port. Phones never pair with the printer.',
  };
  return copy[method] || 'Choose a PC print-hub connection method.';
}
function renderPrinterConnectionSettings() {
  const method = selectedPrinterConnection();
  const select = $('#printer-connection-method');
  if (select) select.value = method;
  const help = $('#printer-connection-help');
  if (help) help.textContent = printerConnectionHelp(method);
  $('#printer-lan-fields').classList.toggle('hidden', method !== 'LAN_ESC_POS');
  $('#printer-windows-fields').classList.toggle('hidden', method !== 'WINDOWS_RAW');
  $('#printer-serial-fields').classList.toggle('hidden', method !== 'SERIAL_ESC_POS');
}
async function loadManagedProducts() {
  const query = $('#managed-product-query').value.trim();
  const products = await request(`/management/products?${managerQuery()}${query ? `&query=${encodeURIComponent(query)}` : ''}`);
  $('#managed-product-list').innerHTML = products.length ? products.map((product) => `<button type="button" class="managed-item managed-product-row" data-managed-product-id="${escapeHtml(product.id)}"><strong>${escapeHtml(product.name)}</strong><p>${escapeHtml(product.sku)}${product.barcode ? ` · Barcode ${escapeHtml(product.barcode)}` : ''}${product.classificationCode ? ` · LHDN ${escapeHtml(product.classificationCode)}` : ''}</p><p><span class="tag">${product.source === 'BUKKU' ? 'Bukku-linked' : 'Local only'}</span><span class="tag">${product.active ? 'Active' : 'Inactive'}</span>${product.uoms.map((unit) => `${escapeHtml(unit.code)} ${unit.salePrice == null ? 'No retail price' : money(unit.salePrice)}`).join(' · ')}</p></button>`).join('') : '<p class="muted">No matching products.</p>';
}

function renderProductEditUoms(product) {
  $('#product-edit-uoms').innerHTML = product.uoms.map((unit) => `<section class="product-edit-uom" data-product-edit-uom="${escapeHtml(unit.id)}"><strong>${escapeHtml(unit.code)}${unit.conversionFactor === 1 ? ' · Base unit' : ''}</strong><label>Unit name<input data-edit-uom-name value="${escapeHtml(unit.name)}" maxlength="80" /></label><label>Conversion<input data-edit-uom-factor type="number" min="0.000001" step="0.000001" value="${unit.conversionFactor}" /></label><label>Sale price (RM)<input data-edit-uom-sale type="number" min="0" step="0.01" value="${unit.salePrice == null ? '' : unit.salePrice}" /></label><label>Purchase price (RM)<input data-edit-uom-purchase type="number" min="0" step="0.01" value="${unit.purchasePrice == null ? '' : unit.purchasePrice}" /></label></section>`).join('');
}
async function openProductEdit(productId) {
  const product = await request(`/management/products/${encodeURIComponent(productId)}?${managerQuery()}`);
  state.editingProduct = product;
  $('#product-edit-name').value = product.name; $('#product-edit-sku').value = product.sku; $('#product-edit-barcode').value = product.barcode || ''; $('#product-edit-classification').value = product.classificationCode || ''; $('#product-edit-supplier').value = product.supplierDescription || ''; $('#product-edit-supplier-name').value = product.supplierName || ''; $('#product-edit-last-purchased').value = product.lastPurchasedAt ? String(product.lastPurchasedAt).slice(0, 10) : ''; $('#product-edit-category').value = product.category || ''; $('#product-edit-track-stock').checked = product.trackStock; $('#product-edit-active').checked = product.active;
  $('#product-edit-source').textContent = product.source === 'BUKKU' ? `Bukku-linked product (${product.externalId}). RetailOS keeps the change queued for Bukku until its product-write mapping is confirmed.` : 'Local RetailOS product.';
  renderProductEditUoms(product); $('#product-edit-panel').classList.remove('hidden');
}
async function saveProductEdit() {
  const product = state.editingProduct;
  if (!product) throw new Error('Choose a product first');
  const uoms = [...document.querySelectorAll('[data-product-edit-uom]')].map((section) => ({ id: section.dataset.productEditUom, code: product.uoms.find((unit) => unit.id === section.dataset.productEditUom).code, name: section.querySelector('[data-edit-uom-name]').value, conversionFactor: Number(section.querySelector('[data-edit-uom-factor]').value), salePrice: Number(section.querySelector('[data-edit-uom-sale]').value), ...(section.querySelector('[data-edit-uom-purchase]').value !== '' ? { purchasePrice: Number(section.querySelector('[data-edit-uom-purchase]').value) } : {}) }));
  const result = await request(`/management/products/${encodeURIComponent(product.id)}`, { method: 'PUT', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, name: $('#product-edit-name').value, sku: $('#product-edit-sku').value, barcode: $('#product-edit-barcode').value, classificationCode: $('#product-edit-classification').value, supplierDescription: $('#product-edit-supplier').value, supplierName: $('#product-edit-supplier-name').value, lastPurchasedAt: $('#product-edit-last-purchased').value || undefined, category: $('#product-edit-category').value, trackStock: $('#product-edit-track-stock').checked, active: $('#product-edit-active').checked, uoms }) });
  $('#product-edit-panel').classList.add('hidden'); state.editingProduct = null; await loadManagedProducts(); showToast(result.sync === 'QUEUED_FOR_BUKKU_MAPPING' ? 'Product saved. The Bukku update is queued pending its verified write mapping.' : 'Product saved.');
}
async function loadManagedContacts() {
  const query = $('#managed-contact-query').value.trim();
  const contacts = await request(`/management/contacts?${managerQuery()}${query ? `&query=${encodeURIComponent(query)}` : ''}`);
  $('#managed-contact-list').innerHTML = contacts.length ? contacts.map((contact) => `<article class="managed-item"><strong>${escapeHtml(contact.name)}</strong><p>${[contact.contactCode, contact.entityType?.replaceAll('_', ' '), contact.contactTypes?.join(', '), contact.organization, contact.phone, contact.email, contact.taxId ? `TIN ${contact.taxId}` : ''].filter(Boolean).map(escapeHtml).join(' · ') || 'No other details'}</p></article>`).join('') : '<p class="muted">No matching contacts.</p>';
}
async function openManagement(tab = 'products') {
  if (tab !== 'settings' && !['company.manage', 'printer.manage', 'catalog.manage', 'contact.manage'].some((permission) => hasPermission(permission))) throw new Error('You do not have access to this section');
  $('#management-message').textContent = '';
  showManagementTab(tab);
  reveal($('#management-panel'));
  if (tab === 'company' || tab === 'printer') await loadCompanyProfile();
  if (tab === 'products') await loadManagedProducts();
  if (tab === 'contacts') await loadManagedContacts();
}

$('#sign-in').addEventListener('click', async () => { try { $('#login-message').textContent = ''; const code = $('#company-code').value.trim(); state.config = await request(`/pos/bootstrap?companyCode=${encodeURIComponent(code)}`); const login = await request('/auth/pin', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, pin: $('#cashier-pin').value }) }); state.user = login.user; state.sessionToken = login.sessionToken; $('#login-view').classList.add('hidden'); $('#pos-view').classList.remove('hidden'); renderConfig(); const recovered = restoreCart(); renderCart(); if (recovered) $('#checkout-message').textContent = 'Recovered your saved cart. Prices and stock will be checked again at checkout.'; await loadCurrentShift(); saveOfflineSession(); savePersistentSession(); await loadOfflineCatalogue(); await refreshOfflineStatus(); void cacheCatalogue().catch(() => undefined); void replayOfflineSales(); } catch (error) { $('#login-message').textContent = error.message; } });
$('#sign-out').addEventListener('click', () => { clearPersistentSession(); window.location.reload(); });
$('#language-select').addEventListener('change', () => { state.language = $('#language-select').value; localStorage.setItem('retailos-language', state.language); applyLanguage(); renderCart(); renderRecentItems(); });
$('#nav-dashboard').addEventListener('click', () => { closeItemSearch(); $('#receipt-panel').classList.add('hidden'); $('#management-panel').classList.add('hidden'); $('#cart-panel').classList.remove('cart-open'); window.scrollTo({ top: 0, behavior: 'smooth' }); $('#lookup-query').focus(); });
$('#nav-receipts').addEventListener('click', async () => { try { closeItemSearch(); $('#management-panel').classList.add('hidden'); $('#cart-panel').classList.remove('cart-open'); reveal($('#receipt-panel')); await loadReceiptHistory(); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } });
$('#nav-products').addEventListener('click', async () => { try { closeItemSearch(); $('#receipt-panel').classList.add('hidden'); $('#cart-panel').classList.remove('cart-open'); await openManagement('products'); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } });
$('#nav-contacts').addEventListener('click', async () => { try { closeItemSearch(); $('#receipt-panel').classList.add('hidden'); $('#cart-panel').classList.remove('cart-open'); await openManagement('contacts'); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } });
$('#nav-company').addEventListener('click', async () => { try { closeItemSearch(); await openManagement('settings'); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } });
$('#hide-receipt').addEventListener('click', () => $('#receipt-panel').classList.add('hidden'));
$('#hide-receipt-dialog').addEventListener('click', () => $('#receipt-dialog').classList.add('hidden'));
$('#open-cart').addEventListener('click', () => { closeItemSearch(); $('#cart-panel').classList.add('cart-open'); });
$('#hide-cart').addEventListener('click', () => { $('#cart-panel').classList.remove('cart-open'); });
$('#hide-management').addEventListener('click', () => { $('#management-panel').classList.add('hidden'); $('#add-product-float').classList.add('hidden'); $('#add-contact-float').classList.add('hidden'); });
$('#add-product-float').addEventListener('click', () => reveal($('#product-create-panel')));
$('#hide-product-create').addEventListener('click', () => $('#product-create-panel').classList.add('hidden'));
$('#hide-product-edit').addEventListener('click', () => { state.editingProduct = null; $('#product-edit-panel').classList.add('hidden'); });
$('#add-contact-float').addEventListener('click', () => reveal($('#contact-create-panel')));
$('#hide-contact-create').addEventListener('click', () => $('#contact-create-panel').classList.add('hidden'));
$('#dismiss-alert').addEventListener('click', () => $('#app-alert').classList.add('hidden'));
$('#dismiss-toast').addEventListener('click', () => $('#app-toast').classList.add('hidden'));
document.addEventListener('click', (event) => { const button = event.target.closest('[data-clear-search]'); if (!button) return; const input = $(`#${button.dataset.clearSearch}`); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); });
window.addEventListener('error', (event) => showAlert(event.error || event.message));
window.addEventListener('unhandledrejection', (event) => showAlert(event.reason));
async function openCompanyProfileSettings(tab) { showManagementTab(tab); await loadCompanyProfile(); }
$('#show-printer-settings').addEventListener('click', () => openCompanyProfileSettings('printer').catch(showAlert));
$('#show-company-settings').addEventListener('click', () => openCompanyProfileSettings('company').catch(showAlert));
$('#printer-connection-method').addEventListener('change', () => {
  state.config.company.printerConnectionMethod = $('#printer-connection-method').value;
  renderPrinterConnectionSettings();
});
$('#company-profile-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const profile = await request('/management/company', { method: 'PUT', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, name: $('#profile-name').value, legalName: $('#profile-legal-name').value, tin: $('#profile-tin').value, brnNew: $('#profile-brn-new').value, brnOld: $('#profile-brn-old').value, officePhone: $('#profile-office-phone').value, phone: $('#profile-phone').value, email: $('#profile-email').value, address: $('#profile-address').value }) }); state.config.company.name = profile.name; $('#company-name').textContent = profile.name; $('#management-panel').classList.add('hidden'); showToast('Company details saved.'); } catch (error) { $('#management-message').textContent = error.message; } });
$('#printer-settings-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const printerConnectionMethod = $('#printer-connection-method').value; const connection = printerConnectionMethod === 'LAN_ESC_POS' ? { printerLanHost: $('#printer-lan-host').value.trim(), printerLanPort: Number($('#printer-lan-port').value) } : printerConnectionMethod === 'WINDOWS_RAW' ? { printerWindowsQueue: $('#printer-windows-queue').value.trim() } : { printerSerialPort: $('#printer-serial-port').value.trim().toUpperCase(), printerSerialBaudRate: Number($('#printer-serial-baud-rate').value) }; const profile = await request('/management/company', { method: 'PUT', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, receiptFooter: $('#profile-receipt-footer').value, receiptPaperWidthMm: Number($('#profile-paper-width').value), printerConnectionMethod, ...connection }) }); state.config.company.printerConnectionMethod = profile.printerConnectionMethod; $('#management-panel').classList.add('hidden'); showToast('PC printer settings saved.'); } catch (error) { $('#management-message').textContent = error.message; } });
$('#test-pc-printer').addEventListener('click', async () => { try { const result = await request('/sales/printer/test', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id }) }); showToast(`Test receipt sent through ${result.transport}.`); } catch (error) { $('#management-message').textContent = error.message; showAlert(error); } });
$('#managed-product-search').addEventListener('submit', async (event) => { event.preventDefault(); try { await loadManagedProducts(); } catch (error) { $('#management-message').textContent = error.message; } });
$('#managed-contact-search').addEventListener('submit', async (event) => { event.preventDefault(); try { await loadManagedContacts(); } catch (error) { $('#management-message').textContent = error.message; } });
$('#managed-product-query').addEventListener('input', () => { clearTimeout(state.managementSearchTimer); state.managementSearchTimer = setTimeout(() => loadManagedProducts().catch(showAlert), 220); });
$('#managed-contact-query').addEventListener('input', () => { clearTimeout(state.managementSearchTimer); state.managementSearchTimer = setTimeout(() => loadManagedContacts().catch(showAlert), 220); });
$('#managed-product-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const quantityText = $('#managed-product-quantity').value; const purchaseText = $('#managed-product-purchase-price').value; const result = await request('/management/products', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, name: $('#managed-product-name').value, sku: $('#managed-product-sku').value, barcode: $('#managed-product-barcode').value || undefined, classificationCode: $('#managed-product-classification').value, supplierDescription: $('#managed-product-supplier').value || undefined, category: $('#managed-product-category').value || undefined, trackStock: $('#managed-product-track-stock').checked, locationId: selectedLocation().id, ...(quantityText !== '' ? { initialQuantity: Number(quantityText) } : {}), uoms: [{ code: 'EA', name: $('#managed-product-uom-name').value, conversionFactor: 1, salePrice: Number($('#managed-product-sale-price').value), ...(purchaseText !== '' ? { purchasePrice: Number(purchaseText) } : {}) }] }) }); $('#managed-product-form').reset(); $('#managed-product-classification').value = '022'; $('#managed-product-uom-name').value = 'Each'; $('#managed-product-track-stock').checked = true; $('#product-create-panel').classList.add('hidden'); $('#management-message').textContent = `${result.name} created as a local product.`; await loadManagedProducts(); showToast(`${result.name} was created.`); } catch (error) { $('#management-message').textContent = error.message; showAlert(error); } });
$('#managed-product-list').addEventListener('click', async (event) => { const row = event.target.closest('[data-managed-product-id]'); if (!row) return; try { await openProductEdit(row.dataset.managedProductId); } catch (error) { showAlert(error); } });
$('#product-edit-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await saveProductEdit(); } catch (error) { showAlert(error); } });
$('#managed-contact-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const contactTypes = [...document.querySelectorAll('input[name="contact-type"]:checked')].map((input) => input.value); if (!contactTypes.length) throw new Error('Choose at least one contact type'); const result = await request('/management/contacts', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, entityType: $('#managed-contact-entity-type').value, contactCode: $('#managed-contact-code').value || undefined, contactTypes, name: $('#managed-contact-name').value, company: $('#managed-contact-company').value || undefined, registrationNoType: $('#managed-contact-registration-type').value || undefined, registrationNo: $('#managed-contact-registration-no').value || undefined, oldRegistrationNo: $('#managed-contact-old-registration-no').value || undefined, phone: $('#managed-contact-phone').value || undefined, email: $('#managed-contact-email').value || undefined, taxId: $('#managed-contact-tax-id').value || undefined, sstRegistrationNo: $('#managed-contact-sst-registration-no').value || undefined, address: $('#managed-contact-address').value || undefined, city: $('#managed-contact-city').value || undefined, state: $('#managed-contact-state').value || undefined, postcode: $('#managed-contact-postcode').value || undefined, countryCode: $('#managed-contact-country').value || undefined, remarks: $('#managed-contact-remarks').value || undefined }) }); $('#managed-contact-form').reset(); $('#managed-contact-entity-type').value = 'MALAYSIAN_COMPANY'; $('#managed-contact-country').value = 'MY'; document.querySelector('input[name="contact-type"][value="CUSTOMER"]').checked = true; $('#contact-create-panel').classList.add('hidden'); $('#management-message').textContent = `${result.name} created as a local contact.`; await loadManagedContacts(); showToast(`${result.name} was created.`); } catch (error) { $('#management-message').textContent = error.message; showAlert(error); } });
$('#location-select').addEventListener('change', async () => { renderRegisters(); await loadCurrentShift(); saveOfflineSession(); await loadOfflineCatalogue(); if (navigator.onLine) void cacheCatalogue().catch(() => undefined); });
$('#register-select').addEventListener('change', loadCurrentShift);
$('#receipt-lookup-form').addEventListener('submit', (event) => { event.preventDefault(); renderReceiptHistory(); });
$('#receipt-lookup-no').addEventListener('input', renderReceiptHistory);
async function markReceiptPrinted(receiptNo) { await request(`/sales/receipt/${encodeURIComponent(receiptNo)}/printed`, { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id }) }); await loadReceiptHistory(); }
async function printReceipt(receiptNo) {
  return printThermalReceipt(receiptNo);
}
async function printThermalReceipt(receiptNo) { const result = await request(`/sales/receipt/${encodeURIComponent(receiptNo)}/thermal`, { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id }) }); await loadReceiptHistory(); showToast(`Receipt queued on the PC (${result.transport}).`); }
async function shareReceiptPdf(receiptNo) { const response = await fetch(`/api/sales/receipt/${encodeURIComponent(receiptNo)}/pdf?companyId=${encodeURIComponent(state.config.company.id)}`, { headers: { Authorization: `Bearer ${state.sessionToken}` } }); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || 'Could not create the receipt PDF'); } const blob = await response.blob(); const file = new File([blob], `${receiptNo}.pdf`, { type: 'application/pdf' }); if (navigator.share && navigator.canShare?.({ files: [file] })) { await navigator.share({ title: `Receipt ${receiptNo}`, text: `Receipt ${receiptNo}`, files: [file] }); showToast('Choose WhatsApp from the sharing options to send the receipt PDF.'); return; } throw new Error('This browser cannot send PDF files to WhatsApp. Open RetailOS in Chrome or Edge on your phone, then tap Share again.'); }
async function receiptAction(event) { const print = event.target.closest('[data-print-receipt], [data-print-offline]'); const share = event.target.closest('[data-share-receipt]'); const returnButton = event.target.closest('[data-return-receipt]'); const voidButton = event.target.closest('[data-void-receipt]'); try { if (print?.dataset.printReceipt) await printReceipt(print.dataset.printReceipt); else if (print) throw new Error('This sale was completed offline. Sync it to RetailOS before printing so the PC print hub can create one auditable receipt.'); else if (share) await shareReceiptPdf(share.dataset.shareReceipt); else if (voidButton) openVoidDialog(voidButton.dataset.voidReceipt); else if (returnButton) await loadReceiptForReturn(returnButton.dataset.returnReceipt); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } }
async function shiftReportAction(event) { const report = event.target.closest('[data-print-shift-report], [data-shift-report-id]'); if (!report) return; try { if (report.dataset.printShiftReport) { const result = await request(`/shifts/${encodeURIComponent(report.dataset.printShiftReport)}/report/print`, { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id }) }); showToast(`Shift report sent through ${result.transport}.`); } else await showShiftReport(report.dataset.shiftReportId); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } }
$('#printable-receipt').addEventListener('click', receiptAction);
$('#printable-receipt').addEventListener('click', shiftReportAction);
$('#receipt-dialog-content').addEventListener('click', receiptAction);
async function showReceipt(receiptNo, print = false) { const sale = await request(`/sales/receipt/${encodeURIComponent(receiptNo)}?companyId=${encodeURIComponent(state.config.company.id)}`); renderPrintableReceipt(sale, { allowReturns: true, allowVoid: true, allowShare: true, target: '#receipt-dialog-content' }); $('#receipt-dialog').classList.remove('hidden'); if (print) await printReceipt(receiptNo); }
async function printReceiptFromHistory(receiptNo) {
  return printThermalReceipt(receiptNo);
}
function openVoidDialog(receiptNo) { state.voidSale = receiptNo; $('#void-form').reset(); $('#void-dialog').classList.remove('hidden'); $('#void-reason').focus(); }
async function voidReceipt() { if (!state.voidSale) throw new Error('Select a receipt to void'); const manager = await request('/auth/pin', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, pin: $('#void-manager-pin').value }) }); if (!manager.user.permissions.includes('sale.void')) throw new Error('A manager PIN is required to void a receipt'); await request(`/sales/receipt/${encodeURIComponent(state.voidSale)}/void`, { method: 'POST', sessionToken: manager.sessionToken, body: JSON.stringify({ companyId: state.config.company.id, actorId: manager.user.id, reason: $('#void-reason').value.trim() }) }); $('#void-dialog').classList.add('hidden'); showToast(`Receipt ${state.voidSale} was voided.`); const receiptNo = state.voidSale; state.voidSale = null; await loadReceiptHistory(); await showReceipt(receiptNo); }
$('#receipt-history').addEventListener('click', async (event) => { const shiftReport = event.target.closest('[data-shift-report-id]'); const view = event.target.closest('[data-history-receipt]'); const print = event.target.closest('[data-print-history-receipt]'); try { if (shiftReport) await showShiftReport(shiftReport.dataset.shiftReportId); else if (view) { $('#receipt-lookup-no').value = view.dataset.historyReceipt; await showReceipt(view.dataset.historyReceipt); } else if (print) await printReceiptFromHistory(print.dataset.printHistoryReceipt); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } });
$('#hide-return-workflow').addEventListener('click', () => { state.returnSale = null; state.exchangeItems = []; $('#return-sale').innerHTML = ''; $('#return-dialog').classList.add('hidden'); });
$('#return-sale').addEventListener('input', (event) => { if (event.target.id === 'exchange-item-query') searchExchangeProducts().catch((error) => { $('#checkout-message').textContent = error.message; }); if (event.target.matches('[data-return-index]') && $('#return-type')?.value === 'EXCHANGE') renderExchangeBalanceAction(); });
$('#return-sale').addEventListener('change', (event) => { if (event.target.id === 'return-type') toggleReturnType(); if (event.target.id === 'exchange-balance-action') $('#exchange-refund-method-wrap').classList.toggle('hidden', event.target.value !== 'REFUND'); });
$('#return-sale').addEventListener('click', async (event) => { if (event.target.id !== 'complete-return') return; try { await completeReturn(); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#return-sale').addEventListener('click', (event) => { const add = event.target.closest('[data-exchange-product-index]'); if (add) { const item = state.exchangeSearchResults[Number(add.dataset.exchangeProductIndex)]; state.exchangeItems.push({ productId: item.id, name: item.name, uom: item.uom, unitPrice: item.unitPrice, availableUoms: item.availableUoms, quantity: 1 }); renderExchangeItems(); return; } const remove = event.target.closest('[data-remove-exchange-item]'); if (remove) { state.exchangeItems.splice(Number(remove.dataset.removeExchangeItem), 1); renderExchangeItems(); } });
$('#shift-action').addEventListener('click', async () => { try { await operateShift(); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#sync-now').addEventListener('click', async () => { try { if (!navigator.onLine) throw new Error('Sync now needs an internet connection. Offline sales remain safely queued.'); $('#sync-now').disabled = true; startSyncProgress(); const result = await request('/sync/now', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id }) }); clearInterval(state.syncProgressTimer); setSyncProgress(75, 'saving catalogue'); await cacheCatalogue(); setSyncProgress(90, 'checking queued sales'); await replayOfflineSales(); setSyncProgress(100, 'complete'); showToast(result.skipped ? result.reason : result.products.notChanged ? 'Bukku and the offline catalogue are already up to date.' : `Bukku sync completed and the local catalogue was refreshed.`); } catch (error) { clearInterval(state.syncProgressTimer); setSyncProgress(0, 'failed'); showAlert(error); } finally { $('#sync-now').disabled = false; finishSyncProgress(); } });
$('#cash-movement').addEventListener('click', async () => { try { await addCashMovement(); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#shift-report').addEventListener('click', async () => { try { await showShiftReport(); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#lookup-form').addEventListener('submit', async (event) => { event.preventDefault(); try { state.searchEpoch += 1; await search(state.searchEpoch); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#lookup-query').addEventListener('input', () => { state.searchEpoch += 1; const epoch = state.searchEpoch; clearTimeout(state.searchTimer); state.searchTimer = setTimeout(() => search(epoch).catch((error) => { $('#checkout-message').textContent = error.message; showAlert(error); }), 220); });
$('#start-barcode-scan').addEventListener('click', async () => { try { await startBarcodeScanner(); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#stop-barcode-scan').addEventListener('click', stopBarcodeScanner);
$('#search-results').addEventListener('click', async (event) => { const adjustment = event.target.closest('[data-adjust-index]'); if (adjustment) { try { await adjustStock(state.searchResults[Number(adjustment.dataset.adjustIndex)]); } catch (error) { $('#checkout-message').textContent = error.message; } return; } const button = event.target.closest('[data-product-index]'); if (button) addProduct(state.searchResults[Number(button.dataset.productIndex)]); });
$('#recent-items').addEventListener('click', (event) => { const button = event.target.closest('[data-recent-item-index]'); if (button) addProduct(state.recentItems[Number(button.dataset.recentItemIndex)]); });
$('#cart-lines').addEventListener('input', (event) => { const input = event.target.closest('[data-quantity]'); if (!input) return; const line = state.cart[Number(input.dataset.quantity)]; line.quantity = Math.max(0.0001, Number(input.value) || 0.0001); renderCart(); });
$('#cart-lines').addEventListener('change', (event) => { const select = event.target.closest('[data-uom-index]'); if (select) { const line = state.cart[Number(select.dataset.uomIndex)]; const choice = line.availableUoms[Number(select.value)]; line.uom = choice.uom; line.unitPrice = choice.unitPrice; line.unitCost = line.basePurchaseCost == null ? null : Number(line.basePurchaseCost) * Number(choice.uom.conversionFactor); delete line.discount; renderCart(); return; } const discountControl = event.target.closest('[data-discount-value]'); if (!discountControl) return; const index = Number(discountControl.dataset.discountValue); try { applyInlineDiscount(index); } catch (error) { showAlert(error); } });
$('#cart-lines').addEventListener('click', (event) => { const button = event.target.closest('[data-action]'); if (!button) return; const index = Number(button.dataset.index); const line = state.cart[index]; if (button.dataset.action === 'plus') line.quantity += 1; if (button.dataset.action === 'minus') line.quantity = Math.max(0.0001, line.quantity - 1); if (button.dataset.action === 'remove') state.cart.splice(index, 1); renderCart(); });
$('#hide-discount-dialog').addEventListener('click', () => $('#discount-dialog').classList.add('hidden'));
$('#discount-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await applyDiscountFromDialog(); } catch (error) { showAlert(error); } });
$('#payment-method').addEventListener('change', syncPaymentMethod);
['#split-cash', '#split-duitnow', '#split-bank-transfer'].forEach((selector) => $(selector).addEventListener('input', renderSplitPayment));
$('#clear-exchange-credit').addEventListener('click', () => {
  state.exchangeCredit = null;
  renderCart();
  $('#checkout-message').textContent = 'Exchange replacement cancelled. The original return remains recorded.';
});
$('#cancel-duitnow').addEventListener('click', () => $('#duitnow-payment').classList.add('hidden'));
$('#cancel-bank-transfer').addEventListener('click', () => $('#bank-transfer-payment').classList.add('hidden'));
$('#hide-cash-payment').addEventListener('click', () => $('#cash-payment-dialog').classList.add('hidden'));
$('#cash-payment-received').addEventListener('input', updateCashChange);
$('#cash-payment-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await completeCheckout(true, $('#cash-payment-received').value); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#pay-cash').addEventListener('click', async () => { try { await completeCheckout(); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#confirm-duitnow').addEventListener('click', async () => { try { await completeCheckout(true); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#confirm-bank-transfer').addEventListener('click', async () => { try { await completeCheckout(true); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#confirm-split').addEventListener('click', async () => { try { await completeCheckout(true); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#hide-shift-close').addEventListener('click', () => $('#shift-close-dialog').classList.add('hidden'));
$('#shift-close-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await closeShiftFromDialog(); } catch (error) { showAlert(error); } });
$('#hide-shift-open').addEventListener('click', () => $('#shift-open-dialog').classList.add('hidden'));
$('#shift-open-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await openShiftFromDialog(); } catch (error) { showAlert(error); } });
$('#hide-cash-movement').addEventListener('click', () => $('#cash-movement-dialog').classList.add('hidden'));
$('#cash-movement-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await saveCashMovement(); } catch (error) { showAlert(error); } });
$('#hide-void-dialog').addEventListener('click', () => { state.voidSale = null; $('#void-dialog').classList.add('hidden'); });
$('#void-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await voidReceipt(); } catch (error) { showAlert(error); } });

async function restoreOfflineSessionIfNeeded() {
  await refreshOfflineStatus();
  if (navigator.onLine) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(offlineSessionKey()) || 'null');
    if (!saved?.config || !saved?.user) return;
    state.config = saved.config; state.user = saved.user; state.shift = saved.shift || null;
    $('#login-view').classList.add('hidden'); $('#pos-view').classList.remove('hidden'); renderConfig();
    const recovered = restoreCart(); renderCart(); await loadOfflineCatalogue(); await loadCurrentShift();
    showToast(recovered ? 'Offline cashier session restored. Your saved cart is ready.' : 'Offline cashier session restored. Orders will be queued until connection returns.');
  } catch (_) { /* A normal PIN sign-in remains available when the connection returns. */ }
}

async function restorePersistentSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(persistentSessionKey()) || 'null');
    if (!saved?.config || !saved?.user || !saved?.sessionToken || !saved?.expiresAt || saved.expiresAt < Date.now()) { localStorage.removeItem(persistentSessionKey()); return false; }
    if (!navigator.onLine) return false;
    await request('/auth/session', { sessionToken: saved.sessionToken });
    state.config = await request(`/pos/bootstrap?companyCode=${encodeURIComponent(saved.config.company.code)}`, { sessionToken: saved.sessionToken });
    state.user = saved.user; state.sessionToken = saved.sessionToken; state.shift = saved.shift || null;
    $('#login-view').classList.add('hidden'); $('#pos-view').classList.remove('hidden'); renderConfig();
    const recovered = restoreCart(); renderCart(); await loadCurrentShift(); saveOfflineSession(); savePersistentSession(); await loadOfflineCatalogue(); await refreshOfflineStatus();
    void cacheCatalogue().catch(() => undefined); void replayOfflineSales();
    showToast(recovered ? 'Your 7-day cashier session was restored. Your saved cart is ready.' : 'Your 7-day cashier session was restored.');
    return true;
  } catch (error) {
    if (!isNetworkIssue(error)) clearPersistentSession();
    return false;
  }
}

window.addEventListener('online', async () => {
  await refreshOfflineStatus();
  if (!state.config) return;
  showToast('Connection restored. Refreshing the catalogue and syncing saved sales…');
  try { await cacheCatalogue(); await replayOfflineSales(); await loadCurrentShift(); } catch (error) { showAlert(error); }
});
window.addEventListener('offline', () => { void refreshOfflineStatus(); if (state.config) showToast('Offline mode enabled. Orders will be saved on this device and synced automatically.'); });
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/service-worker.js').catch(() => undefined);
void restorePersistentSession().then((restored) => { if (!restored) return restoreOfflineSessionIfNeeded(); });
