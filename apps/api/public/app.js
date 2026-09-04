const state = { config: null, user: null, sessionToken: null, approvalTokens: {}, cart: [], quantityDrafts: {}, quantityErrors: {}, quantityWarnings: {}, saleDiscount: null, exchangeCredit: null, exchangeItems: [], exchangeRefundPreference: null, searchResults: [], recentItems: [], exchangeSearchResults: [], receiptHistory: [], discountTarget: null, discountErrors: {}, cartOpener: null, voidSale: null, editingProduct: null, shift: null, verifiedShift: null, returnSale: null, scannerStream: null, scannerActive: false, searchTimer: null, searchAbort: null, searchEpoch: 0, managementSearchTimer: null, alertTimer: null, toastTimer: null, syncProgressTimer: null, catalogue: [], catalogueSavedAt: null, replayingOfflineSales: false, backoffice: { range: 'TODAY', section: 'overview', data: null, rows: [], abort: null, batch: null, ledger: null }, language: localStorage.getItem('retailos-language') || 'en' };
const $ = (selector) => document.querySelector(selector);
const money = (value) => `RM${Number(value || 0).toFixed(2)}`;
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const languageText = {
  en: { sale: 'New sale', cart: 'Cart', signOut: 'Sign out', settings: 'Settings', dashboard: 'Dashboard', receipts: 'Receipts', contacts: 'Contacts', products: 'Products', cashMove: 'Cash in/out', sync: 'Sync now', report: 'Shift report', add: 'Add', addItem: 'Add item', cashCheckout: 'Cash checkout', findReceipt: 'Find / reprint receipt', cartEmpty: 'No items yet.', subtotal: 'Subtotal', discount: 'Discount', total: 'Total', paymentMethod: 'Payment method', remove: 'Remove', available: 'Available', inventoryBalance: 'Inventory balance', stockNotTracked: 'Stock not tracked', noMatchingCachedItems: 'No matching cached items.', noExactStructured: 'No exact {query} found.', showRelated: 'Show related results?', relatedResults: 'Related results — exact structured match was not found.', unsafeShorthand: 'Add a dimension and material before using this one-letter product shorthand.', quantity: 'Quantity', invalidQuantity: 'Enter a whole quantity of at least 1.', openShiftBeforeCheckout: 'Open a shift before checkout.', stockWarning: 'Stock shortage: {available} in stock, {requested} requested. This sale will result in stock {result}.', stockWarningNegative: 'Current inventory balance is {balance}. Selling {requested} will result in stock {result}.', matchedAlias: 'Matched: {alias} → {name}' },
  zh: { sale: '新销售', cart: '购物车', signOut: '退出', settings: '设置', dashboard: '主页', receipts: '收据', contacts: '联系人', products: '产品', cashMove: '现金存取', sync: '立即同步', report: '班次报表', add: '添加', addItem: '添加商品', cashCheckout: '现金结账', findReceipt: '查找 / 重印收据', cartEmpty: '尚未添加商品。', subtotal: '小计', discount: '折扣', total: '总额', paymentMethod: '付款方式', remove: '移除', available: '可用库存', inventoryBalance: '库存余额', stockNotTracked: '未追踪库存', noMatchingCachedItems: '没有匹配的缓存商品。', noExactStructured: '找不到完全匹配的{query}。', showRelated: '显示相关结果？', relatedResults: '相关结果 — 找不到完全匹配的结构化商品。', unsafeShorthand: '使用单字母商品简称前，请同时输入尺寸和材料。', quantity: '数量', invalidQuantity: '请输入不小于 1 的整数数量。', openShiftBeforeCheckout: '结账前请先开启班次。', stockWarning: '库存不足：库存 {available}，销售数量 {requested}。此销售后库存将为 {result}。', stockWarningNegative: '当前库存余额为 {balance}。销售 {requested} 后库存将为 {result}。', matchedAlias: '匹配：{alias} → {name}' },
};
function t(key, variables = {}) { const template = languageText[state.language]?.[key] || languageText.en[key] || key; return template.replace(/\{(\w+)\}/g, (_, name) => String(variables[name] ?? `{${name}}`)); }
const chineseStaticText = {
  'Sign in with your cashier PIN to start a sale.': '使用收银员 PIN 登录以开始销售。', 'Company code': '公司代码', 'Cashier PIN': '收银员 PIN', 'Start cashier session': '开始收银班次',
  'Shift: checking…': '班次：检查中…', 'Checking connection…': '正在检查连接…', 'Open shift': '开启班次', 'Close shift': '关闭班次', 'Shift reports': '班次报表',
  'Scan barcode with phone camera': '使用手机相机扫描条码', 'Use the number on the price tag. For fittings, type part of the item name.': '输入价签上的号码；五金配件可输入商品名称的一部分。', 'Latest added items': '最近添加的商品', 'Last 10': '最近 10 项', 'Items you add will appear here.': '您添加的商品会显示在这里。',
  'Close': '关闭', 'No items yet.': '尚未添加商品。', 'Subtotal': '小计', 'Discount': '折扣', 'Total': '总额', 'Exchange credit ready': '换货余额已准备', 'Cancel replacement': '取消换货', 'Payment method': '付款方式', 'Cash': '现金', 'Card': '银行卡', 'Bank transfer': '银行转账', 'Split payment': '混合付款', 'Other': '其他',
  'Enter the amount received by each method. The total must match the sale exactly.': '输入每种付款方式的收款额；合计必须与销售总额完全一致。', 'Sale total': '销售总额', 'Payment entered': '已输入付款', 'Confirm all split payments received': '确认已收到全部混合付款', 'Pay by DuitNow': 'DuitNow 付款', 'Amount to collect:': '应收金额：', 'Payment received — complete sale': '已收款 — 完成销售', 'Cancel': '取消', 'Bank transfer details': '银行转账资料', 'Bank': '银行', 'Account name': '账户名称', 'Account number': '账号', 'Transfer received — complete sale': '已收到转账 — 完成销售',
  'Scan barcode': '扫描条码', 'Point the camera at the barcode.': '将相机对准条码。', 'Receipt': '收据', 'Return / exchange': '退货 / 换货', 'Choose the returned quantities, then select the outcome.': '选择退货数量，然后选择处理方式。',
  'Company details': '公司资料', 'Printer settings': '打印机设置', 'Bukku daily invoice': 'Bukku 每日发票', 'Staff accounts': '员工账户', 'Save': '保存', 'Test PC printer': '测试电脑打印机', 'Customer e-Invoice QR on receipts': '收据上的电子发票二维码', 'Enable e-Invoice request QR': '启用电子发票申请二维码',
  'Cash payment': '现金付款', 'Cash received': '收到现金', 'Balance to return:': '找零：', 'Complete': '完成', 'Opening cash float': '开班备用金', 'Cash in / out': '现金存入 / 取出', 'Type': '类型', 'Cash in': '现金存入', 'Cash out': '现金取出', 'Amount (RM)': '金额（RM）', 'Reason': '原因', 'Manager PIN': '经理 PIN', 'Save cash movement': '保存现金记录',
  'Add': '添加', 'Remove': '移除', 'Available': '可用库存', 'Stock not tracked': '未追踪库存', 'No matching cached items.': '没有匹配的缓存商品。', 'Searching products…': '正在搜索商品…', 'Cash checkout': '现金结账', 'Search SKU, item name, or barcode': '搜索 SKU、商品名称或条码', 'Search contact name, phone, or email': '搜索联系人姓名、电话或电邮', 'Type barcode number, SKU, or item name': '输入条码、SKU 或商品名称', 'Clear item search': '清除商品搜索', 'Clear product search': '清除商品搜索', 'Clear contact search': '清除联系人搜索', 'Open cart': '打开购物车', 'Dismiss message': '关闭消息', 'Search aliases / alternative names': '搜索别名 / 替代名称', 'Cashiers can search these names. Product names, SKUs and barcodes remain unchanged.': '收银员可搜索这些名称；商品名称、SKU 和条码保持不变。', 'New alias': '新别名', 'Add alias': '添加别名', 'No manually maintained aliases.': '没有手动维护的别名。'
};
const staticTextOriginal = new WeakMap();
function translateStaticText(root = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const original = staticTextOriginal.get(node) || node.nodeValue;
    staticTextOriginal.set(node, original);
    if (state.language === 'zh' && chineseStaticText[original.trim()]) node.nodeValue = original.replace(original.trim(), chineseStaticText[original.trim()]);
    if (state.language === 'en') node.nodeValue = original;
  }
  root.querySelectorAll?.('[placeholder],[aria-label]').forEach((element) => ['placeholder', 'aria-label'].forEach((attribute) => {
    const sourceAttribute = `data-i18n-${attribute}`;
    const original = element.getAttribute(sourceAttribute) || element.getAttribute(attribute); if (!original) return;
    if (!element.hasAttribute(sourceAttribute)) element.setAttribute(sourceAttribute, original);
    element.setAttribute(attribute, state.language === 'zh' ? (chineseStaticText[original] || original) : original);
  }));
}
function applyLanguage() {
  const text = languageText[state.language] || languageText.en;
  document.documentElement.lang = state.language === 'zh' ? 'zh-Hans' : 'en';
  $('#language-select').value = state.language;
  const labels = { '.pos header h1': text.sale, '#open-cart span': text.cart, '#sign-out': text.signOut, '#nav-company span:last-child': text.settings, '#nav-dashboard span:last-child': text.dashboard, '#nav-receipts span:last-child': text.receipts, '#nav-contacts span:last-child': text.contacts, '#nav-products span:last-child': text.products, '#cash-movement': text.cashMove, '#sync-now': text.sync, '#shift-report': text.report, '.lookup h2': text.addItem, '#pay-cash': text.cashCheckout, '#receipt-panel h2': text.findReceipt };
  Object.entries(labels).forEach(([selector, value]) => { const element = $(selector); if (element) element.textContent = value; });
  translateStaticText();
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
function syncShiftCloseAcknowledgement() {
  const checkbox = $('#shift-stock-shortage-acknowledged'); const message = $('#shift-stock-shortage-message'); const submit = $('#shift-close-form button[type="submit"]');
  const needsAcknowledgement = Number(state.shift?.stockShortageCount || 0) > 0;
  checkbox.closest('label').classList.toggle('hidden', !needsAcknowledgement);
  if (!needsAcknowledgement) checkbox.checked = false;
  message.textContent = needsAcknowledgement && !checkbox.checked ? 'A manager must acknowledge stock shortages before closing this shift.' : '';
  message.classList.toggle('hidden', !message.textContent);
  submit.disabled = needsAcknowledgement && !checkbox.checked;
}
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
// This acknowledgement is intentionally separate from the manager PIN: it
// records that the manager reviewed a shortage rather than merely authorising
// the routine close operation.
const stockShortageAcknowledgement = document.createElement('label');
stockShortageAcknowledgement.className = 'check wide';
stockShortageAcknowledgement.innerHTML = '<input id="shift-stock-shortage-acknowledged" type="checkbox" />I acknowledge any negative-stock / stock-follow-up entries in this shift report.';
document.querySelector('#shift-close-form button[type="submit"]')?.before(stockShortageAcknowledgement);
const stockShortageCloseMessage = document.createElement('p');
stockShortageCloseMessage.id = 'shift-stock-shortage-message'; stockShortageCloseMessage.className = 'message wide hidden';
stockShortageAcknowledgement.after(stockShortageCloseMessage);
const openingFloatApproval = document.createElement('fieldset');
openingFloatApproval.id = 'shift-opening-anomaly'; openingFloatApproval.className = 'wide hidden';
openingFloatApproval.innerHTML = '<legend>Large opening-float approval</legend><label class="check"><input id="shift-opening-confirmed" type="checkbox" />I confirm this opening float is correct.</label><label>Manager PIN<input id="shift-opening-manager-pin" type="password" inputmode="numeric" maxlength="12" /></label>';
document.querySelector('#shift-open-form button[type="submit"]')?.before(openingFloatApproval);

async function request(path, options = {}) {
  const { sessionToken, approvalToken, headers: optionHeaders, ...fetchOptions } = options;
  const token = sessionToken || state.sessionToken;
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(approvalToken ? { 'X-RetailOS-Approval': approvalToken } : {}), ...(optionHeaders || {}) };
  const response = await fetch(`/api${path}`, { ...fetchOptions, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message || 'Request failed'); showAlert(error); throw error; }
  return body;
}

