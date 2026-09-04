import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { BukkuHttpClient } from '../integrations/bukku/bukku-http.client';
import { receiptHistoryPaymentAmount } from '../checkout/checkout-calculator';
import { ApproveBukkuProductMappingDto, CreateManagedContactDto, CreateManagedProductDto, CreateManagedStaffDto, CreateProductAliasDto, DeleteManagedProductDto, ManagerRequestDto, ProductLifecycleDto, UpdateCompanyProfileDto, UpdateManagedProductDto, UpdateManagedStaffDto } from './dto/management.dto';
import { recordInventoryLedger } from '../inventory/inventory-ledger';
import { hashPin } from '../auth/pin';
import { generatedAliasesForProduct, normalizeProductText, structuredSearchFieldsForProduct } from '../products/product-search';

type ManagedProduct = Prisma.ProductGetPayload<{ include: { uoms: true; barcodes: true; aliases: true; prices: { include: { priceLevel: true } }; purchasePrices: true } }>;
type BukkuAccount = { id?: string | number; code?: string; name?: string; type?: string; system_type?: string; is_archived?: boolean; children?: BukkuAccount[] };
type BukkuContact = { id?: string | number; code?: string; display_name?: string; legal_name?: string; types?: string[] };
type BukkuLocation = { id?: string | number; code?: string; name?: string };

@Injectable()
export class ManagementService {
  constructor(private readonly db: PrismaService, private readonly bukku: BukkuHttpClient) {}

  async profile(input: ManagerRequestDto) {
    await this.assertAnyPermission(input, ['company.manage', 'printer.manage']);
    const company = await this.db.company.findUnique({ where: { id: input.companyId } });
    if (!company) throw new NotFoundException('Company was not found');
    return this.profileView(company);
  }