function selectedLocation() { return state.config?.locations?.find((location) => location.id === $('#location-select').value) || null; }
function selectedPriceLevel() { return state.config?.priceLevels?.find((level) => level.id === $('#price-level-select').value) || null; }
function shiftMatchesCheckoutContext(shift) {
  const location = selectedLocation();
  return Boolean(shift && location && state.user && shift.locationId === location.id && shift.registerId === $('#register-select').value && shift.cashierId === state.user.id);
}
function canCheckout() {
  // A live response is verified by loadCurrentShift.  In offline mode, only a
  // persisted copy of that exact previously verified shift can be used.
  return shiftMatchesCheckoutContext(state.shift) && state.verifiedShift?.id === state.shift.id && shiftMatchesCheckoutContext(state.verifiedShift);
}
function cartStorageKey() { return state.config && state.user ? `retailos-cart:${state.config.company.id}:${state.user.id}` : null; }
function persistCart() { const key = cartStorageKey(); if (!key) return; if (!state.cart.length) { localStorage.removeItem(key); return; } localStorage.setItem(key, JSON.stringify({ cart: state.cart, savedAt: new Date().toISOString() })); }
function restoreCart() { const key = cartStorageKey(); if (!key) return false; try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (!Array.isArray(saved?.cart) || !saved.cart.length) return false; state.cart = saved.cart; return true; } catch (_) { localStorage.removeItem(key); return false; } }
function clearSavedCart() { const key = cartStorageKey(); if (key) localStorage.removeItem(key); }
function offlineSessionKey() { return 'retailos-offline-session'; }
function persistentSessionKey() { return 'retailos-session'; }
function catalogueKey() { return state.config && selectedLocation() && selectedPriceLevel() ? `${state.config.company.id}:${selectedLocation().id}:${selectedPriceLevel().id}` : null; }
function isNetworkIssue(error) { return !navigator.onLine || error instanceof TypeError || /network|fetch|failed to fetch|load failed/i.test(String(error?.message || error)); }
function offlineId() { return typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function saveOfflineSession() { if (!state.config || !state.user) return; sessionStorage.setItem(offlineSessionKey(), JSON.stringify({ config: state.config, user: state.user, shift: state.shift, verifiedShift: state.verifiedShift, savedAt: new Date().toISOString() })); }
function savePersistentSession() {
  if (!state.config || !state.user || !state.sessionToken) return;
  localStorage.setItem(persistentSessionKey(), JSON.stringify({ config: state.config, user: state.user, sessionToken: state.sessionToken, shift: state.shift, verifiedShift: state.verifiedShift, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 }));
}
function clearPersistentSession() { localStorage.removeItem(persistentSessionKey()); sessionStorage.removeItem(offlineSessionKey()); }
function closeItemSearch(clearInput = true) {
  state.searchEpoch += 1; clearTimeout(state.searchTimer); state.searchAbort?.abort(); state.searchAbort = null; state.searchResults = []; $('#search-results').innerHTML = '';
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
  return !first ? null : { id: product.id, name: product.name, sku: product.sku, supplierDescription: product.supplierDescription, supplierName: product.supplierName, category: product.category, aliases: product.aliases || [], searchDimensions: product.searchDimensions || [], searchMaterials: product.searchMaterials || [], searchProductTypes: product.searchProductTypes || [], matchedAlias: product.matchedAlias || null, lastPurchasedAt: product.lastPurchasedAt, uom: first.uom, unitPrice: first.unitPrice, availableUoms, availableStock: product.stock == null ? null : Number(product.stock), basePurchaseCost: product.basePurchaseCost == null ? null : Number(product.basePurchaseCost) };
}
const productSearchSynonyms = [['ss', 's.s', 's/steel', 'stainless steel'], ['ms', 'm.s', 'm/s', 'm steel', 'mild steel'], ['reducing', 'r bush', 'r/bush', 'rbush', 'valve socket'], ['p sleeve', 'p/sleeve', 'psleeve', 'pipe sleeve', 'p slip', 'p-slip', 'pslip', 'pipe slip']];
function normalizeProductSearch(value) {
  const protectedDimensions = String(value || '').normalize('NFKC').toLocaleLowerCase('en').replace(/(\p{N})\s*\/\s*(\p{N})/gu, '$1 fraction $2').replace(/(\p{N})\s*\.\s*(\p{N})/gu, '$1 decimal $2').replace(/(\p{N})\s*["″]/gu, '$1 inch ').replace(/(\p{N})\s*['’′]/gu, '$1 foot ');
  const token = protectedDimensions.replace(/[\/._\-'’()[\]{}]+/gu, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  return { token, compact: token.replace(/\s+/g, ''), tokens: token ? token.split(' ') : [] };
}
function hardwareDimensionMatches(value) {
  const text = String(value || '').normalize('NFKC').toLocaleLowerCase('en').replace(/⁄/g, '/').replace(/½/g, '1/2');
  const matches = [];
  for (const match of text.matchAll(/(^|[^\d])((?:\d+\s+)?\d+\s*\/\s*\d+)(?:\s*(?:["″]|['’′]{1,2}|inch(?:es)?\b|in\b))?/giu)) {
    const boundary = match[1].length; const index = (match.index || 0) + boundary; const raw = match[0].slice(boundary);
    matches.push({ raw, dimension: `${match[2].trim().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ')}"`, index, end: index + raw.length });
  }
  for (const match of text.matchAll(/(^|[^\d])(\d+(?:\.\d+)?)\s*(?:["″]|['’′]{1,2}|inch(?:es)?\b|in\b)/giu)) {
    const boundary = match[1].length; const index = (match.index || 0) + boundary; const raw = match[0].slice(boundary); const end = index + raw.length;
    if (!matches.some((item) => index < item.end && end > item.index)) matches.push({ raw, dimension: `${match[2]}"`, index, end });
  }
  return matches.sort((left, right) => left.index - right.index);
}
function structuredProductSearch(query) {
  const text = String(query || '').normalize('NFKC').toLocaleLowerCase('en').replace(/⁄/g, '/').replace(/½/g, '1/2');
  const materialMatch = text.match(/(?:^|[^a-z0-9])(stainless\s+steel|s\s*\/\s*steel|s\s*\.\s*s|ss)(?=$|[^a-z0-9])/i) ? ['STAINLESS_STEEL', 'S/STEEL', 'S/STEEL'] : text.match(/(?:^|[^a-z0-9])(mild\s+steel|m\s+steel|m\s*\/\s*s|m\s*\.\s*s|ms)(?=$|[^a-z0-9])/i) ? ['MILD_STEEL', 'Mild steel', '低碳钢'] : null;
  const typeMatch = text.match(/(?:^|[^a-z0-9])(reducing\s+bush|r\s*\/\s*bush|r\s+bush|rbush|valve\s+socket)(?=$|[^a-z0-9])/i) ? ['REDUCING_BUSH', 'Reducing bush', '异径套管'] : text.match(/(?:^|[^a-z0-9])(pipe\s+(?:slip|sleeve)|p\s*[-/]\s*(?:slip|sleeve)|p\s+(?:slip|sleeve)|p(?:slip|sleeve))(?=$|[^a-z0-9])/i) ? ['PIPE_SLIP', 'Pipe Sleeve', '管套'] : text.match(/(?:^|[^a-z0-9])(nipple|n)(?=$|[^a-z0-9])/i) ? ['NIPPLE', 'Nipple', '短接'] : text.match(/(?:^|[^a-z0-9])(bend|b)(?=$|[^a-z0-9])/i) ? ['BEND', 'Bend', '弯管'] : null;
  const dimensionMatch = hardwareDimensionMatches(text)[0] || null;
  let dimension = dimensionMatch?.dimension || null;
  if (!dimension && /^\s*10\b(?!\s*mm\b)/.test(text) && (materialMatch || typeMatch)) dimension = '10"';
  const familySource = text
    .replace(/(\d+(?:\s+\d+\s*\/\s*\d+|\s*\/\s*\d+)?)\s*(?:["″]|['’′]{1,2}|inch(?:es)?\b|in\b)/ig, ' ')
    .replace(/\d+(?:\s+\d+)?\s*\/\s*\d+/g, ' ')
    .replace(/^\s*10\b(?!\s*mm\b)/, ' ')
    .replace(/(?:^|[^a-z0-9])(?:stainless\s+steel|s\s*\/\s*steel|s\s*\.\s*s|ss|mild\s+steel|m\s+steel|m\s*\/\s*s|m\s*\.\s*s|ms)(?=$|[^a-z0-9])/ig, ' ')
    .replace(/(?:^|[^a-z0-9])(?:reducing\s+bush|reducing|r\s*\/\s*bush|r\s+bush|rbush|pipe\s+(?:slip|sleeve)|p\s*[-/]\s*(?:slip|sleeve)|p\s+(?:slip|sleeve)|p(?:slip|sleeve)|nipple|n|bend|b)(?=$|[^a-z0-9])/ig, ' ');
  const familyTerms = normalizeProductSearch(familySource).tokens.filter((token) => !['inch', 'in', 'foot'].includes(token));
  const recognized = [dimension, materialMatch, typeMatch].filter(Boolean).length;
  const unsafeShorthandOnly = recognized === 1 && typeMatch && ['n', 'b'].includes(normalizeProductSearch(query).compact);
  return { dimension, dimensionLabel: dimension ? `${dimension.slice(0, -1)}″` : null, material: materialMatch?.[0] || null, materialLabel: state.language === 'zh' ? materialMatch?.[2] : materialMatch?.[1], productType: typeMatch?.[0] || null, productTypeLabel: state.language === 'zh' ? typeMatch?.[2] : typeMatch?.[1], familyTerms, structured: !unsafeShorthandOnly && (Boolean(dimensionMatch) || recognized >= 2), unsafeShorthandOnly };
}
function cachedStructuredScore(product, query) {
  const dimensions = explicitCachedProductDimensions(product);
  const materials = product.searchMaterials || [];
  const productTypes = product.searchProductTypes || [];
  return Number(Boolean(query.dimension && dimensions.includes(query.dimension))) + Number(Boolean(query.material && materials.includes(query.material))) + Number(Boolean(query.productType && productTypes.includes(query.productType)));
}
function cachedStructuredSpecificity(product, query) {
  return (query.dimension ? Math.max(0, explicitCachedProductDimensions(product).length - 1) : 0) * 100
    + (query.material ? Math.max(0, (product.searchMaterials || []).length - 1) : 0) * 10
    + (query.productType ? Math.max(0, (product.searchProductTypes || []).length - 1) : 0);
}
function explicitCachedProductDimensions(product) {
  const searchable = [product.name, product.supplierDescription, product.category, ...(product.aliases || []).filter((alias) => alias.source !== 'GENERATED').map((alias) => alias.text)].filter(Boolean).join(' ');
  return [...new Set(hardwareDimensionMatches(searchable).map((match) => match.dimension))];
}
function cachedStructuredFamilyMatch(product, query) { const searchable = normalizeProductSearch([product.name, product.supplierDescription, product.category, ...(product.aliases || []).map((alias) => alias.text)].filter(Boolean).join(' ')); return !query.familyTerms?.length || query.familyTerms.every((term) => searchable.tokens.some((token) => token.startsWith(term))); }
function expandedProductSearch(query) {
  const needle = normalizeProductSearch(query); const group = productSearchSynonyms.find((values) => values.some((value) => { const candidate = normalizeProductSearch(value); return candidate.token === needle.token || candidate.compact === needle.compact; }));
  return [...new Set([query.trim(), ...(group || [])].filter(Boolean))];
}
function rankCachedProduct(product, query) {
  const needle = normalizeProductSearch(query); const sku = normalizeProductSearch(product.sku); const name = normalizeProductSearch(product.name); const aliases = product.aliases || []; const fields = [name, normalizeProductSearch(product.supplierDescription), normalizeProductSearch(product.category)];
  if ((product.barcodes || []).some((barcode) => String(barcode).trim() === query.trim())) return { rank: 0, matchedAlias: null };
  if (sku.token === needle.token) return { rank: 1, matchedAlias: null };
  if (name.token === needle.token) return { rank: 2, matchedAlias: null };
  let alias = aliases.find((item) => item.normalizedToken === needle.token); if (alias) return { rank: 3, matchedAlias: alias.text };
  alias = aliases.find((item) => item.normalizedCompact === needle.compact); if (alias) return { rank: 4, matchedAlias: alias.text };
  alias = aliases.find((item) => item.normalizedToken.startsWith(needle.token) || item.normalizedCompact.startsWith(needle.compact));
  if (sku.token.startsWith(needle.token) || fields.some((field) => field.token.startsWith(needle.token)) || alias) return { rank: 5, matchedAlias: alias?.text || null };
  alias = aliases.find((item) => needle.tokens.every((part) => item.normalizedToken.split(' ').some((token) => token.startsWith(part))));
  if (needle.tokens.length && (fields.some((field) => needle.tokens.every((part) => field.tokens.some((token) => token.startsWith(part)))) || alias)) return { rank: 6, matchedAlias: alias?.text || null };
  return null;
}
function searchCachedCatalogue(query, related = false) {
  const interpretation = structuredProductSearch(query);
  if (interpretation.unsafeShorthandOnly) return { items: [], interpretation, exact: true, relatedAvailable: false };
  if (interpretation.structured) {
    const recognized = [interpretation.dimension, interpretation.material, interpretation.productType].filter(Boolean).length;
    const normalizedQuery = normalizeProductSearch(query).token;
    const scored = state.catalogue.map((product) => ({ product, score: cachedStructuredScore(product, interpretation), specificity: cachedStructuredSpecificity(product, interpretation), exactName: normalizeProductSearch(product.name).token === normalizedQuery }));
    const threshold = related ? Math.max(1, recognized - 1) : recognized;
    const matches = scored.filter((entry) => entry.score >= threshold && (related || cachedStructuredFamilyMatch(entry.product, interpretation))).sort((left, right) => right.score - left.score || Number(right.exactName) - Number(left.exactName) || left.specificity - right.specificity || left.product.name.localeCompare(right.product.name)).slice(0, 20).map((entry) => productFromCatalogue(entry.product)).filter(Boolean);
    return { items: matches, interpretation, exact: !related, relatedAvailable: !related && !matches.length && scored.some((entry) => entry.score >= Math.max(1, recognized - 1)) };
  }
  const terms = expandedProductSearch(query);
  const items = state.catalogue.map((product) => { const direct = rankCachedProduct(product, query); const synonym = direct ? null : terms.map((term) => rankCachedProduct(product, term)).find(Boolean); return direct || synonym ? { product: { ...product, matchedAlias: (direct?.matchedAlias || (synonym ? query.trim() : null)) }, rank: (direct || synonym).rank } : null; }).filter(Boolean).sort((a, b) => a.rank - b.rank || a.product.name.localeCompare(b.product.name)).slice(0, 20).map((entry) => productFromCatalogue(entry.product)).filter(Boolean);
  return { items, interpretation: null, exact: true, relatedAvailable: false };
}
function renderSearchResults(products, source = '', meta = null) {
  state.searchResults = products;
  const interpretation = meta?.interpretation; const chips = interpretation ? [interpretation.dimensionLabel, interpretation.materialLabel, interpretation.productTypeLabel].filter(Boolean) : [];
  const interpreted = chips.length ? `<div class="search-interpretation" aria-label="${state.language === 'zh' ? '已解析的搜索条件' : 'Interpreted search'}">${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('')}</div>` : '';
  const empty = interpretation?.unsafeShorthandOnly ? `<p class="message" role="alert">${escapeHtml(t('unsafeShorthand'))}</p>` : interpretation?.structured ? `<div class="structured-empty" role="status"><p>${escapeHtml(t('noExactStructured', { query: chips.join(' ') }))}</p>${meta.relatedAvailable ? `<button type="button" class="quiet" data-related-search>${escapeHtml(t('showRelated'))}</button>` : ''}</div>` : `<p class="muted">${escapeHtml(t('noMatchingCachedItems'))}</p>`;
  $('#search-results').innerHTML = `${interpreted}${source ? `<p class="muted small">${source}</p>` : ''}${products.length ? products.map((product, index) => `<article class="product"><div><strong>${escapeHtml(product.name)}</strong><p>${escapeHtml(product.sku)} · ${escapeHtml(product.uom.name)} · ${money(product.unitPrice)} · ${product.availableStock == null ? escapeHtml(t('stockNotTracked')) : `${escapeHtml(t('available'))} ${product.availableStock}`}${product.supplierDescription ? ` · ${escapeHtml(product.supplierDescription)}` : ''}</p>${product.matchedAlias ? `<p class="matched-alias">${escapeHtml(t('matchedAlias', { alias: product.matchedAlias, name: product.name }))}</p>` : ''}</div><button data-product-index="${index}">${escapeHtml(t('add'))}</button></article>`).join('') : empty}`;
  translateStaticText($('#search-results'));
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
  if (!canCheckout()) throw new Error(t('openShiftBeforeCheckout'));
  const entry = { offlineId: payload.offlineId, companyId: payload.companyId, payload, items: snapshot, subtotal: totals().subtotal, discount: totals().discount, total: totals().total, shiftVerification: { shiftId: state.verifiedShift.id, companyId: state.config.company.id, locationId: selectedLocation().id, registerId: $('#register-select').value, cashierId: state.user.id, verifiedAt: state.verifiedShift.openedAt }, approvals: { ...state.approvalTokens }, stockSnapshot: snapshot.map((line) => ({ productId: line.productId, availableStock: line.availableStock, quantity: line.quantity, uomId: line.uom.id })), provisionalReceiptNo: `OFF-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${payload.offlineId.slice(0, 6).toUpperCase()}`, createdAt: new Date().toISOString(), status: 'PENDING' };
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
function parseDiscountExpression(value) { const text = String(value || '').trim(); if (!text) return { empty: true }; const match = /^(\d+)(?:\.(\d{1,2}))?(%)?$/.exec(text); if (!match) return { error: 'Enter a non-negative RM amount or percentage with no more than two decimal places.' }; const amount = Number(`${match[1]}${match[2] ? `.${match[2]}` : ''}`); if (!Number.isFinite(amount)) return { error: 'Enter a valid discount.' }; if (match[3] && amount > 100) return { error: 'Percentage discount cannot exceed 100%.' }; return { type: match[3] ? 'PERCENTAGE' : 'FIXED', value: amount }; }
function setDiscountError(index, error) { const control = $(`[data-discount-value="${index}"]`); if (!control) return; const message = $(`#discount-error-${index}`); if (error) { state.discountErrors[index] = error; control.setAttribute('aria-invalid', 'true'); control.setAttribute('aria-describedby', `discount-error-${index}`); if (message) message.textContent = error; } else { delete state.discountErrors[index]; control.removeAttribute('aria-invalid'); control.removeAttribute('aria-describedby'); if (message) message.textContent = ''; } syncPaymentMethod(); }
function totals() { const subtotal = state.cart.reduce((sum, line) => sum + lineGross(line), 0); const lineDiscountTotal = state.cart.reduce((sum, line) => sum + lineDiscount(line), 0); const afterLines = subtotal - lineDiscountTotal; const saleDiscount = discountAmount(afterLines, state.saleDiscount); return { subtotal, discount: lineDiscountTotal + saleDiscount, total: afterLines - saleDiscount }; }

function renderConfig() {
  $('#company-name').textContent = state.config.company.name;
  $('#cashier-name').textContent = state.user.name;
  $('#location-select').innerHTML = state.config.locations.map((location) => `<option value="${location.id}">${location.name}</option>`).join('');
  $('#price-level-select').innerHTML = state.config.priceLevels.map((level) => `<option value="${level.id}">${level.name}</option>`).join('');
  const retail = state.config.priceLevels.find((level) => level.code === 'RETAIL');
  if (retail) $('#price-level-select').value = retail.id;
  refreshManagementAvailability();
  renderRegisters();
  applyLanguage();
}

function renderRegisters() { const location = selectedLocation(); $('#register-select').innerHTML = location.registers.map((register) => `<option value="${register.id}">${register.name}</option>`).join(''); }
async function loadCurrentShift() {
  try {
    state.shift = await request(`/shifts/current?registerId=${encodeURIComponent($('#register-select').value)}&companyId=${encodeURIComponent(state.config.company.id)}`);
    state.verifiedShift = { ...state.shift };
    const openedAt = new Date(state.shift.openedAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
    $('#shift-status').textContent = `Shift: open since ${openedAt}`;
    const mayCloseShift = state.user.permissions.includes('shift.close');
    $('#shift-action').textContent = mayCloseShift ? 'Close shift' : 'Shift open';
    $('#shift-action').disabled = !mayCloseShift;
    $('#cash-movement').disabled = false;
    saveOfflineSession();
  } catch (_) {
    if (!navigator.onLine && canCheckout()) {
      const openedAt = new Date(state.shift.openedAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
      $('#shift-status').textContent = `Shift: offline · opened since ${openedAt}`;
      const mayCloseShift = state.user.permissions.includes('shift.close');
      $('#shift-action').textContent = mayCloseShift ? 'Close shift' : 'Shift open';
      $('#shift-action').disabled = !mayCloseShift;
      $('#cash-movement').disabled = true;
      return;
    }
    state.shift = null; state.verifiedShift = null;
    $('#shift-status').textContent = 'Shift: not open';
    $('#shift-action').textContent = 'Open shift';
    $('#shift-action').disabled = !state.user.permissions.includes('shift.open');
    $('#cash-movement').disabled = true;
    saveOfflineSession();
  }
}

async function operateShift() {
  const location = selectedLocation(); const registerId = $('#register-select').value;
  if (!state.shift) {
    if (!state.user.permissions.includes('shift.open')) throw new Error('You do not have permission to open a shift');
    $('#shift-opening-float').value = '0.00'; $('#shift-open-dialog').classList.remove('hidden'); $('#shift-opening-float').focus(); return;
  }
  if (!state.user.permissions.includes('shift.close')) throw new Error('A manager must close this shift');
  $('#shift-closing-float').value = state.user.permissions.includes('shift.report.view') ? Number(state.shift.expectedCash).toFixed(2) : '';
  $('#shift-manager-pin').value = '';
  $('#shift-stock-shortage-acknowledged').checked = false; syncShiftCloseAcknowledgement();
  $('#shift-close-dialog').classList.remove('hidden');
}

async function openShiftFromDialog() {
  if (state.shift) throw new Error('A shift is already open');
  if (!state.user.permissions.includes('shift.open')) throw new Error('You do not have permission to open a shift');
  const openingFloat = Number($('#shift-opening-float').value);
  if (!Number.isFinite(openingFloat) || openingFloat < 0 || openingFloat > 10000) throw new Error('Enter an opening cash float from RM0.00 to RM10,000.00');
  const location = selectedLocation();
  let managerId; let approvalToken; const anomalyConfirmed = Boolean($('#shift-opening-confirmed')?.checked);
  if (openingFloat > 1000) { if (!anomalyConfirmed) throw new Error('Opening floats above RM1,000.00 require confirmation and a manager PIN'); const manager = await request('/auth/pin', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, pin: $('#shift-opening-manager-pin').value }) }); if (!manager.user.permissions.includes('shift.report.view')) throw new Error('A manager PIN is required for this opening float'); managerId = manager.user.id; approvalToken = manager.sessionToken; }
  state.shift = await request('/shifts/open', { method: 'POST', approvalToken, body: JSON.stringify({ companyId: state.config.company.id, locationId: location.id, registerId: $('#register-select').value, cashierId: state.user.id, openingFloat, anomalyConfirmed, ...(managerId ? { managerId } : {}) }) }); state.verifiedShift = { ...state.shift };
  $('#shift-open-dialog').classList.add('hidden'); await loadCurrentShift(); showToast('Shift opened. Bukku and the local catalogue will sync automatically.');
}

async function addCashMovement() {
  if (!state.shift) throw new Error('Open a shift before recording cash movement');
  $('#cash-movement-form').reset();
  $('#cash-movement-type').value = 'CASH_IN';
  $('#cash-movement-anomaly').classList.add('hidden');
  $('#cash-movement-dialog').classList.remove('hidden');
  $('#cash-movement-amount').focus();
}

async function saveCashMovement() {
  if (!state.shift) throw new Error('Open a shift before recording cash movement');
  const amount = Number($('#cash-movement-amount').value);
  const reason = $('#cash-movement-reason').value.trim();
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) throw new Error('Enter a cash amount from RM0.01 to RM10,000.00');
  if (!reason) throw new Error('A reason is required');
  let managerId; let approvalToken;
  const anomalyConfirmed = amount > 1000;
  if (anomalyConfirmed) {
    if (!$('#cash-movement-confirmed').checked) throw new Error('Confirm the large cash movement before saving it.');
    const manager = await request('/auth/pin', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, pin: $('#cash-movement-manager-pin').value }) });
    if (!manager.user.permissions.includes('shift.report.view')) throw new Error('A manager PIN is required for this amount.');
    managerId = manager.user.id; approvalToken = manager.sessionToken;
  }
  await request(`/shifts/${state.shift.id}/movements`, { method: 'POST', approvalToken, body: JSON.stringify({ companyId: state.config.company.id, cashierId: state.user.id, type: $('#cash-movement-type').value, amount, reason, anomalyConfirmed, managerId }) });
  $('#cash-movement-dialog').classList.add('hidden');
  await loadCurrentShift();
  showToast('Cash movement saved.');
}

async function showShiftReport(shiftId = state.shift?.id, reportActorId = state.user.id, sessionToken = null) {
  if (!shiftId) return showShiftReportHistory();
  if (reportActorId === state.user.id && !state.user.permissions.includes('shift.report.view')) throw new Error('Manager access is required for shift reports');
  const report = await request(`/shifts/${shiftId}/report?companyId=${encodeURIComponent(state.config.company.id)}&actorId=${encodeURIComponent(reportActorId)}`, { sessionToken });
  const payments = `<li>CASH: ${money(Number(report.paymentTotals.CASH || 0))}</li><li>BANK TRANSFER: ${money(Number(report.paymentTotals.BANK_TRANSFER || 0))}</li>`;
  const returnTotal = report.returns.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const refunds = `<li>RETURNS: ${money(returnTotal)}</li>`;
  const stockFollowUp = report.stockShortages?.length ? `<section class="receipt-stock-warning"><h3>Negative stock / stock follow-up</h3><p>${report.stockShortages.length} sale line(s) require manager follow-up. This section is included in the printed report and daily Excel digest.</p><p><strong>${report.stockShortageAcknowledgement ? `Acknowledged by ${escapeHtml(report.stockShortageAcknowledgement.managerId)} at ${new Date(report.stockShortageAcknowledgement.acknowledgedAt).toLocaleString('en-MY')}` : 'Manager acknowledgement is required before this shift can close.'}</strong></p><ul>${report.stockShortages.map((item) => `<li><strong>${escapeHtml(item.productName)}</strong> (${escapeHtml(item.sku)}) — receipt ${escapeHtml(item.receiptNo)}, cashier ${escapeHtml(item.cashier)}, before ${Number(item.preSaleQuantity)}, sold ${Number(item.soldQuantity)}, after ${Number(item.postSaleQuantity)}, shortage introduced ${Number(item.shortageIntroduced)}</li>`).join('')}</ul></section>` : '';
  const digestStatus = report.dailyDigest ? `<section class="receipt-stock-warning"><h3>Daily Excel digest ready</h3><p>${escapeHtml(report.dailyDigest.exportFileName)} was saved on the PC. It includes the order, item, payment, return, and cash-movement detail. Bukku handoff is safely queued for financial mapping review.</p></section>` : report.shift.closedAt ? '<section class="receipt-stock-warning"><h3>Daily Excel digest</h3><p>Download this closed shift’s Excel digest. RetailOS will also save it on the PC.</p></section>' : '';
  $('#printable-receipt').style.setProperty('--receipt-width', '80mm');
  $('#printable-receipt').innerHTML = `<div class="receipt-head"><h3>Shift report</h3><p>${escapeHtml(report.shift.location)} · ${escapeHtml(report.shift.register)}</p><p>Cashier: ${escapeHtml(report.shift.cashier)}</p><p>Opened: ${new Date(report.shift.openedAt).toLocaleString('en-MY')}</p>${report.shift.closedAt ? `<p>Closed: ${new Date(report.shift.closedAt).toLocaleString('en-MY')}</p>` : ''}</div><div class="receipt-lines"><p>Sales ${report.summary.salesCount} · Gross ${money(report.summary.grossSales)}</p><p>Discounts ${money(report.summary.discountTotal)}</p><p>Cash sales ${money(report.summary.cashSales)} · Cash refunds ${money(report.summary.cashRefunds)}</p><p>Cash in ${money(report.summary.cashIn)} · Cash out ${money(report.summary.cashOut)}</p><p>Opening float ${money(report.summary.openingFloat)}</p></div><div class="receipt-summary"><div><span>Expected cash</span><strong>${money(report.summary.expectedCash)}</strong></div>${report.summary.variance !== undefined ? `<div><span>Variance</span><strong>${money(report.summary.variance)}</strong></div>` : ''}</div>${stockFollowUp}${digestStatus}<div class="receipt-payment"><h3>Payments</h3><ul>${payments}</ul><h3>Returns</h3><ul>${refunds}</ul></div><div class="receipt-actions">${report.shift.closedAt ? `<button type="button" data-download-shift-digest="${escapeHtml(report.shift.id)}">Download daily Excel</button>` : ''}<button type="button" class="quiet" data-print-shift-report="${escapeHtml(report.shift.id)}">Print shift report</button></div>`;
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
  const closeResult = await request(`/shifts/${shiftId}/close`, { method: 'POST', approvalToken: manager.sessionToken, body: JSON.stringify({ companyId: state.config.company.id, cashierId: state.user.id, managerId: manager.user.id, closingFloat, stockShortageAcknowledged: Boolean($('#shift-stock-shortage-acknowledged')?.checked) }) });
  $('#shift-close-dialog').classList.add('hidden'); await loadCurrentShift(); await showShiftReport(shiftId, manager.user.id, manager.sessionToken); showToast(closeResult.negativeStock?.length ? `Shift closed. ${closeResult.negativeStock.length} stock shortage${closeResult.negativeStock.length === 1 ? '' : 's'} need review. Download or print the report manually.` : 'Shift closed. Download or print the report manually.');
}

function formatStockQuantity(value) {
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function managementDesktopAvailable() { return window.matchMedia('(min-width: 1024px)').matches; }
function refreshManagementAvailability() {
  if (!state.user) return;
  const desktop = managementDesktopAvailable();
  const permissions = state.user.permissions;
  $('#shift-report').classList.toggle('hidden', !permissions.includes('shift.report.view'));
  $('#sync-now').classList.toggle('hidden', !permissions.includes('sync.run'));
  $('#nav-backoffice').classList.toggle('hidden', !desktop || !permissions.some((permission) => ['backoffice.view', 'company.manage', 'shift.report.view'].includes(permission)));
  $('#nav-products').classList.toggle('hidden', !desktop || !permissions.includes('catalog.manage'));
  $('#nav-contacts').classList.toggle('hidden', !desktop || !permissions.includes('contact.manage'));
  $('#nav-company').classList.toggle('hidden', !desktop || !permissions.some((permission) => ['company.manage', 'printer.manage'].includes(permission)));
  if (!desktop) { $('#backoffice-panel').classList.add('hidden'); $('#management-panel').classList.add('hidden'); }
}
function stockWarningForLine(line, requestedQuantity = line.quantity) {
  if (line.availableStock == null) return '';
  const factor = Number(line.uom.conversionFactor || 1);
  const before = Number(line.availableStock) / factor;
  const requested = Number(requestedQuantity);
  const after = before - requested;
  if (after >= 0) return '';
  if (before < 0) return t('stockWarningNegative', { balance: formatStockQuantity(before), requested: formatStockQuantity(requested), result: formatStockQuantity(after) });
  return t('stockWarning', { available: formatStockQuantity(before), requested: formatStockQuantity(requested), result: formatStockQuantity(after) });
}
function renderCart() {
  // A split tender belongs to the current sale only.  When its final line is
  // removed, do not leave an amount from the discarded sale on screen.
  if (!state.cart.length) {
    ['#split-cash', '#split-duitnow', '#split-bank-transfer'].forEach((selector) => { $(selector).value = '0.00'; });
  }
  $('#cart-count').textContent = String(state.cart.reduce((total, line) => total + Number(line.quantity || 0), 0));
  const target = $('#cart-lines');
  if (!state.cart.length) target.innerHTML = `<p class="muted">${escapeHtml(t('cartEmpty'))}</p>`;
  else target.innerHTML = state.cart.map((line, index) => {
    const discount = lineDiscount(line);
    const unitPicker = line.availableUoms?.length > 1 ? `<select data-uom-index="${index}" aria-label="Unit for ${escapeHtml(line.name)}">${line.availableUoms.map((choice, choiceIndex) => `<option value="${choiceIndex}" ${choice.uom.id === line.uom.id ? 'selected' : ''}>${escapeHtml(choice.uom.name)} · ${money(choice.unitPrice)}</option>`).join('')}</select>` : `<p>${escapeHtml(line.uom.name)} · ${money(line.unitPrice)}</p>`;
    const discountValue = line.discount ? `${line.discount.value}${line.discount.type === 'PERCENTAGE' ? '%' : ''}` : '';
    const cost = line.unitCost == null ? null : Number(line.unitCost);
    const belowCost = cost != null && Number.isFinite(cost) && line.unitPrice - (discount / line.quantity) < cost - 0.00001;
    const purchaseInfo = `${line.unitCost == null ? 'Cost: —' : `Cost: ${money(line.unitCost)}`} · ${line.supplierName ? `Supplier: ${escapeHtml(line.supplierName)}` : 'Supplier: —'} · ${line.lastPurchasedAt ? `Last bought: ${new Date(line.lastPurchasedAt).toLocaleDateString('en-MY')}` : 'Last bought: —'}`;
    const error = state.discountErrors[index] || '';
    const quantityValue = state.quantityDrafts[index] ?? String(line.quantity); const quantityError = state.quantityErrors[index] || ''; const quantityWarning = state.quantityWarnings[index] || '';
    const available = line.availableStock == null ? null : Number(line.availableStock) / Number(line.uom.conversionFactor || 1);
    const stockWarning = stockWarningForLine(line);
    const stockText = available == null ? t('stockNotTracked') : available < 0 ? `${t('inventoryBalance')}: ${formatStockQuantity(available)}` : `${t('available')}: ${formatStockQuantity(available)}`;
    return `<article class="cart-line"><div class="line-product"><strong>${escapeHtml(line.name)}</strong>${unitPicker}<p>${purchaseInfo} · ${stockText}${discount ? ` · ${t('discount')} ${money(discount)}` : ''}</p><div class="line-actions"><button data-action="minus" data-index="${index}">−</button><button data-action="plus" data-index="${index}">+</button><button data-action="remove" data-index="${index}">${escapeHtml(t('remove'))}</button></div></div><input data-quantity="${index}" type="number" min="1" step="1" value="${escapeHtml(quantityValue)}" aria-label="${escapeHtml(t('quantity'))}: ${escapeHtml(line.name)}" ${quantityError ? `aria-invalid="true" aria-describedby="quantity-error-${index}"` : ''} /><div class="line-total">${money(lineGross(line) - discount)}</div><small id="quantity-error-${index}" class="message" role="alert">${escapeHtml(quantityError)}</small><p id="stock-warning-${index}" class="receipt-stock-warning stock-warning${stockWarning ? '' : ' hidden'}" role="alert" aria-live="assertive">${escapeHtml(stockWarning)}</p><div class="line-discount"><input data-discount-value="${index}" value="${escapeHtml(discountValue)}" inputmode="decimal" placeholder="Discount: RM or 5%" aria-label="Discount amount for ${escapeHtml(line.name)}" ${error ? `aria-invalid="true" aria-describedby="discount-error-${index}"` : ''} /><small id="discount-error-${index}" class="message" role="alert">${escapeHtml(error)}</small>${belowCost ? '<small class="below-cost">Manager approved below cost</small>' : ''}</div></article>`;
  }).join('');
  const total = totals();
  $('#subtotal').textContent = money(total.subtotal); $('#discount-total').textContent = `− ${money(total.discount)}`; $('#grand-total').textContent = money(total.total);
  const totalLabels = $('#cart-panel').querySelectorAll('.totals span');
  [t('subtotal'), t('discount'), t('total')].forEach((label, index) => { if (totalLabels[index]) totalLabels[index].textContent = label; });
  const paymentLabel = $('#cart-panel .payment-entry');
  if (paymentLabel?.firstChild?.nodeType === Node.TEXT_NODE) paymentLabel.firstChild.nodeValue = t('paymentMethod');
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

async function search(epoch = state.searchEpoch, related = false) {
  const query = $('#lookup-query').value.trim();
  if (!query) { state.searchResults = []; $('#search-results').innerHTML = ''; return; }
  const location = selectedLocation(); const priceLevel = selectedPriceLevel();
  state.searchAbort?.abort();
  const controller = new AbortController(); state.searchAbort = controller;
  $('#search-results').innerHTML = '<p class="muted" role="status" aria-live="polite">Searching products…</p>';
  try {
    if (!navigator.onLine) throw new TypeError('Offline');
    const response = await request(`/products/lookup?companyId=${encodeURIComponent(state.config.company.id)}&query=${encodeURIComponent(query)}&priceLevelId=${encodeURIComponent(priceLevel.id)}&locationId=${encodeURIComponent(location.id)}&structured=true${related ? '&related=true' : ''}`, { signal: controller.signal });
    const products = Array.isArray(response) ? response : response.items;
    if (epoch !== state.searchEpoch || $('#lookup-query').value.trim() !== query) return;
    const addable = products.map((product) => {
      const availableUoms = product.uoms.map((uom) => { const price = product.prices.find((value) => value.uomId === uom.id); return price ? { uom, unitPrice: Number(price.amount) } : null; }).filter(Boolean);
      const first = availableUoms[0]; const stock = product.stockSnapshots[0] ? Number(product.stockSnapshots[0].quantity) : null;
      return !first ? null : { id: product.id, name: product.name, sku: product.sku, supplierDescription: product.supplierDescription, supplierName: product.supplierName, category: product.category, aliases: product.aliases || [], searchDimensions: product.searchDimensions || [], searchMaterials: product.searchMaterials || [], searchProductTypes: product.searchProductTypes || [], matchedAlias: product.matchedAlias || null, lastPurchasedAt: product.lastPurchasedAt, uom: first.uom, unitPrice: first.unitPrice, availableUoms, availableStock: stock, basePurchaseCost: product.basePurchaseCost == null ? null : Number(product.basePurchaseCost) };
    }).filter(Boolean);
    renderSearchResults(addable, related ? t('relatedResults') : '', Array.isArray(response) ? null : response);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    if (!isNetworkIssue(error) || !state.catalogue.length) throw error;
    if (epoch !== state.searchEpoch || $('#lookup-query').value.trim() !== query) return;
    const cached = searchCachedCatalogue(query, related);
    renderSearchResults(cached.items, 'Offline results from the last saved catalogue.', cached);
  } finally {
    if (state.searchAbort === controller) state.searchAbort = null;
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
  if (discount.error) { setDiscountError(index, discount.error); throw new Error(discount.error); }
  if (discount.empty || discount.value === 0) { delete line.discount; delete state.discountErrors[index]; renderCart(); return; }
  if (discount.type === 'FIXED' && discount.value > lineGross(line)) { const message = 'Fixed discount cannot exceed this line total.'; setDiscountError(index, message); throw new Error(message); }
  setDiscountError(index, '');
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
  let unitCost;
  if (product.fifoEnabledAt && countedQuantity > Number(product.stock)) { unitCost = Number(window.prompt('Approved unit cost for the positive FIFO adjustment (RM):')); if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('Enter a valid non-negative FIFO unit cost'); }
  const result = await request(`/products/${encodeURIComponent(product.id)}/stock-adjustment`, { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, locationId: selectedLocation().id, actorId: state.user.id, countedQuantity, reason: reason.trim(), ...(unitCost === undefined ? {} : { unitCost }) }) });
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

function canonicalReceiptHtml(document) {
  const header = document.header; const compact = Number(document.widthMm) <= 58;
  const legal = [header.brn ? `BRN: ${header.brn}${header.oldBrn ? ` (${header.oldBrn})` : ''}` : '', header.tin ? `TIN: ${header.tin}` : ''].filter(Boolean).join(' | ');
  const items = compact
    ? document.items.map((item) => `<div class="receipt-item-compact"><strong>${escapeHtml(item.description)}</strong>${item.sku ? `<small>SKU: ${escapeHtml(item.sku)}</small>` : ''}<div><span>${escapeHtml(item.quantity)} ${escapeHtml(item.uom)} × ${money(item.unitPrice)}</span><strong>${money(item.total)}</strong></div>${Number(item.discount) ? `<div class="receipt-discount"><span>Discount</span><strong>−${money(item.discount)}</strong></div>` : ''}</div>`).join('')
    : `<div class="receipt-item-table"><div class="receipt-item-heading"><span>Description</span><span>Qty</span><span>U/Price</span><span>Total</span></div>${document.items.map((item) => `<div class="receipt-item-row"><div><strong>${escapeHtml(item.description)}</strong>${item.sku ? `<small>SKU: ${escapeHtml(item.sku)}</small>` : ''}</div><span>${escapeHtml(item.quantity)}</span><span>${money(item.unitPrice)}</span><strong>${money(item.total)}</strong>${Number(item.discount) ? `<div class="receipt-discount"><span>Discount</span><strong>−${money(item.discount)}</strong></div>` : ''}</div>`).join('')}</div>`;
  const payments = document.payments.map((payment) => `<div><span>${escapeHtml(payment.method)}</span><strong>${money(payment.settled)}</strong></div>${payment.tendered !== undefined ? `<div><span>Cash received</span><strong>${money(payment.tendered)}</strong></div>` : ''}${payment.change !== undefined ? `<div><span>Change</span><strong>${money(payment.change)}</strong></div>` : ''}`).join('');
  return `<header class="receipt-head receipt-head-vertical">${document.showLogo ? '<img class="receipt-logo" src="/assets/taiping-hardware-logo.png" alt="Company logo" />' : ''}<strong class="status-badge">${escapeHtml(document.status.replaceAll('_',' / '))}</strong><h3>${escapeHtml(header.companyName)}</h3>${header.address ? `<p>${escapeHtml(header.address).replaceAll('\n','<br />')}</p>` : ''}${legal ? `<p>${escapeHtml(legal)}</p>` : ''}<div class="receipt-metadata"><p><span>Receipt</span><strong>${escapeHtml(header.receiptNo)}</strong></p><p><span>Date / time</span><strong>${escapeHtml(header.dateTime)}</strong></p><p><span>Cashier</span><strong>${escapeHtml(header.cashier)}</strong></p><p><span>Register / location</span><strong>${escapeHtml(header.registerLocation)}</strong></p></div></header><hr class="receipt-preview-divider ${escapeHtml(document.divider)}" />${items}<div class="receipt-summary"><div><span>Subtotal</span><strong>${money(document.totals.subtotal)}</strong></div><div><span>Discount</span><strong>− ${money(document.totals.discount)}</strong></div>${Number(document.totals.tax) ? `<div><span>Tax</span><strong>${money(document.totals.tax)}</strong></div>` : ''}<div class="receipt-grand"><span>Total</span><strong>${money(document.totals.total)}</strong></div></div><div class="receipt-payment"><strong>Payment</strong>${payments}</div>${document.eInvoice ? `<section class="einvoice-request"><img src="${escapeHtml(document.eInvoice.qrUrl)}" alt="QR code to request an e-Invoice" /><p>${escapeHtml(document.eInvoice.explanation)}</p></section>` : ''}<footer class="receipt-document-footer">${header.phone ? `<p>Tel: ${escapeHtml(header.phone)}</p>` : ''}${header.email ? `<p>Email: ${escapeHtml(header.email)}</p>` : ''}${document.policy ? `<p>${escapeHtml(document.policy)}</p>` : ''}${document.operatingHours ? `<p>${escapeHtml(document.operatingHours)}</p>` : ''}${document.footer ? `<p>${escapeHtml(document.footer)}</p>` : ''}</footer>`;
}

async function renderPrintableReceipt(sale, options = {}) {
  const allowReturns = Boolean(options.allowReturns) && sale.status === 'COMPLETED';
  const allowVoid = Boolean(options.allowVoid) && sale.status === 'COMPLETED';
  const allowShare = Boolean(options.allowShare);
  const target = $(options.target || '#printable-receipt');
  if (!sale.offline) {
    state.previewReceiptNo = sale.receiptNo;
    const document = await request(`/sales/receipt/${encodeURIComponent(sale.receiptNo)}/document?companyId=${encodeURIComponent(state.config.company.id)}`);
    target.style.setProperty('--receipt-width', `${document.widthMm}mm`);
    const sections = canonicalReceiptHtml(document);
    const actions = `<div class="receipt-actions"><button type="button" class="primary receipt-print" data-print-receipt="${escapeHtml(sale.receiptNo)}">Print receipt</button>${allowShare ? `<button type="button" class="quiet" data-share-receipt="${escapeHtml(sale.receiptNo)}">Share to WhatsApp</button>` : ''}${allowVoid ? `<button type="button" class="quiet" data-void-receipt="${escapeHtml(sale.receiptNo)}">Void</button>` : ''}${allowReturns ? `<button type="button" class="quiet" data-return-receipt="${escapeHtml(sale.receiptNo)}">Return / exchange</button>` : ''}</div>`;
    target.innerHTML = `${sections}${actions}`;
    return;
  }
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
  const einvoice = sale.offline || state.config?.company?.customerEInvoiceRequestsEnabled === false ? '' : sale.eInvoiceRequestToken ? `<section class="einvoice-request"><img src="/api/e-invoice/request/${encodeURIComponent(sale.eInvoiceRequestToken)}/qr" alt="QR code to request an e-Invoice" /><div><strong>Need an e-Invoice?</strong><p>Scan to submit your details. This receipt is not validated by LHDN. Cash Sales receipts without a request are consolidated later.</p></div></section>` : '<p class="einvoice-pending">This receipt is not validated by LHDN. Customer e-Invoice request QR is available for new receipts after the next update.</p>';
  target.innerHTML = `<div class="receipt-head"><img class="receipt-logo" src="/assets/taiping-hardware-logo.png" alt="Taiping Hardware Trading" /><h3>${escapeHtml(company.legalName || company.name)}</h3>${brn}${tin}${address}<p>Receipt No: <strong>${escapeHtml(sale.receiptNo)}</strong></p><p>${new Date(sale.completedAt).toLocaleString('en-MY')}</p></div>${offlineNote}<div class="receipt-lines">${sale.items.map((item) => `<div class="receipt-line"><div><strong>${escapeHtml(item.description)}</strong><p>${Number(item.quantity)} ${escapeHtml(item.uom.name)} × ${money(item.unitPrice)}${Number(item.lineDiscount) ? ` · Discount ${money(item.lineDiscount)}` : ''}</p></div><strong>${money(item.lineTotal)}</strong></div>`).join('')}</div><div class="receipt-summary"><div><span>Subtotal</span><strong>${money(sale.subtotal)}</strong></div><div><span>Discount</span><strong>− ${money(sale.discountTotal)}</strong></div><div class="receipt-grand"><span>Total</span><strong>${money(sale.grandTotal)}</strong></div></div><div class="receipt-payment"><strong>Payment</strong>${paymentLines}</div>${activities}${einvoice}<div class="receipt-actions"><button type="button" class="primary receipt-print" ${sale.offline ? 'data-print-offline="true"' : `data-print-receipt="${escapeHtml(sale.receiptNo)}"`}>Print receipt</button>${allowShare ? `<button type="button" class="quiet" data-share-receipt="${escapeHtml(sale.receiptNo)}">Share to WhatsApp</button>` : ''}${allowVoid ? `<button type="button" class="quiet" data-void-receipt="${escapeHtml(sale.receiptNo)}">Void</button>` : ''}${allowReturns ? `<button type="button" class="quiet" data-return-receipt="${escapeHtml(sale.receiptNo)}">Return / exchange</button>` : ''}</div>${contact}<p class="receipt-policy">Returns, refunds and exchanges are accepted only until the end of the next working day.</p><p class="receipt-hours">Operating hours: Mon–Sat, 8:30 AM–5:00 PM</p><p class="receipt-note">${escapeHtml(company.receiptFooter || 'Thank you for shopping with us!')}</p>`;
}

async function findReceipt() {
  const receiptNo = $('#receipt-lookup-no').value.trim();
  if (!receiptNo) throw new Error('Enter a receipt number');
  const sale = await request(`/sales/receipt/${encodeURIComponent(receiptNo)}?companyId=${encodeURIComponent(state.config.company.id)}`);
  await renderPrintableReceipt(sale, { allowReturns: true, allowVoid: true, allowShare: true, target: '#receipt-dialog-content' });
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
  $('#confirm-split').disabled = !split.exact || !canCheckout();
}

function syncPaymentMethod() {
  const method = $('#payment-method').value;
  const label = $('#payment-method').selectedOptions[0].textContent;
  const amountDue = Math.max(0, totals().total - Math.min(Number(state.exchangeCredit?.balance || 0), totals().total));
  const isDirectConfirmation = method === 'DUITNOW' || method === 'BANK_TRANSFER';
  const showCheckout = method !== 'SPLIT' && !isDirectConfirmation;
  $('#pay-cash').classList.toggle('hidden', !showCheckout);
  $('#pay-cash').hidden = !showCheckout;
  const checkoutAllowed = canCheckout();
  $('#pay-cash').disabled = Object.keys(state.discountErrors).length > 0 || !checkoutAllowed;
  $('#pay-cash').textContent = `${label} checkout`;
  $('#duitnow-payment').classList.toggle('hidden', method !== 'DUITNOW');
  $('#bank-transfer-payment').classList.toggle('hidden', method !== 'BANK_TRANSFER');
  if (method === 'DUITNOW') $('#duitnow-amount').textContent = money(amountDue);
  if (method === 'BANK_TRANSFER') $('#bank-transfer-amount').textContent = money(amountDue);
  ['#confirm-duitnow', '#confirm-bank-transfer', '#complete-cash-sale'].forEach((selector) => { const button = $(selector); if (button) button.disabled = !checkoutAllowed; });
  if (!checkoutAllowed && state.cart.length) $('#checkout-message').textContent = t('openShiftBeforeCheckout');
  renderSplitPayment();
}

function openCashPayment(amountDue) {
  // The mobile cart makes its siblings inert to provide modal isolation. Close
  // that drawer before opening the sibling cash dialog so the amount field and
  // Complete button remain focusable and clickable.
  if ($('#cart-panel').classList.contains('cart-open')) closeCartDrawer();
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
  if (!canCheckout()) throw new Error(t('openShiftBeforeCheckout'));
  if (Object.keys(state.discountErrors).length) throw new Error('Correct the invalid discount before checkout.');
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
  await renderPrintableReceipt(printable, { allowShare: true, target: '#receipt-dialog-content' }); $('#receipt-dialog').classList.remove('hidden'); showToast(`Sale completed. Receipt ${receipt.receiptNo} is ready to print or share.`);
}

function managerQuery() { return `companyId=${encodeURIComponent(state.config.company.id)}&actorId=${encodeURIComponent(state.user.id)}`; }
function hasPermission(permission) { return state.user.permissions.includes(permission); }
function showManagementTab(name) {
  const neededPermission = name === 'company' || name === 'staff' || name === 'bukku' || name === 'bukku-products' ? 'company.manage' : name === 'printer' ? 'printer.manage' : name === 'products' ? 'catalog.manage' : name === 'contacts' ? 'contact.manage' : null;
  if (neededPermission && !hasPermission(neededPermission)) throw new Error('You do not have access to this section');
  ['settings', 'company', 'printer', 'bukku', 'bukku-products', 'staff', 'products', 'contacts'].forEach((section) => $(`#management-${section}`).classList.toggle('hidden', section !== name));
  $('#show-company-settings').classList.toggle('hidden', !hasPermission('company.manage'));
  $('#show-printer-settings').classList.toggle('hidden', !hasPermission('printer.manage'));
  $('#show-bukku-daily-invoice-settings').classList.toggle('hidden', !hasPermission('company.manage'));
  $('#show-bukku-product-mapping').classList.toggle('hidden', !hasPermission('company.manage'));
  $('#show-staff-settings').classList.toggle('hidden', !hasPermission('company.manage'));
  $('#add-product-float').classList.toggle('hidden', name !== 'products' || !hasPermission('catalog.manage'));
  $('#add-contact-float').classList.toggle('hidden', name !== 'contacts' || !hasPermission('contact.manage'));
  const copy = { settings: ['Settings', 'Company, staff, Bukku and printer settings.'], company: ['Company details', 'Business details used on every receipt.'], printer: ['Printer settings', 'Receipt paper and footer message.'], bukku: ['Bukku daily invoice', 'One closed shift can post one Normal Bukku invoice after its mapping is enabled.'], 'bukku-products': ['Bukku product mapping', 'Approve each RetailOS SKU to one Bukku accounting item.'], staff: ['Staff accounts', 'Create real cashier and manager accounts, then retire demo accounts.'], products: ['Products', 'Search your product catalogue. Use + to add a new local product.'], contacts: ['Contacts', 'Search your customer and contact list. Use + to add a new local contact.'] };
  $('#management-title').textContent = copy[name][0]; $('#management-intro').textContent = copy[name][1];
}
async function loadCompanyProfile() {
  const profile = await request(`/management/company?${managerQuery()}`);
  $('#profile-name').value = profile.name || ''; $('#profile-legal-name').value = profile.legalName || ''; $('#profile-tin').value = profile.tin || ''; $('#profile-brn-new').value = profile.brnNew || profile.registrationNo || ''; $('#profile-brn-old').value = profile.brnOld || ''; $('#profile-office-phone').value = profile.officePhone || ''; $('#profile-phone').value = profile.phone || ''; $('#profile-email').value = profile.email || ''; $('#profile-address').value = profile.address || ''; $('#profile-einvoice-requests-enabled').checked = profile.customerEInvoiceRequestsEnabled !== false; $('#profile-receipt-footer').value = profile.receiptFooter || ''; $('#profile-paper-width').value = String(profile.receiptPaperWidthMm || 80);
  $('#printer-lan-host').value = profile.printerLanHost || ''; $('#printer-lan-port').value = String(profile.printerLanPort || 9100); $('#printer-windows-queue').value = profile.printerWindowsQueue || ''; $('#printer-serial-port').value = profile.printerSerialPort || ''; $('#printer-serial-baud-rate').value = String(profile.printerSerialBaudRate || 9600); $('#printer-profile-name').value = profile.printerProfileName || 'Main receipt printer'; $('#receipt-template').value = profile.receiptTemplate || 'STANDARD'; $('#receipt-divider-style').value = profile.receiptDividerStyle || 'DASHED'; $('#receipt-chinese-mode').value = profile.receiptChineseMode || 'AUTO'; $('#receipt-show-logo').checked = Boolean(profile.receiptShowLogo); $('#receipt-show-sku').checked = Boolean(profile.receiptShowSku);
  $('#bukku-daily-enabled').checked = Boolean(profile.bukkuDailyInvoiceEnabled);
  if (profile.printerConnectionMethod) state.config.company.printerConnectionMethod = profile.printerConnectionMethod;
  renderPrinterConnectionSettings();
  renderPrinterPreview();
  return profile;
}

async function loadBukkuDailyInvoiceSettings() {
  const profile = await loadCompanyProfile();
  const mappingOptions = await request(`/management/bukku/mapping-options?${managerQuery()}`);
  renderBukkuMappingOptions(mappingOptions, profile);
  const select = $('#bukku-preview-shift');
  try {
    const shifts = await request(`/shifts/history?companyId=${encodeURIComponent(state.config.company.id)}&actorId=${encodeURIComponent(state.user.id)}`);
    select.innerHTML = shifts.length ? `<option value="">Choose a closed shift</option>${shifts.map((shift) => `<option value="${escapeHtml(shift.id)}">${escapeHtml(shift.location)} · ${escapeHtml(shift.register)} · ${new Date(shift.closedAt).toLocaleString('en-MY')}</option>`).join('')}` : '<option value="">No closed shifts available</option>';
  } catch (error) { select.innerHTML = '<option value="">Closed-shift access is required for preview</option>'; }
  $('#bukku-daily-preview-result').innerHTML = '';
}

async function loadBukkuProductMappings() {
  const query = $('#bukku-product-mapping-query').value.trim();
  const data = await request(`/management/bukku/product-mappings?${managerQuery()}${query ? `&query=${encodeURIComponent(query)}` : ''}`);
  $('#bukku-product-mapping-list').innerHTML = data.items.length ? data.items.map((item) => `<article class="managed-item" data-bukku-mapping-product="${escapeHtml(item.productId)}"><strong>${escapeHtml(item.sku)} — ${escapeHtml(item.productName)}</strong><p><span class="tag">${escapeHtml(item.mappingStatus.replaceAll('_', ' '))}</span> · Bukku ID: ${escapeHtml(item.bukkuItemId || 'Not mapped')} · Code: ${escapeHtml(item.bukkuItemCode || 'Not recorded')} · Name: ${escapeHtml(item.bukkuDisplayName || 'Not recorded')}</p>${item.duplicateConflictWarning ? `<p class="message error" role="alert">${escapeHtml(item.duplicateConflictWarning)}</p>` : ''}<button type="button" class="quiet" data-review-bukku-mapping="${escapeHtml(item.productId)}" data-product-label="${escapeHtml(`${item.sku} — ${item.productName}`)}" data-item-id="${escapeHtml(item.bukkuItemId || '')}" data-item-code="${escapeHtml(item.bukkuItemCode || '')}" data-item-name="${escapeHtml(item.bukkuDisplayName || '')}">Review mapping</button><details><summary>Audit history (${item.auditHistory.length})</summary>${item.auditHistory.length ? `<ul>${item.auditHistory.map((audit) => `<li>${escapeHtml(audit.action.replaceAll('_', ' '))} · ${escapeHtml(audit.actor || 'System')} · ${new Date(audit.createdAt).toLocaleString('en-MY')}</li>`).join('')}</ul>` : '<p class="muted small">No manager approval recorded.</p>'}</details></article>`).join('') : '<p class="muted">No matching RetailOS products.</p>';
}

function renderBukkuMappingOptions(options, profile) {
  const defaults = { contactId: '35', locationId: '1', revenueAccountId: '20', paymentAccounts: { CASH: '2', CARD: '3', DUITNOW: '3', BANK_TRANSFER: '3', OTHER: '3' } };
  const accountLabel = (account) => `${account.code ? `${account.code} — ` : ''}${account.name}`;
  const setOptions = (selector, values, selected, blankLabel) => {
    const select = $(selector);
    const wanted = selected || '';
    const rendered = values.map((value) => `<option value="${escapeHtml(value.id)}">${escapeHtml(value.label)}</option>`).join('');
    select.innerHTML = `<option value="">${escapeHtml(blankLabel)}</option>${rendered}`;
    if (wanted && !values.some((value) => value.id === wanted)) select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(wanted)}">Saved Bukku ID ${escapeHtml(wanted)} (not returned)</option>`);
    select.value = wanted;
  };
  const accounts = (options.accounts || []).map((account) => ({ id: String(account.id), label: accountLabel(account) }));
  const incomeAccounts = (options.accounts || []).filter((account) => account.type === 'income').map((account) => ({ id: String(account.id), label: accountLabel(account) }));
  setOptions('#bukku-daily-contact-id', (options.contacts || []).map((contact) => ({ id: String(contact.id), label: `${contact.code ? `${contact.code} — ` : ''}${contact.name}` })), profile.bukkuDailyInvoiceContactId || defaults.contactId, 'Choose Bukku cash-sales contact');
  setOptions('#bukku-daily-location-id', (options.locations || []).map((location) => ({ id: String(location.id), label: `${location.code ? `${location.code} — ` : ''}${location.name}` })), profile.bukkuDailyInvoiceLocationId || defaults.locationId, 'No Bukku location');
  setOptions('#bukku-daily-revenue-account-id', incomeAccounts, profile.bukkuDailyInvoiceRevenueAccountId || defaults.revenueAccountId, 'Choose Bukku sales income account');
  const paymentAccounts = profile.bukkuDailyInvoicePaymentAccounts || {};
  [['#bukku-payment-cash', 'CASH'], ['#bukku-payment-card', 'CARD'], ['#bukku-payment-duitnow', 'DUITNOW'], ['#bukku-payment-bank-transfer', 'BANK_TRANSFER'], ['#bukku-payment-other', 'OTHER']].forEach(([selector, method]) => setOptions(selector, accounts, paymentAccounts[method] || defaults.paymentAccounts[method], 'Choose Bukku payment account'));
  setOptions('#bukku-payment-store-credit', accounts, paymentAccounts.STORE_CREDIT, 'Choose Bukku Accounts Receivable');
}

function renderBukkuDailyInvoicePreview(data) {
  const mapping = data.mapping;
  const mappingState = mapping.complete ? '<span class="tag">Mapping complete</span>' : `<span class="tag">Needs mapping: ${escapeHtml(mapping.missing.join(', '))}</span>`;
  const payments = data.invoice.paymentTotals.length ? data.invoice.paymentTotals.map((payment) => `<li>${escapeHtml(payment.method)}: ${money(payment.amount)} · Bukku account: ${escapeHtml(payment.bukkuAccountId || 'not set')}</li>`).join('') : '<li>No completed payments in this shift.</li>';
  const lines = data.invoice.lines.length ? data.invoice.lines.map((line) => `<tr><td>${escapeHtml(line.sku)}</td><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.uom)}</td><td>${line.quantity}</td><td>${money(line.total)}</td></tr>`).join('') : '<tr><td colspan="5">No completed item lines.</td></tr>';
  $('#bukku-daily-preview-result').innerHTML = `<article class="managed-item"><strong>Preview only — no Bukku invoice has been posted</strong><p>${escapeHtml(data.invoice.businessDate)} · ${escapeHtml(data.invoice.reference)}</p><p>${mappingState}</p><p>Sales: ${data.invoice.salesCount} · Total: ${money(data.invoice.total)} · Discount: ${money(data.invoice.discountTotal)} · Tax: ${money(data.invoice.taxTotal)}</p><p class="muted small">Idempotency key: ${escapeHtml(data.invoice.idempotencyKey)}</p><h4>Payments</h4><ul>${payments}</ul><h4>Consolidated items</h4><div class="table-wrap"><table><thead><tr><th>SKU</th><th>Item</th><th>UOM</th><th>Qty</th><th>Total</th></tr></thead><tbody>${lines}</tbody></table></div></article>`;
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
  $('#managed-product-list').innerHTML = products.length ? products.map((product) => `<button type="button" class="managed-item managed-product-row" data-managed-product-id="${escapeHtml(product.id)}"><strong>${escapeHtml(product.name)}</strong><p>${escapeHtml(product.sku)}${product.barcode ? ` · Barcode ${escapeHtml(product.barcode)}` : ''}${product.category ? ` · ${escapeHtml(product.category)}` : ''}${product.supplierDescription ? ` · ${escapeHtml(product.supplierDescription)}` : ''}</p><p><span class="tag">${product.source === 'BUKKU' ? 'Bukku-linked' : 'Local only'}</span><span class="tag">${escapeHtml(product.status || (product.active ? 'Active' : 'Deactivated'))}</span>${product.uoms.map((unit) => `${escapeHtml(unit.code)} ${unit.salePrice == null ? 'No retail price' : money(unit.salePrice)}`).join(' · ')}</p></button>`).join('') : '<p class="muted">No matching products.</p>';
}

function renderProductEditUoms(product) {
  $('#product-edit-uoms').innerHTML = product.uoms.map((unit) => `<section class="product-edit-uom" data-product-edit-uom="${escapeHtml(unit.id)}"><strong>${escapeHtml(unit.code)}${unit.conversionFactor === 1 ? ' · Base unit' : ''}</strong><label>Unit name<input data-edit-uom-name value="${escapeHtml(unit.name)}" maxlength="80" /></label><label>Conversion<input data-edit-uom-factor type="number" min="0.000001" step="0.000001" value="${unit.conversionFactor}" /></label><label>Sale price (RM)<input data-edit-uom-sale type="number" min="0" step="0.01" value="${unit.salePrice == null ? '' : unit.salePrice}" /></label><label>Purchase price (RM)<input data-edit-uom-purchase type="number" min="0" step="0.01" value="${unit.purchasePrice == null ? '' : unit.purchasePrice}" /></label></section>`).join('');
}
function renderProductAliases(product) {
  const aliases = product.aliases || [];
  $('#product-edit-aliases').innerHTML = aliases.length ? aliases.map((alias) => `<span class="product-alias-chip"><span>${escapeHtml(alias.text)}</span><small>${escapeHtml(alias.source.toLowerCase())}</small>${alias.source === 'GENERATED' ? '' : `<button type="button" class="quiet" data-delete-product-alias="${escapeHtml(alias.id)}" aria-label="Remove alias ${escapeHtml(alias.text)}">×</button>`}</span>`).join('') : '<span class="muted small">No manually maintained aliases.</span>';
}
async function openProductEdit(productId) {
  const product = await request(`/management/products/${encodeURIComponent(productId)}?${managerQuery()}`);
  state.editingProduct = product;
  $('#product-edit-name').value = product.name; $('#product-edit-sku').value = product.sku; $('#product-edit-barcode').value = product.barcode || ''; $('#product-edit-classification').value = product.classificationCode || ''; $('#product-edit-supplier').value = product.supplierDescription || ''; $('#product-edit-supplier-name').value = product.supplierName || ''; $('#product-edit-last-purchased').value = product.lastPurchasedAt ? String(product.lastPurchasedAt).slice(0, 10) : ''; $('#product-edit-category').value = product.category || ''; $('#product-edit-track-stock').checked = product.trackStock; $('#product-edit-active').checked = product.active;
  $('#product-edit-source').textContent = product.source === 'BUKKU' ? `Bukku-linked product (${product.externalId}). RetailOS keeps the change queued for Bukku until its product-write mapping is confirmed.` : 'Local RetailOS product.';
  let lifecycle = $('#product-lifecycle-controls'); if (!lifecycle) { lifecycle = document.createElement('section'); lifecycle.id = 'product-lifecycle-controls'; lifecycle.className = 'wide product-lifecycle-controls'; $('#product-edit-form').append(lifecycle); }
  lifecycle.innerHTML = `<h3>Status: ${escapeHtml(product.status)}</h3><p class="muted small">Deactivation is recommended. Delete first checks every sales, receipt, stock, Bukku, alias, batch, and audit reference.</p><div class="batch-downloads">${product.status === 'Active' ? '<button type="button" class="quiet" data-product-lifecycle="deactivate">Deactivate</button>' : '<button type="button" class="quiet" data-product-lifecycle="reactivate">Reactivate</button>'}<button type="button" class="danger" data-product-lifecycle="delete">Delete / archive…</button></div><div id="product-delete-impact" class="muted small"></div>`;
  renderProductAliases(product); renderProductEditUoms(product); $('#product-edit-panel').classList.remove('hidden');
}

async function changeProductLifecycle(action) {
  const product = state.editingProduct; if (!product) return;
  if (action === 'delete') {
    const impact = await request(`/management/products/${encodeURIComponent(product.id)}/delete-impact?${managerQuery()}`); const counts = Object.entries(impact.relatedRecords).filter(([, count]) => count).map(([name, count]) => `${name}: ${count}`).join(', ') || 'no historical references'; const mode = impact.hardDeleteAllowed ? 'permanently delete this unused product' : 'archive this historically used product while retaining all records'; $('#product-delete-impact').textContent = `Impact: ${counts}. RetailOS will ${mode}.`;
    if (!window.confirm(`${product.name} (${product.sku})\n\nImpact: ${counts}\n\nDeactivate is safer. Confirm that you want RetailOS to ${mode}.`)) return;
    await request(`/management/products/${encodeURIComponent(product.id)}`, { method: 'DELETE', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, confirmed: true, hardDelete: impact.hardDeleteAllowed }) }); $('#product-edit-panel').classList.add('hidden'); state.editingProduct = null; await loadManagedProducts(); showToast(impact.hardDeleteAllowed ? 'Unused product permanently deleted.' : 'Product archived with all history retained.'); return;
  }
  const verb = action === 'reactivate' ? 'reactivate' : 'deactivate'; if (!window.confirm(`${verb[0].toUpperCase() + verb.slice(1)} ${product.name} (${product.sku})?`)) return; await request(`/management/products/${encodeURIComponent(product.id)}/${verb}`, { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, confirmed: true }) }); await openProductEdit(product.id); await loadManagedProducts(); showToast(`Product ${verb}d.`);
}
async function addProductAlias() {
  const product = state.editingProduct; const text = $('#product-edit-alias').value.trim();
  if (!product || !text) throw new Error('Enter an alternative product name first');
  await request(`/management/products/${encodeURIComponent(product.id)}/aliases`, { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, text }) });
  $('#product-edit-alias').value = ''; await openProductEdit(product.id); showToast('Product search alias added.');
}
async function deleteProductAlias(aliasId) {
  const product = state.editingProduct; if (!product) return;
  await request(`/management/products/${encodeURIComponent(product.id)}/aliases/${encodeURIComponent(aliasId)}`, { method: 'DELETE', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id }) });
  await openProductEdit(product.id); showToast('Product search alias removed.');
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
async function loadManagedStaff() {
  const data = await request(`/management/staff?${managerQuery()}`);
  $('#managed-staff-role').innerHTML = data.roles.map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.name)}</option>`).join('');
  $('#managed-staff-list').innerHTML = data.users.length ? data.users.map((user) => `<article class="managed-item"><strong>${escapeHtml(user.name)}</strong><p>${escapeHtml(user.email)} · ${escapeHtml(user.role)} · <span class="tag">${user.active ? 'Active' : 'Inactive'}</span></p>${user.active && user.id !== state.user.id ? `<button type="button" class="quiet" data-disable-staff="${escapeHtml(user.id)}">Disable account</button>` : ''}</article>`).join('') : '<p class="muted">No staff accounts found.</p>';
}
async function openManagement(tab = 'products') {
  if (!managementDesktopAvailable()) throw new Error('Management functions are available on a PC only');
  if (tab !== 'settings' && !['company.manage', 'printer.manage', 'catalog.manage', 'contact.manage'].some((permission) => hasPermission(permission))) throw new Error('You do not have access to this section');
  $('#management-message').textContent = '';
  showManagementTab(tab);
  reveal($('#management-panel'));
  if (tab === 'company' || tab === 'printer') await loadCompanyProfile();
  if (tab === 'bukku') await loadBukkuDailyInvoiceSettings();
  if (tab === 'bukku-products') await loadBukkuProductMappings();
  if (tab === 'staff') await loadManagedStaff();
  if (tab === 'products') await loadManagedProducts();
  if (tab === 'contacts') await loadManagedContacts();
}

function backofficeQuery() {
  const query = new URLSearchParams({ companyId: state.config.company.id, actorId: state.user.id, range: state.backoffice.range });
  const locationId = $('#backoffice-location').value; const registerId = $('#backoffice-register').value;
  if (locationId) query.set('locationId', locationId); if (registerId) query.set('registerId', registerId);
  if (state.backoffice.range === 'CUSTOM') { query.set('from', $('#backoffice-from').value); query.set('to', $('#backoffice-to').value); }
  return query.toString();
}
function reportStatus(value) { const key = String(value || '').toLowerCase(); return `<span class="status-pill ${escapeHtml(key)}">${escapeHtml(String(value || '—').replaceAll('_', ' '))}</span>`; }
function emptyReport(message) { return `<p class="empty-report">${escapeHtml(message)}</p>`; }
function renderKpis(data) {
  const cards = [
    ['Net sales', money(data.netSales), `${data.transactions} transactions`], ['Transactions', data.transactions, 'Completed sales'], ['Average order', money(data.averageOrderValue), 'Net sales per receipt'], ['Units / order', Number(data.unitsPerOrder).toFixed(2), 'Items per transaction'], ['Gross profit', money(data.grossProfit), 'Before operating expenses'], ['COGS', money(data.cogs), 'Persisted FIFO batch cost'], ['Gross margin', `${Number(data.grossMarginPercent).toFixed(1)}%`, 'Gross profit / net sales'], ['Stock value', money(data.stockValue), 'Current FIFO batch value'], ['Sales COGS review', data.salesCogsReviewCount, 'Period-based affected receipts', 'sales-cogs-review'], ['Inventory exceptions', data.inventoryExceptionCount, 'All current negative or unvalued rows', 'inventory-exceptions'], ['Bukku sync', String(data.bukkuSyncStatus).replaceAll('_', ' '), 'Accounting queue status'],
  ];
  $('#backoffice-kpis').innerHTML = cards.map(([label, value, note, drilldown]) => drilldown ? `<button type="button" class="kpi-card kpi-drilldown" data-kpi-drilldown="${drilldown}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></button>` : `<article class="kpi-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`).join('');
}
function renderBars(points) {
  if (!points.length) return emptyReport('No completed sales in this period.');
  const maximum = Math.max(...points.map((point) => Number(point.sales)), 1);
  return points.map((point) => `<div class="bar-column" title="${escapeHtml(point.label)}: ${money(point.sales)}"><i style="height:${Math.max(2, Math.round(Number(point.sales) / maximum * 100))}%"></i><span>${escapeHtml(point.label)}</span></div>`).join('');
}
function renderPaymentMix(rows) {
  if (!rows.length) return emptyReport('No completed payments in this period.');
  const maximum = Math.max(...rows.map((row) => Math.abs(Number(row.amount))), 1);
  return rows.map((row) => `<div class="payment-row"><span>${escapeHtml(row.method.replaceAll('_', ' '))}</span><strong>${money(row.amount)}</strong><i><b style="width:${Math.max(1, Math.round(Math.abs(Number(row.amount)) / maximum * 100))}%"></b></i></div>`).join('');
}
function renderRanks(rows, valueKey, formatter) {
  if (!rows.length) return emptyReport('No product activity in this period.');
  const maximum = Math.max(...rows.map((row) => Math.abs(Number(row[valueKey]))), 1);
  return rows.map((row) => `<div class="rank-row"><span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.sku)}</small></span><strong>${formatter(row[valueKey])}</strong><i><b style="width:${Math.max(1, Math.round(Math.abs(Number(row[valueKey])) / maximum * 100))}%"></b></i></div>`).join('');
}
function renderInventoryTable(rows) {
  if (!rows.length) return emptyReport('No tracked inventory matches these filters.');
  return `<table><thead><tr><th>SKU</th><th>Product</th><th>Location</th><th class="number">Quantity</th><th class="number">Unit cost</th><th class="number">Stock value</th><th>Status</th><th>Costing</th><th>Last movement</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.sku)}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.location)}</td><td class="number">${Number(row.quantity).toFixed(4).replace(/\.0+$/,'')}</td><td class="number">${row.unitCost == null ? '—' : money(row.unitCost)}</td><td class="number">${row.stockValue == null ? '—' : money(row.stockValue)}</td><td>${reportStatus(row.reorderStatus)}</td><td>${reportStatus(row.costStatus)}</td><td>${row.lastMovementAt ? escapeHtml(new Date(row.lastMovementAt).toLocaleString('en-MY')) : '—'}</td><td><button type="button" class="quiet" data-ledger-product="${escapeHtml(row.productId)}" data-ledger-location="${escapeHtml(row.locationId || '')}">Stock ledger</button></td></tr>`).join('')}</tbody></table>`;
}
function renderBackofficeOverview(data) {
  const costing = data.costing; const banner = $('#backoffice-costing'); banner.className = `costing-banner ${costing.status.toLowerCase()}`; banner.innerHTML = `<strong>${costing.status === 'FINAL' ? 'Final COGS' : costing.status === 'PROVISIONAL' ? 'Provisional COGS — review required' : 'Unvalued Sale / COGS Review Required'}</strong><p>${escapeHtml(costing.note)} ${costing.provisionalSales} provisional sale(s), ${costing.unvaluedSales} unvalued sale(s).</p>`;
  renderKpis(data.kpis); $('#backoffice-sales-trend').innerHTML = renderBars(data.charts.salesTrend); $('#backoffice-payment-mix').innerHTML = renderPaymentMix(data.charts.paymentMethods); $('#backoffice-top-selling').innerHTML = renderRanks(data.charts.topSelling, 'quantity', (value) => Number(value).toFixed(2).replace(/\.00$/,'')); $('#backoffice-top-profit').innerHTML = renderRanks(data.charts.topGrossProfit, 'grossProfit', money); $('#backoffice-stock-exceptions').innerHTML = renderInventoryTable(data.charts.stockExceptions);
}
function table(headers, rows) {
  if (!rows.length) return emptyReport('No records match this period and filter.');
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
async function showBackofficeSection(section) {
  state.backoffice.section = section; document.querySelectorAll('[data-backoffice-section]').forEach((button) => button.classList.toggle('active', button.dataset.backofficeSection === section));
  $('#backoffice-overview').classList.toggle('hidden', section !== 'overview'); $('#backoffice-report').classList.toggle('hidden', section === 'overview' || section === 'batch'); $('#backoffice-batch').classList.toggle('hidden', section !== 'batch');
  if (section === 'overview') return;
  if (section === 'batch') { await loadPurchaseReceipts(); return; }
  const data = state.backoffice.data; let title = ''; let html = ''; let csvRows = [];
  if (section === 'sales') { title = 'Sales report'; const rows = data.reports.sales; html = table(['Receipt', 'Date / time', 'Location', 'Register', 'Cashier', 'Discount', 'Total', 'Payment'], rows.map((row) => [escapeHtml(row.receiptNo), escapeHtml(new Date(row.completedAt).toLocaleString('en-MY')), escapeHtml(row.location), escapeHtml(row.register), escapeHtml(row.cashier), money(row.discount), money(row.total), escapeHtml(row.paymentMethods.join(', '))])); csvRows = rows; }
  else if (section === 'products') { title = 'Product trend report'; const rows = data.reports.products; html = table(['SKU', 'Product', 'Quantity', 'Revenue', 'Discount', 'COGS', 'Gross profit', 'Margin', 'Costing'], rows.map((row) => [escapeHtml(row.sku), escapeHtml(row.name), String(Number(row.quantity).toFixed(4).replace(/\.0+$/,'')), money(row.revenue), money(row.discount), money(row.cogs), money(row.grossProfit), `${Number(row.marginPercent).toFixed(1)}%`, reportStatus(row.costStatus)])); csvRows = rows; }
  else if (section === 'inventory') { title = 'Inventory report'; const rows = data.reports.inventory; html = renderInventoryTable(rows); csvRows = rows; }
  else if (section === 'bukku') { title = 'Bukku reconciliation'; const rows = data.reports.bukku.entries; html = table(['Created', 'Entity', 'Action', 'Status', 'Attempts', 'Last error'], rows.map((row) => [escapeHtml(new Date(row.createdAt).toLocaleString('en-MY')), escapeHtml(row.entityType), escapeHtml(row.action), reportStatus(row.status), String(row.attempts), escapeHtml(row.lastError || '')])); csvRows = rows; }
  else { title = 'Stock adjustment report'; const rows = await request(`/backoffice/reports/adjustments?${backofficeQuery()}`); html = table(['Date / time', 'Product', 'Location', 'Quantity change', 'Cost impact', 'Costing', 'User', 'Reason', 'Approved'], rows.map((row) => [escapeHtml(new Date(row.createdAt).toLocaleString('en-MY')), escapeHtml([row.sku, row.product].filter(Boolean).join(' · ') || 'Legacy record'), escapeHtml(row.location || '—'), row.quantityDelta == null ? '—' : String(row.quantityDelta), row.costImpact == null ? 'Review required' : money(row.costImpact), reportStatus(row.costStatus), escapeHtml(row.user), escapeHtml(row.reason || ''), row.managerApproved ? 'Yes' : 'No'])); csvRows = rows; }
  $('#backoffice-report-title').textContent = title; $('#backoffice-report-table').innerHTML = html; state.backoffice.rows = csvRows;
}

async function showKpiDrilldown(kind) {
  const rows = state.backoffice.data?.drilldowns?.[kind === 'sales-cogs-review' ? 'salesCogsReview' : 'inventoryExceptions'] || [];
  $('#backoffice-overview').classList.add('hidden'); $('#backoffice-batch').classList.add('hidden'); $('#backoffice-report').classList.remove('hidden');
  $('#backoffice-report-title').textContent = kind === 'sales-cogs-review' ? 'Sales COGS review — affected rows' : 'Inventory exceptions — current affected rows';
  $('#backoffice-report-table').innerHTML = kind === 'sales-cogs-review'
    ? table(['Receipt', 'Date', 'SKU', 'Product', 'Quantity', 'COGS', 'Status', 'Reason'], rows.map((row) => [escapeHtml(row.receiptNo), escapeHtml(new Date(row.completedAt).toLocaleString('en-MY')), escapeHtml(row.sku), escapeHtml(row.product), String(row.quantity), row.cogs == null ? 'Unvalued' : money(row.cogs), reportStatus(row.costStatus), escapeHtml(row.reason)]))
    : renderInventoryTable(rows);
  state.backoffice.rows = rows;
}

async function showStockLedger(productId, locationId = '', sourceType = '') {
  const query = new URLSearchParams({ companyId: state.config.company.id, actorId: state.user.id, ...(locationId ? { locationId } : {}), ...(sourceType ? { sourceType } : {}) });
  const data = await request(`/backoffice/inventory/products/${encodeURIComponent(productId)}/ledger?${query}`); state.backoffice.ledger = data;
  $('#backoffice-overview').classList.add('hidden'); $('#backoffice-batch').classList.add('hidden'); $('#backoffice-report').classList.remove('hidden');
  const summary = data.summary; const date = (item) => item ? new Date(item.createdAt).toLocaleString('en-MY') : 'Never';
  $('#backoffice-report-title').textContent = `${data.product.sku} · ${data.product.name} · Stock Ledger`;
  $('#backoffice-report-table').innerHTML = `<div class="ledger-summary"><article><span>Current stock</span><strong>${Number(summary.currentStock).toFixed(4).replace(/\.0+$/,'')}</strong></article><article><span>Last Bukku purchase</span><strong>${escapeHtml(date(summary.lastBukkuPurchase))}</strong></article><article><span>Last staff adjustment</span><strong>${escapeHtml(date(summary.lastStaffAdjustment))}</strong></article><article><span>Last POS sale</span><strong>${escapeHtml(date(summary.lastPosSale))}</strong></article></div><label class="ledger-filter">Source<select id="ledger-source"><option value="">All sources</option>${['BUKKU_PURCHASE','STAFF_COUNT','STAFF_ADJUSTMENT','POS_SALE','RETURN','TRANSFER','OPENING_BALANCE'].map((source) => `<option value="${source}"${source === sourceType ? ' selected' : ''}>${source.replaceAll('_',' ')}</option>`).join('')}</select></label>${table(['Time', 'Source', 'Location', 'Before', 'Delta / counted', 'After', 'UOM', 'Unit cost', 'Valuation effect', 'User / approver', 'Reason', 'Linked document'], data.rows.map((row) => [escapeHtml(new Date(row.createdAt).toLocaleString('en-MY')), reportStatus(row.sourceType), escapeHtml(row.locationName), String(row.beforeQuantity), row.countedQuantity == null ? String(row.quantityDelta) : `${row.quantityDelta} / counted ${row.countedQuantity}`, String(row.afterQuantity), escapeHtml(row.uomName || data.product.baseUom || 'Base'), row.unitCost == null ? 'Unvalued' : money(row.unitCost), row.valuationEffect == null ? 'Unvalued' : money(row.valuationEffect), escapeHtml([row.actorName, row.approvedByName ? `approved by ${row.approvedByName}` : ''].filter(Boolean).join(' · ') || 'System'), escapeHtml(row.reason || ''), `<button type="button" class="quiet" data-ledger-link-type="${escapeHtml(row.linkedDocument.type)}" data-ledger-link-id="${escapeHtml(row.linkedDocument.id)}">${escapeHtml(row.linkedDocument.type)} · ${escapeHtml(row.linkedDocument.id.slice(0,12))}</button>`]))}`;
  $('#ledger-source').addEventListener('change', (event) => showStockLedger(productId, locationId, event.target.value).catch(showAlert)); state.backoffice.rows = data.rows;
}
function renderBackofficeFilters(data) {
  const location = $('#backoffice-location'); const selected = location.value; location.innerHTML = `<option value="">All locations</option>${data.filters.locations.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}`; location.value = selected;
  renderBackofficeRegisters(data); $('#backoffice-period-label').textContent = `${new Date(data.period.from).toLocaleDateString('en-MY')} – ${new Date(data.period.to).toLocaleDateString('en-MY')}`;
}
function renderBackofficeRegisters(data = state.backoffice.data) { const selectedLocation = $('#backoffice-location').value; const registers = selectedLocation ? data?.filters.locations.find((item) => item.id === selectedLocation)?.registers || [] : data?.filters.locations.flatMap((item) => item.registers) || []; const select = $('#backoffice-register'); const selected = select.value; select.innerHTML = `<option value="">All registers</option>${registers.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}`; if ([...select.options].some((option) => option.value === selected)) select.value = selected; }
async function loadBackoffice() {
  state.backoffice.abort?.abort(); state.backoffice.abort = new AbortController(); $('#backoffice-loading').classList.remove('hidden'); $('#backoffice-error').classList.add('hidden'); $('#backoffice-content').classList.add('hidden');
  try { const data = await request(`/backoffice/dashboard?${backofficeQuery()}`, { signal: state.backoffice.abort.signal }); state.backoffice.data = data; renderBackofficeFilters(data); renderBackofficeOverview(data); await showBackofficeSection(state.backoffice.section); $('#backoffice-content').classList.remove('hidden'); }
  catch (error) { if (error.name !== 'AbortError') { $('#backoffice-error').textContent = error.message; $('#backoffice-error').classList.remove('hidden'); } }
  finally { $('#backoffice-loading').classList.add('hidden'); }
}
async function openBackoffice() { if (!managementDesktopAvailable()) throw new Error('Back Office is available on a PC only'); if (!state.user.permissions.some((permission) => ['backoffice.view', 'company.manage', 'shift.report.view'].includes(permission))) throw new Error('Manager access is required for Back Office reports'); $('#receipt-panel').classList.add('hidden'); $('#management-panel').classList.add('hidden'); $('#backoffice-panel').classList.remove('hidden'); await loadBackoffice(); }
function closeBackoffice() { state.backoffice.abort?.abort(); $('#backoffice-panel').classList.add('hidden'); }
function exportBackofficeCsv() { const rows = state.backoffice.rows; if (!rows.length) throw new Error('There are no report rows to export'); const keys = Object.keys(rows[0]); const csv = [keys, ...rows.map((row) => keys.map((key) => row[key]))].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"','""')}"`).join(',')).join('\r\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })); link.download = `retailos-${state.backoffice.section}-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(link.href); }

async function downloadAuthenticated(path, fileName) {
  const response = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${state.sessionToken}` } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || 'Download failed'); }
  const link = document.createElement('a'); link.href = URL.createObjectURL(await response.blob()); link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
}
function batchActorQuery(extra = {}) { return new URLSearchParams({ companyId: state.config.company.id, actorId: state.user.id, ...extra }).toString(); }
async function fileBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(reader.error || new Error('Could not read the selected file')); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.readAsDataURL(file); }); }
function renderBatchReview(batch) {
  state.backoffice.batch = batch; const summary = batch.summary || {}; const rows = batch.rows || [];
  $('#batch-review').classList.remove('hidden'); $('#batch-review-summary').textContent = `${summary.validRows || 0} valid · ${summary.invalidRows || 0} invalid · ${summary.duplicateRows || 0} duplicate · quantity movement ${Number(summary.totalAbsQuantity || 0).toFixed(4)} · known value impact ${money(summary.knownValueImpact || 0)}`;
  $('#batch-risk').classList.toggle('hidden', !batch.highRisk); $('#batch-risk').innerHTML = batch.highRisk ? '<strong>High-risk approval required</strong><p>Large volume, value, row count, or unvalued cost requires a fresh manager PIN before commit.</p>' : '';
  $('#batch-manager-pin-label').classList.toggle('hidden', !batch.highRisk);
  $('#batch-review-table').innerHTML = table(['Row', 'SKU', 'Action', 'Current value', 'Proposed value', 'Validation', 'Error'], rows.map((row) => [String(row.rowNumber), escapeHtml(row.sku || '—'), escapeHtml(row.action || '—'), escapeHtml(row.currentValue == null ? '—' : String(row.currentValue)), escapeHtml(row.proposedValue == null ? '—' : String(row.proposedValue)), row.valid ? reportStatus('VALID') : reportStatus(row.duplicate ? 'DUPLICATE' : 'INVALID'), escapeHtml([...(row.warnings || []), ...(row.errors || [])].join('; ') || '—')]));
  $('#batch-confirm').checked = false; $('#batch-shortage-ack').checked = false; $('#batch-shortage-ack-row').classList.toggle('hidden', !batch.summary?.requiresStockShortageAcknowledgement); $('#batch-commit').disabled = true; $('#batch-message').textContent = batch.duplicateUpload ? 'This exact file was uploaded before. RetailOS reused its existing batch and will not apply it twice.' : 'Review complete. No data has been changed.'; $('#batch-message').classList.remove('hidden');
}
async function previewBatchFile() {
  const file = $('#batch-file').files[0]; if (!file) throw new Error('Choose a completed CSV template first');
  $('#batch-message').textContent = 'Validating every row…'; $('#batch-message').classList.remove('hidden');
  const batch = await request('/backoffice/batches/preview', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, fileName: file.name, mimeType: file.type || 'text/csv', contentBase64: await fileBase64(file) }) }); renderBatchReview(batch);
}
async function commitBatch() {
  const batch = state.backoffice.batch; if (!batch || !$('#batch-confirm').checked) throw new Error('Review and confirm the batch before commit');
  if (batch.summary?.requiresStockShortageAcknowledgement && !$('#batch-shortage-ack').checked) throw new Error('A manager must acknowledge the FIFO shortage before committing this batch');
  let approvalToken;
  if (batch.highRisk) { const pin = $('#batch-manager-pin').value; if (!pin) throw new Error('A fresh manager PIN is required for this high-risk batch'); const approval = await request('/auth/pin', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, pin }) }); approvalToken = approval.sessionToken; }
  $('#batch-commit').disabled = true; $('#batch-message').textContent = 'Committing the complete batch atomically…';
  const result = await request(`/backoffice/batches/${encodeURIComponent(batch.id)}/commit`, { method: 'POST', approvalToken, body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, managerId: state.user.id, confirmed: true, stockShortageAcknowledged: Boolean($('#batch-shortage-ack').checked) }) }); renderBatchReview(result); $('#batch-message').textContent = `Batch committed atomically. ${JSON.stringify(result.summary || {})}`; await loadBackoffice(); await loadPurchaseReceipts();
}

async function loadPurchaseReceipts() {
  const target = $('#purchase-receipt-list'); if (!target) return; target.innerHTML = '<p class="muted">Loading draft and posted FIFO batches…</p>';
  const receipts = await request(`/backoffice/purchase-receipts?${managerQuery()}`);
  target.innerHTML = receipts.length ? receipts.map((receipt) => `<article class="managed-item purchase-receipt" data-purchase-receipt-id="${escapeHtml(receipt.id)}"><strong>${escapeHtml(receipt.bukkuReference)} · ${escapeHtml(receipt.supplier)}</strong><p>${escapeHtml(receipt.location.name)} · Bill ${new Date(receipt.purchaseDate).toLocaleDateString('en-MY')} · <span class="tag">${escapeHtml(receipt.status)}</span></p>${receipt.batches.map((batch) => `<p><strong>${escapeHtml(batch.displayBatchId)}</strong> · ${escapeHtml(batch.sku)} ${escapeHtml(batch.productName)} · received ${batch.receivedQuantity} ${escapeHtml(batch.unit)} · remaining ${batch.remainingQuantity} · ${money(batch.finalUnitCost)} / unit · value ${money(batch.totalBatchValue)}</p>`).join('')}${receipt.status === 'DRAFT' ? `<label class="check"><input data-negative-stock-ack type="checkbox" ${receipt.hasNegativeStock ? '' : 'disabled checked'} />${receipt.hasNegativeStock ? 'I acknowledge current negative stock. Posting does not settle or recost shortages.' : 'No negative-stock acknowledgement required.'}</label><button type="button" class="primary" data-post-purchase-receipt>Approve and post inventory</button>` : `<p>Approved by ${escapeHtml(receipt.approvedBy?.name || 'Manager')} · ${receipt.postedAt ? new Date(receipt.postedAt).toLocaleString('en-MY') : ''}</p>`}</article>`).join('') : '<p class="muted">No purchase receipt drafts yet.</p>';
}

async function postPurchaseReceipt(card) {
  const id = card.dataset.purchaseReceiptId; const acknowledged = Boolean(card.querySelector('[data-negative-stock-ack]')?.checked);
  if (!window.confirm('Post this reviewed FIFO inventory receipt? This changes stock and cannot be silently undone.')) return;
  await request(`/backoffice/purchase-receipts/${encodeURIComponent(id)}/post`, { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, managerId: state.user.id, confirmed: true, negativeStockAcknowledged: acknowledged }) }); await loadPurchaseReceipts(); showToast('FIFO inventory receipt posted.');
}

$('#sign-in').addEventListener('click', async () => { try { $('#login-message').textContent = ''; const code = $('#company-code').value.trim(); state.config = await request(`/pos/bootstrap?companyCode=${encodeURIComponent(code)}`); const login = await request('/auth/pin', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, pin: $('#cashier-pin').value }) }); state.user = login.user; state.sessionToken = login.sessionToken; $('#login-view').classList.add('hidden'); $('#pos-view').classList.remove('hidden'); renderConfig(); const recovered = restoreCart(); renderCart(); if (recovered) $('#checkout-message').textContent = 'Recovered your saved cart. Prices and stock will be checked again at checkout.'; await loadCurrentShift(); saveOfflineSession(); savePersistentSession(); await loadOfflineCatalogue(); await refreshOfflineStatus(); void cacheCatalogue().catch(() => undefined); void replayOfflineSales(); } catch (error) { $('#login-message').textContent = error.message; } });
$('#sign-out').addEventListener('click', () => { clearPersistentSession(); window.location.reload(); });
window.addEventListener('resize', refreshManagementAvailability);
$('#language-select').addEventListener('change', () => { state.language = $('#language-select').value; localStorage.setItem('retailos-language', state.language); applyLanguage(); renderCart(); renderRecentItems(); });
$('#nav-dashboard').addEventListener('click', () => { closeItemSearch(); $('#backoffice-panel').classList.add('hidden'); $('#receipt-panel').classList.add('hidden'); $('#management-panel').classList.add('hidden'); $('#cart-panel').classList.remove('cart-open'); window.scrollTo({ top: 0, behavior: 'smooth' }); $('#lookup-query').focus(); });
$('#nav-backoffice').addEventListener('click', () => openBackoffice().catch(showAlert));
$('#close-backoffice').addEventListener('click', closeBackoffice);
$('#refresh-backoffice').addEventListener('click', () => loadBackoffice().catch(showAlert));
document.querySelectorAll('[data-backoffice-section]').forEach((button) => button.addEventListener('click', () => showBackofficeSection(button.dataset.backofficeSection).catch(showAlert)));
document.querySelectorAll('[data-range]').forEach((button) => button.addEventListener('click', () => { state.backoffice.range = button.dataset.range; document.querySelectorAll('[data-range]').forEach((item) => item.classList.toggle('active', item === button)); $('#backoffice-custom-range').classList.toggle('hidden', state.backoffice.range !== 'CUSTOM'); if (state.backoffice.range === 'CUSTOM') { const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }); if (!$('#backoffice-from').value) $('#backoffice-from').value = today; if (!$('#backoffice-to').value) $('#backoffice-to').value = today; } else loadBackoffice().catch(showAlert); }));
$('#apply-backoffice-range').addEventListener('click', () => loadBackoffice().catch(showAlert));
$('#backoffice-location').addEventListener('change', () => { renderBackofficeRegisters(); loadBackoffice().catch(showAlert); });
$('#backoffice-register').addEventListener('change', () => loadBackoffice().catch(showAlert));
$('#backoffice-export').addEventListener('click', () => { try { exportBackofficeCsv(); } catch (error) { showAlert(error); } });
$('#backoffice-kpis').addEventListener('click', (event) => { const button = event.target.closest('[data-kpi-drilldown]'); if (button) showKpiDrilldown(button.dataset.kpiDrilldown).catch(showAlert); });
$('#backoffice-report-table').addEventListener('click', (event) => {
  const ledger = event.target.closest('[data-ledger-product]'); if (ledger) { showStockLedger(ledger.dataset.ledgerProduct, ledger.dataset.ledgerLocation).catch(showAlert); return; }
  const link = event.target.closest('[data-ledger-link-type]'); if (!link) return;
  const row = state.backoffice.ledger?.rows?.find((entry) => entry.linkedDocument?.id === link.dataset.ledgerLinkId);
  if (row?.linkedDocument?.receiptNo) { $('#backoffice-panel').classList.add('hidden'); showReceipt(row.linkedDocument.receiptNo).catch(showAlert); } else showToast(`${link.dataset.ledgerLinkType} ${link.dataset.ledgerLinkId}`);
});
$('#batch-template-csv').addEventListener('click', () => downloadAuthenticated(`/backoffice/batches/template?${batchActorQuery()}`, 'retailos-product-batch-template.csv').catch(showAlert));
$('#batch-preview').addEventListener('click', () => previewBatchFile().catch(showAlert));
function updateBatchCommitAvailability() { const batch = state.backoffice.batch; const shortageBlocked = Boolean(batch?.summary?.requiresStockShortageAcknowledgement) && !$('#batch-shortage-ack').checked; $('#batch-commit').disabled = !batch || !$('#batch-confirm').checked || shortageBlocked || batch.status === 'COMMITTED' || Number(batch.invalidRowCount) > 0 || Number(batch.duplicateRowCount) > 0; }
$('#batch-confirm').addEventListener('change', updateBatchCommitAvailability);
$('#batch-shortage-ack').addEventListener('change', updateBatchCommitAvailability);
$('#batch-commit').addEventListener('click', () => commitBatch().catch(showAlert));
$('#batch-errors-csv').addEventListener('click', () => { const batch = state.backoffice.batch; if (!batch) return; downloadAuthenticated(`/backoffice/batches/${encodeURIComponent(batch.id)}/result?${batchActorQuery({ errorsOnly: 'true' })}`, `retailos-batch-${batch.id}-errors.csv`).catch(showAlert); });
$('#batch-results-csv').addEventListener('click', () => { const batch = state.backoffice.batch; if (!batch) return; downloadAuthenticated(`/backoffice/batches/${encodeURIComponent(batch.id)}/result?${batchActorQuery()}`, `retailos-batch-${batch.id}-results.csv`).catch(showAlert); });
$('#refresh-purchase-receipts').addEventListener('click', () => loadPurchaseReceipts().catch(showAlert));
$('#purchase-receipt-list').addEventListener('click', (event) => { const button = event.target.closest('[data-post-purchase-receipt]'); if (!button) return; postPurchaseReceipt(button.closest('[data-purchase-receipt-id]')).catch(showAlert); });
$('#backoffice-product-management').addEventListener('click', () => { closeBackoffice(); openManagement('products').catch(showAlert); });
$('#nav-receipts').addEventListener('click', async () => { try { closeItemSearch(); $('#management-panel').classList.add('hidden'); $('#cart-panel').classList.remove('cart-open'); reveal($('#receipt-panel')); await loadReceiptHistory(); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } });
$('#nav-products').addEventListener('click', async () => { try { closeItemSearch(); $('#receipt-panel').classList.add('hidden'); $('#cart-panel').classList.remove('cart-open'); await openManagement('products'); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } });
$('#nav-contacts').addEventListener('click', async () => { try { closeItemSearch(); $('#receipt-panel').classList.add('hidden'); $('#cart-panel').classList.remove('cart-open'); await openManagement('contacts'); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } });
$('#nav-company').addEventListener('click', async () => { try { closeItemSearch(); await openManagement('settings'); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } });
$('#hide-receipt').addEventListener('click', () => $('#receipt-panel').classList.add('hidden'));
$('#hide-receipt-dialog').addEventListener('click', () => $('#receipt-dialog').classList.add('hidden'));
function setCartBackgroundInert(inert) { [...$('#pos-view').children].filter((element) => element.id !== 'cart-panel').forEach((element) => { element.inert = inert; }); }
function openCartDrawer() { state.cartOpener = document.activeElement; closeItemSearch(); const cart = $('#cart-panel'); cart.classList.add('cart-open'); cart.setAttribute('aria-hidden', 'false'); setCartBackgroundInert(true); $('#hide-cart').focus(); }
function closeCartDrawer() { const cart = $('#cart-panel'); cart.classList.remove('cart-open'); cart.setAttribute('aria-hidden', 'true'); setCartBackgroundInert(false); if (state.cartOpener instanceof HTMLElement) state.cartOpener.focus(); }
$('#open-cart').addEventListener('click', openCartDrawer);
$('#hide-cart').addEventListener('click', closeCartDrawer);
document.addEventListener('keydown', (event) => { if (!$('#cart-panel').classList.contains('cart-open')) return; if (event.key === 'Escape') { event.preventDefault(); closeCartDrawer(); return; } if (event.key !== 'Tab') return; const focusable = [...$('#cart-panel').querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]')].filter((element) => !element.hidden); if (!focusable.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } });
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
$('#show-bukku-daily-invoice-settings').addEventListener('click', () => openManagement('bukku').catch(showAlert));
$('#show-bukku-product-mapping').addEventListener('click', () => openManagement('bukku-products').catch(showAlert));
$('#show-staff-settings').addEventListener('click', () => openManagement('staff').catch(showAlert));
$('#printer-connection-method').addEventListener('change', () => {
  state.config.company.printerConnectionMethod = $('#printer-connection-method').value;
  renderPrinterConnectionSettings();
});
['#profile-paper-width', '#receipt-template', '#receipt-divider-style', '#receipt-chinese-mode', '#receipt-show-logo', '#receipt-show-sku', '#profile-receipt-footer'].forEach((selector) => $(selector).addEventListener('input', renderPrinterPreview));
$('#company-profile-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const profile = await request('/management/company', { method: 'PUT', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, name: $('#profile-name').value, legalName: $('#profile-legal-name').value, tin: $('#profile-tin').value, brnNew: $('#profile-brn-new').value, brnOld: $('#profile-brn-old').value, officePhone: $('#profile-office-phone').value, phone: $('#profile-phone').value, email: $('#profile-email').value, address: $('#profile-address').value, customerEInvoiceRequestsEnabled: $('#profile-einvoice-requests-enabled').checked }) }); state.config.company.name = profile.name; state.config.company.customerEInvoiceRequestsEnabled = profile.customerEInvoiceRequestsEnabled; $('#company-name').textContent = profile.name; $('#management-panel').classList.add('hidden'); showToast('Company details saved.'); } catch (error) { $('#management-message').textContent = error.message; } });
$('#printer-settings-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const printerConnectionMethod = $('#printer-connection-method').value; const connection = printerConnectionMethod === 'LAN_ESC_POS' ? { printerLanHost: $('#printer-lan-host').value.trim(), printerLanPort: Number($('#printer-lan-port').value) } : printerConnectionMethod === 'WINDOWS_RAW' ? { printerWindowsQueue: $('#printer-windows-queue').value.trim() } : { printerSerialPort: $('#printer-serial-port').value.trim().toUpperCase(), printerSerialBaudRate: Number($('#printer-serial-baud-rate').value) }; const profile = await request('/management/company', { method: 'PUT', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, receiptFooter: $('#profile-receipt-footer').value, receiptPaperWidthMm: Number($('#profile-paper-width').value), printerConnectionMethod, printerProfileName: $('#printer-profile-name').value.trim(), receiptTemplate: $('#receipt-template').value, receiptDividerStyle: $('#receipt-divider-style').value, receiptChineseMode: $('#receipt-chinese-mode').value, receiptShowLogo: $('#receipt-show-logo').checked, receiptShowSku: $('#receipt-show-sku').checked, ...connection }) }); state.config.company.printerConnectionMethod = profile.printerConnectionMethod; $('#management-panel').classList.add('hidden'); showToast('PC printer settings saved.'); } catch (error) { $('#management-message').textContent = error.message; } });
$('#bukku-daily-invoice-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const paymentAccounts = { CASH: $('#bukku-payment-cash').value.trim(), CARD: $('#bukku-payment-card').value.trim(), DUITNOW: $('#bukku-payment-duitnow').value.trim(), BANK_TRANSFER: $('#bukku-payment-bank-transfer').value.trim(), STORE_CREDIT: $('#bukku-payment-store-credit').value.trim(), OTHER: $('#bukku-payment-other').value.trim() }; Object.keys(paymentAccounts).forEach((method) => { if (!paymentAccounts[method]) delete paymentAccounts[method]; }); await request('/management/company', { method: 'PUT', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, bukkuDailyInvoiceEnabled: $('#bukku-daily-enabled').checked, bukkuDailyInvoiceContactId: $('#bukku-daily-contact-id').value, bukkuDailyInvoiceLocationId: $('#bukku-daily-location-id').value, bukkuDailyInvoiceRevenueAccountId: $('#bukku-daily-revenue-account-id').value, bukkuDailyInvoiceTaxCodeId: '', bukkuDailyInvoicePaymentAccounts: paymentAccounts }) }); const notice = $('#bukku-daily-enabled').checked ? 'Bukku posting is enabled. New closed shifts post one Normal invoice.' : 'Bukku posting mapping saved, but posting remains disabled.'; $('#management-message').textContent = notice; showToast(notice); } catch (error) { $('#management-message').textContent = error.message; showAlert(error); } });
$('#bukku-daily-preview-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const shiftId = $('#bukku-preview-shift').value; if (!shiftId) throw new Error('Choose a closed shift first'); const data = await request(`/management/bukku/daily-invoice-preview?${managerQuery()}&shiftId=${encodeURIComponent(shiftId)}`); renderBukkuDailyInvoicePreview(data); $('#management-message').textContent = data.mapping.complete ? 'Preview is ready. It has not been sent to Bukku.' : 'Preview is ready, but mapping is incomplete. Nothing has been sent to Bukku.'; } catch (error) { $('#management-message').textContent = error.message; showAlert(error); } });
$('#bukku-product-mapping-search').addEventListener('submit', async (event) => { event.preventDefault(); try { await loadBukkuProductMappings(); } catch (error) { $('#management-message').textContent = error.message; showAlert(error); } });
$('#bukku-product-mapping-query').addEventListener('input', () => { clearTimeout(state.managementSearchTimer); state.managementSearchTimer = setTimeout(() => loadBukkuProductMappings().catch(showAlert), 220); });
$('#bukku-product-mapping-list').addEventListener('click', (event) => { const button = event.target.closest('[data-review-bukku-mapping]'); if (!button) return; $('#bukku-mapping-product-id').value = button.dataset.reviewBukkuMapping; $('#bukku-mapping-product-label').value = button.dataset.productLabel; $('#bukku-mapping-item-id').value = button.dataset.itemId; $('#bukku-mapping-item-code').value = button.dataset.itemCode; $('#bukku-mapping-item-name').value = button.dataset.itemName; $('#bukku-mapping-confirmed').checked = false; $('#bukku-mapping-item-id').focus(); });
$('#bukku-product-mapping-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const productId = $('#bukku-mapping-product-id').value; if (!productId) throw new Error('Choose a RetailOS product from the mapping list first'); const result = await request('/management/bukku/product-mappings', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, productId, bukkuItemId: $('#bukku-mapping-item-id').value, bukkuItemCode: $('#bukku-mapping-item-code').value, bukkuDisplayName: $('#bukku-mapping-item-name').value, confirmed: $('#bukku-mapping-confirmed').checked }) }); $('#management-message').textContent = `${result.retailosSku} is mapped to Bukku item ${result.bukkuItemCode}.`; await loadBukkuProductMappings(); showToast('Bukku product mapping approved.'); } catch (error) { $('#management-message').textContent = error.message; showAlert(error); } });
$('#test-pc-printer').addEventListener('click', async () => { try { const result = await request('/sales/printer/test', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id }) }); showToast(`Test receipt sent through ${result.transport}.`); } catch (error) { $('#management-message').textContent = error.message; showAlert(error); } });
$('#test-printer-connection').addEventListener('click', async () => { try { const health = await request(`/sales/printer/health?companyId=${encodeURIComponent(state.config.company.id)}&actorId=${encodeURIComponent(state.user.id)}`); const target = $('#printer-health'); target.classList.remove('hidden'); target.textContent = health.reachable ? `Connection healthy: ${health.endpoint}. Last successful print: ${health.lastSuccessfulPrint ? new Date(health.lastSuccessfulPrint).toLocaleString('en-MY') : 'none recorded'}.` : `Printer unreachable: ${health.lastError || 'unknown error'}`; target.classList.toggle('error', !health.reachable); } catch (error) { $('#management-message').textContent = error.message; showAlert(error); } });
$('#managed-product-search').addEventListener('submit', async (event) => { event.preventDefault(); try { await loadManagedProducts(); } catch (error) { $('#management-message').textContent = error.message; } });
$('#managed-contact-search').addEventListener('submit', async (event) => { event.preventDefault(); try { await loadManagedContacts(); } catch (error) { $('#management-message').textContent = error.message; } });
$('#managed-product-query').addEventListener('input', () => { clearTimeout(state.managementSearchTimer); state.managementSearchTimer = setTimeout(() => loadManagedProducts().catch(showAlert), 220); });
$('#managed-contact-query').addEventListener('input', () => { clearTimeout(state.managementSearchTimer); state.managementSearchTimer = setTimeout(() => loadManagedContacts().catch(showAlert), 220); });
$('#managed-staff-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const result = await request('/management/staff', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, name: $('#managed-staff-name').value, email: $('#managed-staff-email').value, roleId: $('#managed-staff-role').value, pin: $('#managed-staff-pin').value }) }); $('#managed-staff-form').reset(); $('#management-message').textContent = `${result.name} can now sign in.`; await loadManagedStaff(); showToast(`${result.name}'s staff account was created.`); } catch (error) { $('#management-message').textContent = error.message; showAlert(error); } });
$('#managed-staff-list').addEventListener('click', async (event) => { const button = event.target.closest('[data-disable-staff]'); if (!button) return; if (!window.confirm('Disable this staff account? They will no longer be able to sign in.')) return; try { await request(`/management/staff/${encodeURIComponent(button.dataset.disableStaff)}`, { method: 'PUT', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, active: false }) }); await loadManagedStaff(); showToast('Staff account disabled.'); } catch (error) { $('#management-message').textContent = error.message; showAlert(error); } });
$('#managed-product-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const quantityText = $('#managed-product-quantity').value; const purchaseText = $('#managed-product-purchase-price').value; const result = await request('/management/products', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id, name: $('#managed-product-name').value, sku: $('#managed-product-sku').value, barcode: $('#managed-product-barcode').value || undefined, classificationCode: $('#managed-product-classification').value, supplierDescription: $('#managed-product-supplier').value || undefined, category: $('#managed-product-category').value || undefined, trackStock: $('#managed-product-track-stock').checked, locationId: selectedLocation().id, ...(quantityText !== '' ? { initialQuantity: Number(quantityText) } : {}), uoms: [{ code: 'EA', name: $('#managed-product-uom-name').value, conversionFactor: 1, salePrice: Number($('#managed-product-sale-price').value), ...(purchaseText !== '' ? { purchasePrice: Number(purchaseText) } : {}) }] }) }); $('#managed-product-form').reset(); $('#managed-product-classification').value = '022'; $('#managed-product-uom-name').value = 'Each'; $('#managed-product-track-stock').checked = true; $('#product-create-panel').classList.add('hidden'); $('#management-message').textContent = `${result.name} created as a local product.`; await loadManagedProducts(); showToast(`${result.name} was created.`); } catch (error) { $('#management-message').textContent = error.message; showAlert(error); } });
$('#managed-product-list').addEventListener('click', async (event) => { const row = event.target.closest('[data-managed-product-id]'); if (!row) return; try { await openProductEdit(row.dataset.managedProductId); } catch (error) { showAlert(error); } });
$('#product-edit-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await saveProductEdit(); } catch (error) { showAlert(error); } });
$('#product-edit-form').addEventListener('click', (event) => { const button = event.target.closest('[data-product-lifecycle]'); if (!button) return; changeProductLifecycle(button.dataset.productLifecycle).catch(showAlert); });
$('#add-product-alias').addEventListener('click', () => addProductAlias().catch(showAlert));
$('#product-edit-alias').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addProductAlias().catch(showAlert); } });
$('#product-edit-aliases').addEventListener('click', (event) => { const button = event.target.closest('[data-delete-product-alias]'); if (button) deleteProductAlias(button.dataset.deleteProductAlias).catch(showAlert); });
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
async function downloadShiftDigest(shiftId) { const response = await fetch(`/api/shifts/${encodeURIComponent(shiftId)}/daily-digest.xlsx?companyId=${encodeURIComponent(state.config.company.id)}&actorId=${encodeURIComponent(state.user.id)}`, { headers: { Authorization: `Bearer ${state.sessionToken}` } }); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || 'Could not create the daily Excel digest'); } const blob = await response.blob(); const download = document.createElement('a'); download.href = URL.createObjectURL(blob); download.download = `retailos-daily-digest-${shiftId}.xlsx`; document.body.appendChild(download); download.click(); download.remove(); URL.revokeObjectURL(download.href); showToast('Daily Excel digest downloaded.'); }
async function shiftReportAction(event) { const report = event.target.closest('[data-print-shift-report], [data-download-shift-digest], [data-shift-report-id]'); if (!report) return; try { if (report.dataset.printShiftReport) { const result = await request(`/shifts/${encodeURIComponent(report.dataset.printShiftReport)}/report/print`, { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id }) }); showToast(`Shift report sent through ${result.transport}.`); } else if (report.dataset.downloadShiftDigest) await downloadShiftDigest(report.dataset.downloadShiftDigest); else await showShiftReport(report.dataset.shiftReportId); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } }
$('#printable-receipt').addEventListener('click', receiptAction);
$('#printable-receipt').addEventListener('click', shiftReportAction);
$('#receipt-dialog-content').addEventListener('click', receiptAction);
async function showReceipt(receiptNo, print = false) { const sale = await request(`/sales/receipt/${encodeURIComponent(receiptNo)}?companyId=${encodeURIComponent(state.config.company.id)}`); await renderPrintableReceipt(sale, { allowReturns: true, allowVoid: true, allowShare: true, target: '#receipt-dialog-content' }); $('#receipt-dialog').classList.remove('hidden'); if (print) await printReceipt(receiptNo); }
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
$('#sync-now').addEventListener('click', async () => { try { if (!navigator.onLine) throw new Error('Sync now needs an internet connection. Offline sales remain safely queued.'); $('#sync-now').disabled = true; startSyncProgress(); const result = await request('/sync/now', { method: 'POST', body: JSON.stringify({ companyId: state.config.company.id, actorId: state.user.id }) }); clearInterval(state.syncProgressTimer); setSyncProgress(75, 'saving catalogue'); await cacheCatalogue(); setSyncProgress(90, 'checking queued sales'); await replayOfflineSales(); setSyncProgress(100, 'complete'); const contactSummary = result.contacts ? ` Contacts: ${result.contacts.created} added, ${result.contacts.updated} updated.` : ''; showToast(result.skipped ? result.reason : result.products.notChanged ? `Bukku products are already up to date.${contactSummary}` : `Bukku products, contacts, and the local catalogue were refreshed.${contactSummary}`); } catch (error) { clearInterval(state.syncProgressTimer); setSyncProgress(0, 'failed'); showAlert(error); } finally { $('#sync-now').disabled = false; finishSyncProgress(); } });
$('#cash-movement').addEventListener('click', async () => { try { await addCashMovement(); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#cash-movement-amount').addEventListener('input', () => $('#cash-movement-anomaly').classList.toggle('hidden', Number($('#cash-movement-amount').value) <= 1000));
$('#shift-report').addEventListener('click', async () => { try { await showShiftReport(); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#lookup-form').addEventListener('submit', async (event) => { event.preventDefault(); try { state.searchEpoch += 1; await search(state.searchEpoch); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#lookup-query').addEventListener('input', () => { state.searchEpoch += 1; const epoch = state.searchEpoch; clearTimeout(state.searchTimer); state.searchTimer = setTimeout(() => search(epoch).catch((error) => { $('#checkout-message').textContent = error.message; showAlert(error); }), 220); });
$('#start-barcode-scan').addEventListener('click', async () => { try { await startBarcodeScanner(); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#stop-barcode-scan').addEventListener('click', stopBarcodeScanner);
$('#search-results').addEventListener('click', async (event) => { const related = event.target.closest('[data-related-search]'); if (related) { const epoch = ++state.searchEpoch; await search(epoch, true).catch(showAlert); return; } const adjustment = event.target.closest('[data-adjust-index]'); if (adjustment) { try { await adjustStock(state.searchResults[Number(adjustment.dataset.adjustIndex)]); } catch (error) { $('#checkout-message').textContent = error.message; } return; } const button = event.target.closest('[data-product-index]'); if (button) addProduct(state.searchResults[Number(button.dataset.productIndex)]); });
$('#recent-items').addEventListener('click', (event) => { const button = event.target.closest('[data-recent-item-index]'); if (button) addProduct(state.recentItems[Number(button.dataset.recentItemIndex)]); });
function commitQuantityDraft(input) {
  const index = Number(input.dataset.quantity); const line = state.cart[index]; if (!line) return;
  const text = input.value.trim();
  if (!text) { state.quantityErrors[index] = t('invalidQuantity'); input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', `quantity-error-${index}`); return; }
  const quantity = Number(text);
  if (!Number.isInteger(quantity) || quantity < 1) { state.quantityErrors[index] = t('invalidQuantity'); input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', `quantity-error-${index}`); return; }
  const available = line.availableStock == null ? null : Math.floor(Number(line.availableStock) / Number(line.uom.conversionFactor || 1));
  if (available != null && quantity > available) state.quantityWarnings[index] = t('stockWarning', { available, requested: quantity }); else delete state.quantityWarnings[index];
  input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); line.quantity = quantity; delete state.quantityDrafts[index]; delete state.quantityErrors[index]; renderCart();
}
async function renderPrinterPreview() {
  const target = $('#printer-live-preview'); if (!target || !state.config || !state.user) return;
  try {
    if (!state.receiptHistory.length) state.receiptHistory = await request(`/sales/history?companyId=${encodeURIComponent(state.config.company.id)}&locationId=${encodeURIComponent(selectedLocation().id)}`);
    const selectedReceipt = state.previewReceiptNo || state.receiptHistory[0]?.receiptNo;
    if (!selectedReceipt) { target.innerHTML = '<p class="empty-report">Complete a test sale before previewing a real saved receipt.</p>'; return; }
    const document = await request(`/sales/receipt/${encodeURIComponent(selectedReceipt)}/document?companyId=${encodeURIComponent(state.config.company.id)}`);
    document.widthMm = Number($('#profile-paper-width').value || document.widthMm); document.template = $('#receipt-template').value || document.template; document.showLogo = $('#receipt-show-logo').checked; document.showSku = $('#receipt-show-sku').checked; document.divider = $('#receipt-divider-style').value === 'DOUBLE' ? '=' : $('#receipt-divider-style').value === 'DOT' ? '·' : '-'; document.footer = $('#profile-receipt-footer').value || document.footer;
    if (!document.showSku) document.items.forEach((item) => delete item.sku);
    target.style.setProperty('--receipt-width', `${document.widthMm}mm`); target.dataset.receiptNo = selectedReceipt; target.innerHTML = `<p class="receipt-preview-source">Saved receipt ${escapeHtml(selectedReceipt)}</p>${canonicalReceiptHtml(document)}`;
  } catch (error) { target.innerHTML = `<p class="empty-report">${escapeHtml(error.message || 'Receipt preview is unavailable.')}</p>`; }
}
$('#cart-lines').addEventListener('input', (event) => {
  const input = event.target.closest('[data-quantity]'); if (!input) return;
  const index = Number(input.dataset.quantity); const line = state.cart[index];
  state.quantityDrafts[index] = input.value; input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby');
  const candidate = Number(input.value);
  const warning = Number.isInteger(candidate) && candidate >= 1 ? stockWarningForLine(line, candidate) : '';
  const warningNode = $(`#stock-warning-${index}`);
  if (warningNode) { warningNode.textContent = warning; warningNode.classList.toggle('hidden', !warning); }
});
$('#cart-lines').addEventListener('blur', (event) => { const input = event.target.closest('[data-quantity]'); if (input) commitQuantityDraft(input); }, true);
$('#cart-lines').addEventListener('keydown', (event) => { const input = event.target.closest('[data-quantity]'); if (!input || event.key !== 'Enter') return; event.preventDefault(); const index = Number(input.dataset.quantity); commitQuantityDraft(input); $(`[data-quantity="${index}"]`)?.focus(); });
$('#cart-lines').addEventListener('change', (event) => { const select = event.target.closest('[data-uom-index]'); if (select) { const line = state.cart[Number(select.dataset.uomIndex)]; const choice = line.availableUoms[Number(select.value)]; line.uom = choice.uom; line.unitPrice = choice.unitPrice; line.unitCost = line.basePurchaseCost == null ? null : Number(line.basePurchaseCost) * Number(choice.uom.conversionFactor); delete line.discount; renderCart(); return; } const discountControl = event.target.closest('[data-discount-value]'); if (!discountControl) return; const index = Number(discountControl.dataset.discountValue); try { applyInlineDiscount(index); } catch (error) { showAlert(error); } });
$('#cart-lines').addEventListener('input', (event) => { const discountControl = event.target.closest('[data-discount-value]'); if (!discountControl) return; const parsed = parseDiscountExpression(discountControl.value); setDiscountError(Number(discountControl.dataset.discountValue), parsed.error || ''); });
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
$('#cash-payment-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await completeCheckout(true, $('#cash-payment-received').value); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } });
$('#pay-cash').addEventListener('click', async () => { try { await completeCheckout(); } catch (error) { $('#checkout-message').textContent = error.message; showAlert(error); } });
$('#confirm-duitnow').addEventListener('click', async () => { try { await completeCheckout(true); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#confirm-bank-transfer').addEventListener('click', async () => { try { await completeCheckout(true); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#confirm-split').addEventListener('click', async () => { try { await completeCheckout(true); } catch (error) { $('#checkout-message').textContent = error.message; } });
$('#hide-shift-close').addEventListener('click', () => $('#shift-close-dialog').classList.add('hidden'));
$('#shift-stock-shortage-acknowledged').addEventListener('change', syncShiftCloseAcknowledgement);
$('#shift-close-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await closeShiftFromDialog(); } catch (error) { showAlert(error); } });
$('#hide-shift-open').addEventListener('click', () => $('#shift-open-dialog').classList.add('hidden'));
$('#shift-opening-float').addEventListener('input', () => $('#shift-opening-anomaly').classList.toggle('hidden', Number($('#shift-opening-float').value) <= 1000));
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
    state.config = saved.config; state.user = saved.user; state.shift = saved.shift || null; state.verifiedShift = saved.verifiedShift || null;
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
    state.user = saved.user; state.sessionToken = saved.sessionToken; state.shift = saved.shift || null; state.verifiedShift = saved.verifiedShift || null;
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