  async updateProfile(input: UpdateCompanyProfileDto) {
    const printerOnly = input.receiptFooter !== undefined || input.receiptPaperWidthMm !== undefined || input.printerConnectionMethod !== undefined || input.printerLanHost !== undefined || input.printerLanPort !== undefined || input.printerWindowsQueue !== undefined || input.printerSerialPort !== undefined || input.printerSerialBaudRate !== undefined || input.printerProfileName !== undefined || input.printerFallbackMethod !== undefined || input.printerFallbackLanHost !== undefined || input.printerFallbackLanPort !== undefined || input.receiptTemplate !== undefined || input.receiptDividerStyle !== undefined || input.receiptShowLogo !== undefined || input.receiptShowSku !== undefined || input.receiptChineseMode !== undefined;
    const companyFields = [input.name, input.legalName, input.registrationNo, input.tin, input.brnNew, input.brnOld, input.address, input.officePhone, input.phone, input.email];
    await this.assertPermission(input, printerOnly && companyFields.every((field) => field === undefined) ? 'printer.manage' : 'company.manage');
    const data: Prisma.CompanyUpdateInput = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.legalName !== undefined ? { legalName: input.legalName.trim() || null } : {}),
      ...(input.registrationNo !== undefined ? { registrationNo: input.registrationNo.trim() || null } : {}),
      ...(input.tin !== undefined ? { tin: input.tin.trim() || null } : {}),
      ...(input.brnNew !== undefined ? { brnNew: input.brnNew.trim() || null } : {}),
      ...(input.brnOld !== undefined ? { brnOld: input.brnOld.trim() || null } : {}),
      ...(input.address !== undefined ? { address: input.address.trim() || null } : {}),
      ...(input.officePhone !== undefined ? { officePhone: input.officePhone.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone.trim() || null } : {}),
      ...(input.email !== undefined ? { email: input.email.trim() || null } : {}),
      ...(input.receiptFooter !== undefined ? { receiptFooter: input.receiptFooter.trim() || null } : {}),
      ...(input.printerLanHost !== undefined ? { printerLanHost: input.printerLanHost.trim() || null } : {}),
      ...(input.printerWindowsQueue !== undefined ? { printerWindowsQueue: input.printerWindowsQueue.trim() || null } : {}),
      ...(input.printerSerialPort !== undefined ? { printerSerialPort: input.printerSerialPort.trim().toUpperCase() || null } : {}),
      ...(input.printerProfileName !== undefined ? { printerProfileName: input.printerProfileName.trim() } : {}),
      ...(input.printerFallbackMethod !== undefined ? { printerFallbackMethod: input.printerFallbackMethod || null } : {}),
      ...(input.printerFallbackLanHost !== undefined ? { printerFallbackLanHost: input.printerFallbackLanHost.trim() || null } : {}),
      ...(input.receiptTemplate !== undefined ? { receiptTemplate: input.receiptTemplate } : {}),
      ...(input.receiptDividerStyle !== undefined ? { receiptDividerStyle: input.receiptDividerStyle } : {}),
      ...(input.receiptShowLogo !== undefined ? { receiptShowLogo: input.receiptShowLogo } : {}),
      ...(input.receiptShowSku !== undefined ? { receiptShowSku: input.receiptShowSku } : {}),
      ...(input.receiptChineseMode !== undefined ? { receiptChineseMode: input.receiptChineseMode } : {}),
      ...(input.customerEInvoiceRequestsEnabled !== undefined ? { customerEInvoiceRequestsEnabled: input.customerEInvoiceRequestsEnabled } : {}),
      ...(input.bukkuDailyInvoiceEnabled !== undefined ? { bukkuDailyInvoiceEnabled: input.bukkuDailyInvoiceEnabled } : {}),
      ...(input.bukkuDailyInvoiceContactId !== undefined ? { bukkuDailyInvoiceContactId: input.bukkuDailyInvoiceContactId.trim() || null } : {}),
      ...(input.bukkuDailyInvoiceLocationId !== undefined ? { bukkuDailyInvoiceLocationId: input.bukkuDailyInvoiceLocationId.trim() || null } : {}),
      ...(input.bukkuDailyInvoiceRevenueAccountId !== undefined ? { bukkuDailyInvoiceRevenueAccountId: input.bukkuDailyInvoiceRevenueAccountId.trim() || null } : {}),
      ...(input.bukkuDailyInvoiceTaxCodeId !== undefined ? { bukkuDailyInvoiceTaxCodeId: input.bukkuDailyInvoiceTaxCodeId.trim() || null } : {}),
      ...(input.bukkuDailyInvoicePaymentAccounts !== undefined ? { bukkuDailyInvoicePaymentAccounts: input.bukkuDailyInvoicePaymentAccounts } : {}),
    };
    if (input.receiptPaperWidthMm !== undefined) data.receiptPaperWidthMm = input.receiptPaperWidthMm;
    if (input.printerConnectionMethod !== undefined) data.printerConnectionMethod = input.printerConnectionMethod;
    if (input.printerLanPort !== undefined) data.printerLanPort = input.printerLanPort;
    if (input.printerSerialBaudRate !== undefined) data.printerSerialBaudRate = input.printerSerialBaudRate;
    if (input.printerFallbackLanPort !== undefined) data.printerFallbackLanPort = input.printerFallbackLanPort;
    const company = await this.db.company.update({ where: { id: input.companyId }, data });
    await this.db.auditLog.create({ data: { companyId: company.id, actorId: input.actorId, action: 'COMPANY_PROFILE_UPDATED', entityType: 'Company', entityId: company.id, after: this.profileView(company) } });
    return this.profileView(company);
  }

  async previewBukkuDailyInvoice(shiftId: string, input: ManagerRequestDto) {
    await this.assertPermission(input, 'company.manage');
    if (!shiftId) throw new BadRequestException('Choose a closed shift to preview');
    const [company, shift] = await Promise.all([
      this.db.company.findUnique({ where: { id: input.companyId } }),
      this.db.shift.findFirst({ where: { id: shiftId, closedAt: { not: null }, location: { companyId: input.companyId } }, include: { location: { select: { name: true } }, register: { select: { name: true } }, sales: { where: { status: 'COMPLETED' }, orderBy: { completedAt: 'asc' }, include: { payments: { where: { status: 'COMPLETED' }, select: { method: true, amount: true, changeAmount: true } }, items: { include: { product: { select: { sku: true, name: true } }, uom: { select: { code: true, name: true } } } } } } } }),
    ]);
    if (!company) throw new NotFoundException('Company was not found');
    if (!shift) throw new NotFoundException('Closed shift was not found');
    const paymentAccounts = this.stringRecord(company.bukkuDailyInvoicePaymentAccounts);
    const paymentTotals: Record<string, number> = {};
    const groupedItems = new Map<string, { sku: string; description: string; uom: string; quantity: number; subtotal: number; discount: number; tax: number; total: number }>();
    let subtotal = 0; let discountTotal = 0; let taxTotal = 0; let grandTotal = 0;
    for (const sale of shift.sales) {
      subtotal += Number(sale.subtotal); discountTotal += Number(sale.discountTotal); taxTotal += Number(sale.taxTotal); grandTotal += Number(sale.grandTotal);
      for (const payment of sale.payments) paymentTotals[payment.method] = (paymentTotals[payment.method] ?? 0) + receiptHistoryPaymentAmount({ method: payment.method, amount: Number(payment.amount), changeAmount: Number(payment.changeAmount) });
      for (const item of sale.items) {
        const key = `${item.productId}:${item.uomId}`;
        const row = groupedItems.get(key) ?? { sku: item.product.sku, description: item.description || item.product.name, uom: item.uom.code || item.uom.name, quantity: 0, subtotal: 0, discount: 0, tax: 0, total: 0 };
        row.quantity += Number(item.quantity); row.subtotal += Number(item.quantity) * Number(item.unitPrice); row.discount += Number(item.lineDiscount); row.tax += Number(item.taxAmount); row.total += Number(item.lineTotal);
        groupedItems.set(key, row);
      }
    }
    const required = [['Enable Bukku daily invoice posting', company.bukkuDailyInvoiceEnabled], ['Bukku cash-sales contact ID', company.bukkuDailyInvoiceContactId], ['Bukku revenue account ID', company.bukkuDailyInvoiceRevenueAccountId]] as const;
    const missing: string[] = required.filter(([, value]) => !value).map(([label]) => label);
    for (const method of Object.keys(paymentTotals)) if (!paymentAccounts[method]) missing.push(`Bukku payment account ID for ${method}`);
    const businessDate = (shift.closedAt ?? new Date()).toISOString().slice(0, 10);
    return { previewOnly: true, notice: 'Preview only. RetailOS has not created or posted an invoice in Bukku.', mapping: { enabled: company.bukkuDailyInvoiceEnabled, contactId: company.bukkuDailyInvoiceContactId, locationId: company.bukkuDailyInvoiceLocationId, revenueAccountId: company.bukkuDailyInvoiceRevenueAccountId, taxCodeId: company.bukkuDailyInvoiceTaxCodeId, paymentAccounts, complete: missing.length === 0, missing }, invoice: { idempotencyKey: `bukku:shift-daily-digest:${shift.id}`, businessDate, reference: `RetailOS closed shift ${shift.id}`, location: { retailosName: shift.location.name, bukkuId: company.bukkuDailyInvoiceLocationId }, register: shift.register.name, salesCount: shift.sales.length, subtotal: this.roundMoney(subtotal), discountTotal: this.roundMoney(discountTotal), taxTotal: this.roundMoney(taxTotal), total: this.roundMoney(grandTotal), paymentTotals: Object.entries(paymentTotals).map(([method, amount]) => ({ method, amount: this.roundMoney(amount), bukkuAccountId: paymentAccounts[method] ?? null })), lines: [...groupedItems.values()].map((row) => ({ ...row, quantity: Number(row.quantity.toFixed(4)), subtotal: this.roundMoney(row.subtotal), discount: this.roundMoney(row.discount), tax: this.roundMoney(row.tax), total: this.roundMoney(row.total) })) } };
  }

  async bukkuMappingOptions(input: ManagerRequestDto) {
    await this.assertPermission(input, 'company.manage');
    if (!this.bukku.isConfigured()) throw new BadRequestException('Bukku is not configured for this RetailOS server');
    const [accountPayload, contactPayload, locationPayload] = await Promise.all([
      this.bukku.get('/accounts?page=1&page_size=100') as Promise<{ accounts?: BukkuAccount[] }>,
      this.bukku.get('/contacts?page=1&page_size=100') as Promise<{ contacts?: BukkuContact[] }>,
      this.bukku.get('/locations?page=1&page_size=100') as Promise<{ locations?: BukkuLocation[] }>,
    ]);
    const accounts = this.flattenBukkuAccounts(accountPayload.accounts ?? [])
      .filter((account) => account.id != null && !account.is_archived && !(account.children?.length))
      .map((account) => ({ id: String(account.id), code: account.code ?? '', name: account.name ?? `Account ${account.id}`, type: account.type ?? '', systemType: account.system_type ?? '' }))
      .sort((left, right) => `${left.code} ${left.name}`.localeCompare(`${right.code} ${right.name}`));
    return {
      accounts,
      contacts: (contactPayload.contacts ?? []).filter((contact) => contact.id != null).map((contact) => ({ id: String(contact.id), code: contact.code ?? '', name: contact.display_name ?? contact.legal_name ?? `Contact ${contact.id}` })).sort((left, right) => left.name.localeCompare(right.name)),
      locations: (locationPayload.locations ?? []).filter((location) => location.id != null).map((location) => ({ id: String(location.id), code: location.code ?? '', name: location.name ?? `Location ${location.id}` })),
    };
  }

  async listBukkuProductMappings(input: ManagerRequestDto, query?: string) {
    await this.assertPermission(input, 'company.manage');
    const term = query?.trim();
    const products = await this.db.product.findMany({
      where: { companyId: input.companyId, ...(term ? { OR: [{ sku: { contains: term, mode: 'insensitive' } }, { name: { contains: term, mode: 'insensitive' } }] } : {}) },
      select: { id: true, sku: true, name: true, active: true, deletedAt: true }, orderBy: [{ sku: 'asc' }, { id: 'asc' }], take: 100,
    });
    const productIds = products.map((product) => product.id);
    const [references, audits] = await Promise.all([
      this.db.externalReference.findMany({ where: { companyId: input.companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: { in: productIds } } }),
      this.db.auditLog.findMany({ where: { companyId: input.companyId, entityType: 'BukkuProductMapping', entityId: { in: productIds } }, include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } }),
    ]);
    const referenceByProduct = new Map(references.map((reference) => [reference.localId, reference]));
    const auditsByProduct = new Map<string, typeof audits>();
    for (const audit of audits) auditsByProduct.set(audit.entityId!, [...(auditsByProduct.get(audit.entityId!) ?? []), audit]);
    const duplicateNames = new Map<string, number>();
    for (const product of products) { const key = product.name.trim().toLocaleLowerCase('en'); duplicateNames.set(key, (duplicateNames.get(key) ?? 0) + 1); }
    return { items: products.map((product) => {
      const reference = referenceByProduct.get(product.id); const history = auditsByProduct.get(product.id) ?? [];
      const approved = history.find((audit) => audit.action === 'BUKKU_PRODUCT_MAPPING_APPROVED' && this.jsonRecord(audit.after).bukkuItemId === reference?.externalId);
      const details = approved ? this.jsonRecord(approved.after) : {};
      const duplicateDisplayName = (duplicateNames.get(product.name.trim().toLocaleLowerCase('en')) ?? 0) > 1;
      return { productId: product.id, sku: product.sku, productName: product.name, productStatus: product.deletedAt ? 'DELETED' : product.active ? 'ACTIVE' : 'DEACTIVATED', bukkuItemId: reference?.externalId ?? null, bukkuItemCode: typeof details.bukkuItemCode === 'string' ? details.bukkuItemCode : null, bukkuDisplayName: typeof details.bukkuDisplayName === 'string' ? details.bukkuDisplayName : null, mappingStatus: approved ? 'APPROVED' : reference ? 'REVIEW_REQUIRED' : 'UNMAPPED', duplicateConflictWarning: duplicateDisplayName ? 'Another RetailOS product has the same display name. Verify SKU and Bukku item ID; names are never used for automatic mapping.' : null, auditHistory: history.map((audit) => ({ action: audit.action, actor: audit.actor?.name ?? null, createdAt: audit.createdAt, before: audit.before, after: audit.after })) };
    }) };
  }

  async approveBukkuProductMapping(input: ApproveBukkuProductMappingDto) {
    await this.assertPermission(input, 'company.manage');
    if (!input.confirmed) throw new BadRequestException('Explicit manager confirmation is required');
    const product = await this.db.product.findFirst({ where: { id: input.productId, companyId: input.companyId }, select: { id: true, sku: true, name: true } });
    if (!product) throw new NotFoundException('RetailOS product was not found');
    const [current, conflict] = await Promise.all([
      this.db.externalReference.findUnique({ where: { companyId_provider_entityType_localId: { companyId: input.companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: product.id } } }),
      this.db.externalReference.findUnique({ where: { companyId_provider_entityType_externalId: { companyId: input.companyId, provider: 'BUKKU', entityType: 'PRODUCT', externalId: input.bukkuItemId.trim() } } }),
    ]);
    if (conflict && conflict.localId !== product.id) throw new ConflictException(`Bukku item ${input.bukkuItemId.trim()} is already mapped to another RetailOS SKU`);
    const after = { productId: product.id, retailosSku: product.sku, retailosProductName: product.name, bukkuItemId: input.bukkuItemId.trim(), bukkuItemCode: input.bukkuItemCode.trim(), bukkuDisplayName: input.bukkuDisplayName.trim(), mappingStatus: 'APPROVED', approvedById: input.actorId };
    const reference = await this.db.$transaction(async (tx) => {
      const saved = await tx.externalReference.upsert({ where: { companyId_provider_entityType_localId: { companyId: input.companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: product.id } }, update: { externalId: after.bukkuItemId, syncedAt: new Date() }, create: { companyId: input.companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: product.id, externalId: after.bukkuItemId } });
      await tx.auditLog.create({ data: { companyId: input.companyId, actorId: input.actorId, action: 'BUKKU_PRODUCT_MAPPING_APPROVED', entityType: 'BukkuProductMapping', entityId: product.id, reason: 'Manager approved an explicit SKU-to-Bukku-item mapping', before: current ? { productId: product.id, bukkuItemId: current.externalId } : Prisma.JsonNull, after } });
      return saved;
    });
    return { ...after, referenceId: reference.id };
  }

  private flattenBukkuAccounts(accounts: BukkuAccount[]): BukkuAccount[] {
    return accounts.flatMap((account) => [account, ...this.flattenBukkuAccounts(account.children ?? [])]);
  }

  async listStaff(input: ManagerRequestDto) {
    await this.assertPermission(input, 'company.manage');
    const [users, roles] = await Promise.all([
      this.db.user.findMany({ where: { companyId: input.companyId }, include: { role: true }, orderBy: { name: 'asc' } }),
      this.db.role.findMany({ where: { companyId: input.companyId }, orderBy: { name: 'asc' } }),
    ]);
    return { users: users.map((user) => ({ id: user.id, name: user.name, email: user.email, roleId: user.roleId, role: user.role.name, active: user.status === 'ACTIVE' })), roles: roles.map((role) => ({ id: role.id, name: role.name })) };
  }

  async createStaff(input: CreateManagedStaffDto) {
    await this.assertPermission(input, 'company.manage');
    const role = await this.db.role.findFirst({ where: { id: input.roleId, companyId: input.companyId } });
    if (!role) throw new BadRequestException('Choose a valid role for this company');
    const email = input.email.trim().toLowerCase();
    const existing = await this.db.user.findUnique({ where: { companyId_email: { companyId: input.companyId, email } } });
    if (existing) throw new ConflictException('A staff account already uses this email address');
    const user = await this.db.user.create({ data: { companyId: input.companyId, roleId: role.id, name: input.name.trim(), email, pinHash: hashPin(input.pin) } });
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: input.actorId, action: 'STAFF_ACCOUNT_CREATED', entityType: 'User', entityId: user.id, after: { name: user.name, email: user.email, role: role.name } } });
    return { id: user.id, name: user.name, email: user.email, role: role.name, active: true };
  }

  async updateStaff(id: string, input: UpdateManagedStaffDto) {
    await this.assertPermission(input, 'company.manage');
    const user = await this.db.user.findFirst({ where: { id, companyId: input.companyId } });
    if (!user) throw new NotFoundException('Staff account was not found');
    if (id === input.actorId && input.active === false) throw new BadRequestException('You cannot disable the account currently managing RetailOS');
    if (input.roleId !== undefined && !await this.db.role.findFirst({ where: { id: input.roleId, companyId: input.companyId } })) throw new BadRequestException('Choose a valid role for this company');
    const email = input.email === undefined ? undefined : input.email.trim().toLowerCase();
    const updated = await this.db.user.update({ where: { id }, data: { ...(input.name === undefined ? {} : { name: input.name.trim() }), ...(email === undefined ? {} : { email }), ...(input.roleId === undefined ? {} : { roleId: input.roleId }), ...(input.pin === undefined ? {} : { pinHash: hashPin(input.pin) }), ...(input.active === undefined ? {} : { status: input.active ? 'ACTIVE' : 'INACTIVE' }) }, include: { role: true } });
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: input.actorId, action: 'STAFF_ACCOUNT_UPDATED', entityType: 'User', entityId: id, after: { name: updated.name, email: updated.email, role: updated.role.name, active: updated.status === 'ACTIVE', pinChanged: input.pin !== undefined } } });
    return { id: updated.id, name: updated.name, email: updated.email, role: updated.role.name, active: updated.status === 'ACTIVE' };
  }

  async listProducts(input: ManagerRequestDto, query?: string) {
    await this.assertPermission(input, 'catalog.manage');
    const term = query?.trim();
    const normalizedTerm = term ? normalizeProductText(term) : null;
    const products = await this.db.product.findMany({
      where: { companyId: input.companyId, ...(term ? { OR: [{ sku: { contains: term, mode: 'insensitive' } }, { name: { contains: term, mode: 'insensitive' } }, { supplierDescription: { contains: term, mode: 'insensitive' } }, { category: { contains: term, mode: 'insensitive' } }, { barcodes: { some: { barcode: { contains: term, mode: 'insensitive' } } } }, { aliases: { some: { OR: [{ normalizedToken: { contains: normalizedTerm!.token } }, { normalizedCompact: { contains: normalizedTerm!.compact } }] } } }] } : {}) },
      include: { uoms: { orderBy: [{ isBase: 'desc' }, { name: 'asc' }] }, barcodes: true, aliases: true, prices: { include: { priceLevel: true } }, purchasePrices: true },
      orderBy: { name: 'asc' }, take: 100,
    });
    const refs = await this.db.externalReference.findMany({ where: { companyId: input.companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: { in: products.map((product) => product.id) } }, select: { localId: true } });
    const imported = new Set(refs.map((reference) => reference.localId));
    return products.map((product) => this.productView(product, imported.has(product.id)));
  }

  async product(id: string, input: ManagerRequestDto) {
    await this.assertPermission(input, 'catalog.manage');
    const product = await this.db.product.findFirst({ where: { id, companyId: input.companyId }, include: { uoms: { orderBy: [{ isBase: 'desc' }, { name: 'asc' }] }, barcodes: true, aliases: { orderBy: [{ source: 'asc' }, { text: 'asc' }] }, prices: { include: { priceLevel: true } }, purchasePrices: true } });
    if (!product) throw new NotFoundException('Product was not found');
    const ref = await this.db.externalReference.findFirst({ where: { companyId: input.companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: product.id } });
    return this.productView(product, Boolean(ref), ref?.externalId);
  }

  async updateProduct(id: string, input: UpdateManagedProductDto) {
    await this.assertPermission(input, 'catalog.manage');
    return this.db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id, companyId: input.companyId }, include: { uoms: true, barcodes: true, aliases: true } });
      if (!product) throw new NotFoundException('Product was not found');
      const name = input.name?.trim(); const sku = input.sku?.trim();
      if (sku && sku !== product.sku && await tx.product.findFirst({ where: { companyId: input.companyId, sku } })) throw new ConflictException('That SKU already exists');
      if (name && name !== product.name && await tx.product.findFirst({ where: { companyId: input.companyId, name: { equals: name, mode: 'insensitive' } } })) throw new ConflictException('That product name already exists');
      const barcode = input.barcode?.trim();
      if (barcode && product.barcodes[0]?.barcode !== barcode) {
        const match = await tx.productBarcode.findUnique({ where: { barcode } });
        if (match && match.productId !== product.id) throw new ConflictException('That barcode already belongs to another product');
      }
      const searchFields = structuredSearchFieldsForProduct([name ?? product.name, input.supplierDescription ?? product.supplierDescription, input.category ?? product.category, ...product.aliases.map((alias) => alias.text)]);
      const updated = await tx.product.update({ where: { id: product.id }, data: {
        ...(name !== undefined ? { name: name || product.name } : {}), ...(sku !== undefined ? { sku: sku || product.sku } : {}),
        ...(input.classificationCode !== undefined ? { classificationCode: input.classificationCode.trim() || null } : {}),
        ...(input.supplierDescription !== undefined ? { supplierDescription: input.supplierDescription.trim() || null } : {}),
        ...(input.supplierName !== undefined ? { supplierName: input.supplierName.trim() || null } : {}),
        ...(input.lastPurchasedAt !== undefined ? { lastPurchasedAt: input.lastPurchasedAt ? new Date(input.lastPurchasedAt) : null } : {}),
        ...(input.category !== undefined ? { category: input.category.trim() || null } : {}),
        ...searchFields,
        ...(input.trackStock !== undefined ? { trackStock: input.trackStock } : {}), ...(input.active !== undefined ? { active: input.active } : {}),
      } });
      await this.refreshGeneratedAliases(tx, product.id, [updated.name, updated.supplierDescription, updated.category]);
      if (input.barcode !== undefined) {
        if (barcode) {
          const base = product.uoms.find((uom) => uom.isBase) ?? product.uoms[0];
          if (product.barcodes[0]) await tx.productBarcode.update({ where: { id: product.barcodes[0].id }, data: { barcode, uomId: base?.id } });
          else await tx.productBarcode.create({ data: { productId: product.id, barcode, uomId: base?.id } });
        } else if (product.barcodes[0]) await tx.productBarcode.delete({ where: { id: product.barcodes[0].id } });
      }
      const retail = await tx.priceLevel.upsert({ where: { companyId_code: { companyId: input.companyId, code: 'RETAIL' } }, update: { name: 'Retail' }, create: { companyId: input.companyId, code: 'RETAIL', name: 'Retail' } });
      for (const unit of input.uoms ?? []) {
        const existing = product.uoms.find((row) => row.id === unit.id);
        if (!existing) throw new BadRequestException('A product unit no longer belongs to this product');
        await tx.productUOM.update({ where: { id: existing.id }, data: { code: unit.code.trim().toUpperCase(), name: unit.name.trim(), conversionFactor: unit.conversionFactor } });
        await tx.productPrice.upsert({ where: { productId_priceLevelId_uomId: { productId: product.id, priceLevelId: retail.id, uomId: existing.id } }, update: { amount: unit.salePrice }, create: { productId: product.id, priceLevelId: retail.id, uomId: existing.id, amount: unit.salePrice } });
        if (unit.purchasePrice !== undefined) await tx.productPurchasePrice.upsert({ where: { productId_uomId: { productId: product.id, uomId: existing.id } }, update: { amount: unit.purchasePrice }, create: { productId: product.id, uomId: existing.id, amount: unit.purchasePrice } });
        if (existing.isBase && unit.purchasePrice !== undefined) await tx.product.update({ where: { id: product.id }, data: { basePurchaseCost: unit.purchasePrice } });
      }
      const reference = await tx.externalReference.findFirst({ where: { companyId: input.companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: product.id } });
      const externalId = reference?.externalId;
      if (externalId) await tx.syncJob.create({ data: { companyId: input.companyId, provider: 'BUKKU', entityType: 'PRODUCT', entityId: product.id, action: 'BUKKU_PRODUCT_UPDATE_PENDING', direction: 'OUTBOUND', idempotencyKey: `bukku:product-update:${product.id}:${Date.now()}`, payload: { externalId, productId: product.id, changedBy: input.actorId } } });
      await tx.auditLog.create({ data: { companyId: input.companyId, actorId: input.actorId, action: 'PRODUCT_UPDATED', entityType: 'Product', entityId: product.id, after: { sku: updated.sku, name: updated.name, queuedForBukku: Boolean(externalId) } } });
      return { id: updated.id, name: updated.name, sku: updated.sku, source: externalId ? 'BUKKU' : 'LOCAL', sync: externalId ? 'QUEUED_FOR_BUKKU_MAPPING' : 'LOCAL_ONLY' };
    });
  }

  async productDeleteImpact(id: string, input: ManagerRequestDto) {
    await this.assertPermission(input, 'catalog.manage');
    const product = await this.db.product.findFirst({ where: { id, companyId: input.companyId }, select: { id: true, name: true, sku: true, active: true, deletedAt: true } });
    if (!product) throw new NotFoundException('Product was not found');
    return { product: { id: product.id, name: product.name, sku: product.sku, status: product.deletedAt ? 'Deleted' : product.active ? 'Active' : 'Deactivated' }, ...(await this.productHistoryImpact(input.companyId, id)) };
  }

  async setProductActive(id: string, active: boolean, input: ProductLifecycleDto) {
    await this.assertPermission(input, 'catalog.manage');
    if (!input.confirmed) throw new BadRequestException(`Confirm that you want to ${active ? 'reactivate' : 'deactivate'} this product`);
    return this.db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id, companyId: input.companyId } });
      if (!product) throw new NotFoundException('Product was not found');
      const updated = await tx.product.update({ where: { id }, data: { active, ...(active ? { deletedAt: null } : {}) } });
      await tx.auditLog.create({ data: { companyId: input.companyId, actorId: input.actorId, action: active ? 'PRODUCT_REACTIVATED' : 'PRODUCT_DEACTIVATED', entityType: 'Product', entityId: id, before: { active: product.active, deletedAt: product.deletedAt }, after: { active: updated.active, deletedAt: updated.deletedAt } } });
      return { id, sku: updated.sku, name: updated.name, status: updated.deletedAt ? 'Deleted' : updated.active ? 'Active' : 'Deactivated' };
    });
  }

  async deleteProduct(id: string, input: DeleteManagedProductDto) {
    await this.assertPermission(input, 'catalog.manage');
    if (!input.confirmed) throw new BadRequestException('Explicit manager confirmation is required before deleting or archiving a product');
    const product = await this.db.product.findFirst({ where: { id, companyId: input.companyId } });
    if (!product) throw new NotFoundException('Product was not found');
    const impact = await this.productHistoryImpact(input.companyId, id);
    if (input.hardDelete && !impact.hardDeleteAllowed) throw new UnprocessableEntityException('Hard delete is not allowed because this product has history. Archive it instead');
    if (!impact.hardDeleteAllowed) {
      const deletedAt = new Date();
      await this.db.$transaction([
        this.db.product.update({ where: { id }, data: { active: false, deletedAt } }),
        this.db.auditLog.create({ data: { companyId: input.companyId, actorId: input.actorId, action: 'PRODUCT_ARCHIVED', entityType: 'Product', entityId: id, before: { name: product.name, sku: product.sku, active: product.active, deletedAt: product.deletedAt }, after: { name: product.name, sku: product.sku, active: false, deletedAt, relatedRecords: impact.relatedRecords } } }),
      ]);
      return { id, name: product.name, sku: product.sku, status: 'Deleted', mode: 'ARCHIVED', reversible: true, relatedRecords: impact.relatedRecords };
    }
    await this.db.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { companyId: input.companyId, actorId: input.actorId, action: 'PRODUCT_HARD_DELETED', entityType: 'Product', entityId: id, before: { name: product.name, sku: product.sku }, metadata: { unusedProduct: true } } });
      await tx.product.delete({ where: { id } });
    });
    return { id, name: product.name, sku: product.sku, status: 'Deleted', mode: 'HARD_DELETE', reversible: false };
  }

  async addProductAlias(id: string, input: CreateProductAliasDto) {
    await this.assertPermission(input, 'catalog.manage');
    const product = await this.db.product.findFirst({ where: { id, companyId: input.companyId }, select: { id: true, name: true, supplierDescription: true, category: true, searchDimensions: true, searchMaterials: true, searchProductTypes: true } });
    if (!product) throw new NotFoundException('Product was not found');
    const text = input.text.normalize('NFKC').trim().replace(/\s+/g, ' ');
    const normalized = normalizeProductText(text);
    if (!normalized.token) throw new BadRequestException('Enter an alias containing letters or numbers');
    try {
      const alias = await this.db.productAlias.create({ data: { productId: id, text, normalizedToken: normalized.token, normalizedCompact: normalized.compact, source: 'MANUAL', createdById: input.actorId } });
      const aliasFields = structuredSearchFieldsForProduct([text]);
      await this.db.product.update({ where: { id }, data: {
        searchDimensions: [...new Set([...(product.searchDimensions ?? []), ...aliasFields.searchDimensions])],
        searchMaterials: [...new Set([...(product.searchMaterials ?? []), ...aliasFields.searchMaterials])],
        searchProductTypes: [...new Set([...(product.searchProductTypes ?? []), ...aliasFields.searchProductTypes])],
      } });
      await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: input.actorId, action: 'PRODUCT_ALIAS_CREATED', entityType: 'ProductAlias', entityId: alias.id, after: { productId: id, text, source: 'MANUAL' } } });
      return alias;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('This product already has the same normalized alias');
      throw error;
    }
  }

  async deleteProductAlias(id: string, aliasId: string, input: ManagerRequestDto) {
    await this.assertPermission(input, 'catalog.manage');
    const alias = await this.db.productAlias.findFirst({ where: { id: aliasId, productId: id, product: { companyId: input.companyId } } });
    if (!alias) throw new NotFoundException('Product alias was not found');
    if (alias.source === 'GENERATED') throw new BadRequestException('Generated aliases are maintained from product master data');
    await this.db.$transaction([
      this.db.productAlias.delete({ where: { id: alias.id } }),
      this.db.auditLog.create({ data: { companyId: input.companyId, actorId: input.actorId, action: 'PRODUCT_ALIAS_DELETED', entityType: 'ProductAlias', entityId: alias.id, before: { productId: id, text: alias.text, source: alias.source } } }),
    ]);
    await this.rebuildProductSearchFields(id);
    return { deleted: true };
  }

  async createProduct(input: CreateManagedProductDto) {
    await this.assertPermission(input, 'catalog.manage');
    if (!input.uoms?.length) throw new BadRequestException('Add at least one selling unit');
    const normalizedUnits = input.uoms.map((unit) => ({ ...unit, code: unit.code.trim().toUpperCase(), name: unit.name.trim() }));
    if (new Set(normalizedUnits.map((unit) => unit.code)).size !== normalizedUnits.length) throw new BadRequestException('Each unit needs a unique code');
    if (!normalizedUnits.some((unit) => Math.abs(unit.conversionFactor - 1) < 0.000001)) throw new BadRequestException('One unit must use conversion factor 1 as the stock base unit');
    return this.db.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { companyId_sku: { companyId: input.companyId, sku: input.sku.trim() } } });
      if (existing) throw new ConflictException('That SKU already exists');
      const sameName = await tx.product.findFirst({ where: { companyId: input.companyId, name: { equals: input.name.trim(), mode: 'insensitive' } } });
      if (sameName) throw new ConflictException(`An item with this product name already exists (SKU: ${sameName.sku})`);
      if (input.barcode?.trim() && await tx.productBarcode.findUnique({ where: { barcode: input.barcode.trim() } })) throw new ConflictException('That barcode already exists');
      const retail = await tx.priceLevel.upsert({ where: { companyId_code: { companyId: input.companyId, code: 'RETAIL' } }, update: { name: 'Retail' }, create: { companyId: input.companyId, code: 'RETAIL', name: 'Retail' } });
      const searchFields = structuredSearchFieldsForProduct([input.name, input.supplierDescription, input.category]);
      const product = await tx.product.create({ data: { companyId: input.companyId, name: input.name.trim(), sku: input.sku.trim(), classificationCode: input.classificationCode?.trim(), supplierDescription: input.supplierDescription?.trim(), supplierName: input.supplierName?.trim(), lastPurchasedAt: input.lastPurchasedAt ? new Date(input.lastPurchasedAt) : undefined, category: input.category?.trim(), trackStock: input.trackStock ?? true, fifoEnabledAt: input.initialQuantity ? null : new Date(), ...searchFields, uoms: { create: normalizedUnits.map((unit) => ({ code: unit.code, name: unit.name, conversionFactor: unit.conversionFactor, isBase: Math.abs(unit.conversionFactor - 1) < 0.000001 })) } } });
      await this.refreshGeneratedAliases(tx, product.id, [product.name, product.supplierDescription, product.category]);
      const uoms = await tx.productUOM.findMany({ where: { productId: product.id } });
      await tx.productPrice.createMany({ data: normalizedUnits.map((unit) => ({ productId: product.id, priceLevelId: retail.id, uomId: uoms.find((row) => row.code === unit.code)!.id, amount: unit.salePrice })) });
      const purchaseRows = normalizedUnits.filter((unit) => unit.purchasePrice !== undefined).map((unit) => ({ productId: product.id, uomId: uoms.find((row) => row.code === unit.code)!.id, amount: unit.purchasePrice! }));
      if (purchaseRows.length) await tx.productPurchasePrice.createMany({ data: purchaseRows });
      const base = normalizedUnits.find((unit) => Math.abs(unit.conversionFactor - 1) < 0.000001)!;
      if (base.purchasePrice !== undefined) await tx.product.update({ where: { id: product.id }, data: { basePurchaseCost: base.purchasePrice } });
      if (input.barcode?.trim()) await tx.productBarcode.create({ data: { productId: product.id, barcode: input.barcode.trim(), uomId: uoms.find((row) => row.code === base.code)?.id } });
      if (input.initialQuantity !== undefined) {
        if (!input.locationId) throw new BadRequestException('Choose a store before setting initial quantity');
        const location = await tx.location.findFirst({ where: { id: input.locationId, companyId: input.companyId } });
        if (!location) throw new NotFoundException('Store was not found');
        const snapshot = await tx.stockSnapshot.create({ data: { productId: product.id, locationId: location.id, quantity: input.initialQuantity } });
        const unitCost = base.purchasePrice == null ? null : new Prisma.Decimal(base.purchasePrice);
        const quantity = new Prisma.Decimal(input.initialQuantity);
        await recordInventoryLedger(tx, { companyId: input.companyId, locationId: location.id, productId: product.id, actorId: input.actorId, sourceType: 'OPENING_BALANCE', type: 'ADJUSTMENT', quantityDelta: quantity, unitCost, valueDelta: unitCost == null ? null : quantity.mul(unitCost), runningQuantity: quantity, runningValue: unitCost == null ? null : quantity.mul(unitCost), averageUnitCost: unitCost, costStatus: unitCost == null ? 'UNVALUED' : 'FINAL', referenceType: 'INITIAL_STOCK', referenceId: snapshot.id, reason: 'Initial stock entered when product was created' });
        await tx.inventoryBatch.create({ data: { id: `legacy-${product.id}-${location.id}`, companyId: input.companyId, locationId: location.id, productId: product.id, uomId: uoms.find((row) => row.code === base.code)!.id, displayBatchId: `LEGACY-${product.sku}-${location.code}`, receivedQuantity: quantity, remainingQuantity: quantity, purchaseUnitCost: unitCost, landedCostPerUnit: 0, finalUnitCost: unitCost, totalBatchValue: unitCost == null ? null : quantity.mul(unitCost), receivedAt: new Date(), status: 'DRAFT', sourceType: 'OPENING_LEGACY', importedById: input.actorId } });
      }
      await tx.auditLog.create({ data: { companyId: input.companyId, actorId: input.actorId, action: 'LOCAL_PRODUCT_CREATED', entityType: 'Product', entityId: product.id, after: { sku: product.sku, name: product.name, localOnly: true } } });
      return { id: product.id, sku: product.sku, name: product.name, source: 'LOCAL', note: 'This item is local only until a Bukku product-write mapping is verified.' };
    });
  }

  async listContacts(input: ManagerRequestDto, query?: string) {
    await this.assertPermission(input, 'contact.manage');
    const term = query?.trim();
    return this.db.customer.findMany({ where: { companyId: input.companyId, ...(term ? { OR: [{ contactCode: { contains: term, mode: 'insensitive' } }, { name: { contains: term, mode: 'insensitive' } }, { phone: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }, { registrationNo: { contains: term, mode: 'insensitive' } }] } : {}) }, orderBy: { name: 'asc' }, take: 100 });
  }

  async createContact(input: CreateManagedContactDto) {
    await this.assertPermission(input, 'contact.manage');
    const name = input.name.trim(); const phone = input.phone?.trim() || undefined; const email = input.email?.trim() || undefined; const organization = input.company?.trim() || undefined;
    const duplicateRules: Prisma.CustomerWhereInput[] = [{ name: { equals: name, mode: 'insensitive' }, organization: organization ?? null }];
    if (phone) duplicateRules.push({ phone: { equals: phone, mode: 'insensitive' } });
    if (email) duplicateRules.push({ email: { equals: email, mode: 'insensitive' } });
    const duplicate = await this.db.customer.findFirst({ where: { companyId: input.companyId, OR: duplicateRules } });
    if (duplicate) throw new ConflictException(`This contact already exists (${duplicate.name})`);
    const contactCode = input.contactCode?.trim().toUpperCase() || await this.nextContactCode(input.companyId, name);
    const sameCode = await this.db.customer.findFirst({ where: { companyId: input.companyId, contactCode } });
    if (sameCode) throw new ConflictException(`Contact code ${contactCode} already exists`);
    const customer = await this.db.customer.create({ data: { companyId: input.companyId, contactCode, entityType: input.entityType, contactTypes: [...new Set(input.contactTypes)], name, registrationNoType: input.registrationNoType, registrationNo: input.registrationNo?.trim(), oldRegistrationNo: input.oldRegistrationNo?.trim(), phone, email, taxId: input.taxId?.trim(), sstRegistrationNo: input.sstRegistrationNo?.trim(), organization, address: input.address?.trim(), city: input.city?.trim(), state: input.state?.trim(), postcode: input.postcode?.trim(), countryCode: input.countryCode?.trim().toUpperCase() || 'MY', remarks: input.remarks?.trim() } });
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: input.actorId, action: 'LOCAL_CONTACT_CREATED', entityType: 'Customer', entityId: customer.id, after: { contactCode: customer.contactCode, entityType: customer.entityType, contactTypes: customer.contactTypes, name: customer.name, localOnly: true } } });
    return { ...customer, note: 'This contact is local only until a Bukku contact-write mapping is verified.' };
  }

  private async assertPermission(input: ManagerRequestDto, permission: string) {
    const actor = await this.db.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } });
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!actor || !permissions.includes(permission)) throw new ForbiddenException('Manager access is required');
  }

  private async assertAnyPermission(input: ManagerRequestDto, required: string[]) {
    const actor = await this.db.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } });
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!actor || !required.some((permission) => permissions.includes(permission))) throw new ForbiddenException('You do not have access to settings');
  }

  private jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
  }

  private productView(product: ManagedProduct, imported: boolean, externalId?: string) {
    return { id: product.id, sku: product.sku, name: product.name, barcode: product.barcodes[0]?.barcode ?? null, aliases: product.aliases.map((alias) => ({ id: alias.id, text: alias.text, source: alias.source })), classificationCode: product.classificationCode, supplierDescription: product.supplierDescription, supplierName: product.supplierName, lastPurchasedAt: product.lastPurchasedAt, category: product.category, active: product.active, deletedAt: product.deletedAt, status: product.deletedAt ? 'Deleted' : product.active ? 'Active' : 'Deactivated', trackStock: product.trackStock, basePurchaseCost: product.basePurchaseCost == null ? null : Number(product.basePurchaseCost), source: imported ? 'BUKKU' : 'LOCAL', externalId: externalId ?? null, uoms: product.uoms.map((uom) => ({ id: uom.id, code: uom.code, name: uom.name, conversionFactor: Number(uom.conversionFactor), salePrice: product.prices.find((price) => price.uomId === uom.id && price.priceLevel.code === 'RETAIL')?.amount == null ? null : Number(product.prices.find((price) => price.uomId === uom.id && price.priceLevel.code === 'RETAIL')!.amount), purchasePrice: product.purchasePrices.find((price) => price.uomId === uom.id)?.amount == null ? null : Number(product.purchasePrices.find((price) => price.uomId === uom.id)?.amount) })) };
  }

  private async productHistoryImpact(companyId: string, productId: string) {
    const [sales, returns, stockMovements, stockSnapshots, inventoryBatches, aliases, bukkuReferences, batchRows, auditHistory] = await Promise.all([
      this.db.saleItem.count({ where: { productId } }), this.db.returnItem.count({ where: { productId } }), this.db.inventoryLedgerEntry.count({ where: { productId } }), this.db.stockSnapshot.count({ where: { productId } }), this.db.inventoryBatch.count({ where: { productId } }), this.db.productAlias.count({ where: { productId } }), this.db.externalReference.count({ where: { companyId, entityType: 'PRODUCT', localId: productId } }), this.db.batchUpdateRow.count({ where: { productId } }), this.db.auditLog.count({ where: { companyId, entityType: 'Product', entityId: productId, action: { notIn: ['LOCAL_PRODUCT_CREATED', 'PRODUCT_CREATED'] } } }),
    ]);
    const relatedRecords = { sales, returns, stockMovements, stockSnapshots, inventoryBatches, aliases, bukkuReferences, batchRows, auditHistory }; const totalRelatedRecords = Object.values(relatedRecords).reduce((sum, count) => sum + count, 0);
    return { hardDeleteAllowed: totalRelatedRecords === 0, recommendedAction: 'DEACTIVATE', deleteAction: totalRelatedRecords === 0 ? 'HARD_DELETE' : 'ARCHIVE', totalRelatedRecords, relatedRecords };
  }

  private async refreshGeneratedAliases(tx: Prisma.TransactionClient, productId: string, values: Array<string | null | undefined>) {
    const aliases = generatedAliasesForProduct(values);
    await tx.productAlias.deleteMany({ where: { productId, source: 'GENERATED' } });
    if (aliases.length) await tx.productAlias.createMany({ data: aliases.map((text) => { const normalized = normalizeProductText(text); return { productId, text, normalizedToken: normalized.token, normalizedCompact: normalized.compact, source: 'GENERATED' as const }; }), skipDuplicates: true });
  }

  private async rebuildProductSearchFields(productId: string) {
    const product = await this.db.product.findUnique({ where: { id: productId }, include: { aliases: { select: { text: true } } } });
    if (!product) return;
    await this.db.product.update({ where: { id: product.id }, data: structuredSearchFieldsForProduct([product.name, product.supplierDescription, product.category, ...product.aliases.map((alias) => alias.text)]) });
  }

  private async nextContactCode(companyId: string, name: string) {
    const first = (name.match(/[A-Za-z0-9]/)?.[0] || 'X').toUpperCase();
    let serial = await this.db.customer.count({ where: { companyId } }) + 1;
    while (await this.db.customer.findFirst({ where: { companyId, contactCode: `C-${first}${String(serial).padStart(4, '0')}` }, select: { id: true } })) serial += 1;
    return `C-${first}${String(serial).padStart(4, '0')}`;
  }

  private stringRecord(value: Prisma.JsonValue | null): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: Record<string, string> = {};
    for (const [method, accountId] of Object.entries(value)) if (typeof accountId === 'string' && accountId.trim()) result[method] = accountId.trim();
    return result;
  }

  private roundMoney(value: number) { return Number(value.toFixed(2)); }

  private profileView(company: { id: string; name: string; code: string; legalName: string | null; registrationNo: string | null; tin: string | null; brnNew: string | null; brnOld: string | null; address: string | null; officePhone: string | null; phone: string | null; email: string | null; receiptFooter: string | null; receiptPaperWidthMm: number; printerConnectionMethod: string; printerLanHost: string | null; printerLanPort: number; printerWindowsQueue: string | null; printerSerialPort: string | null; printerSerialBaudRate: number; printerProfileName: string; printerFallbackMethod: string | null; printerFallbackLanHost: string | null; printerFallbackLanPort: number | null; receiptTemplate: string; receiptDividerStyle: string; receiptShowLogo: boolean; receiptShowSku: boolean; receiptChineseMode: string; customerEInvoiceRequestsEnabled: boolean; bukkuDailyInvoiceEnabled: boolean; bukkuDailyInvoiceContactId: string | null; bukkuDailyInvoiceLocationId: string | null; bukkuDailyInvoiceRevenueAccountId: string | null; bukkuDailyInvoiceTaxCodeId: string | null; bukkuDailyInvoicePaymentAccounts: Prisma.JsonValue | null }) {
    return { id: company.id, name: company.name, code: company.code, legalName: company.legalName, registrationNo: company.registrationNo, tin: company.tin, brnNew: company.brnNew, brnOld: company.brnOld, address: company.address, officePhone: company.officePhone, phone: company.phone, email: company.email, receiptFooter: company.receiptFooter, receiptPaperWidthMm: company.receiptPaperWidthMm, printerConnectionMethod: company.printerConnectionMethod, printerLanHost: company.printerLanHost, printerLanPort: company.printerLanPort, printerWindowsQueue: company.printerWindowsQueue, printerSerialPort: company.printerSerialPort, printerSerialBaudRate: company.printerSerialBaudRate, printerProfileName: company.printerProfileName, printerFallbackMethod: company.printerFallbackMethod, printerFallbackLanHost: company.printerFallbackLanHost, printerFallbackLanPort: company.printerFallbackLanPort, receiptTemplate: company.receiptTemplate, receiptDividerStyle: company.receiptDividerStyle, receiptShowLogo: company.receiptShowLogo, receiptShowSku: company.receiptShowSku, receiptChineseMode: company.receiptChineseMode, customerEInvoiceRequestsEnabled: company.customerEInvoiceRequestsEnabled, bukkuDailyInvoiceEnabled: company.bukkuDailyInvoiceEnabled, bukkuDailyInvoiceContactId: company.bukkuDailyInvoiceContactId, bukkuDailyInvoiceLocationId: company.bukkuDailyInvoiceLocationId, bukkuDailyInvoiceRevenueAccountId: company.bukkuDailyInvoiceRevenueAccountId, bukkuDailyInvoiceTaxCodeId: company.bukkuDailyInvoiceTaxCodeId, bukkuDailyInvoicePaymentAccounts: company.bukkuDailyInvoicePaymentAccounts };
  }
}
