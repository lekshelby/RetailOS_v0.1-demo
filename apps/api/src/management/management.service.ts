import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateManagedContactDto, CreateManagedProductDto, ManagerRequestDto, UpdateCompanyProfileDto, UpdateManagedProductDto } from './dto/management.dto';

type ManagedProduct = Prisma.ProductGetPayload<{ include: { uoms: true; barcodes: true; prices: { include: { priceLevel: true } }; purchasePrices: true } }>;

@Injectable()
export class ManagementService {
  constructor(private readonly db: PrismaService) {}

  async profile(input: ManagerRequestDto) {
    await this.assertAnyPermission(input, ['company.manage', 'printer.manage']);
    const company = await this.db.company.findUnique({ where: { id: input.companyId } });
    if (!company) throw new NotFoundException('Company was not found');
    return this.profileView(company);
  }

  async updateProfile(input: UpdateCompanyProfileDto) {
    const printerOnly = input.receiptFooter !== undefined || input.receiptPaperWidthMm !== undefined || input.printerConnectionMethod !== undefined || input.printerLanHost !== undefined || input.printerLanPort !== undefined || input.printerWindowsQueue !== undefined || input.printerSerialPort !== undefined || input.printerSerialBaudRate !== undefined;
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
    };
    if (input.receiptPaperWidthMm !== undefined) data.receiptPaperWidthMm = input.receiptPaperWidthMm;
    if (input.printerConnectionMethod !== undefined) data.printerConnectionMethod = input.printerConnectionMethod;
    if (input.printerLanPort !== undefined) data.printerLanPort = input.printerLanPort;
    if (input.printerSerialBaudRate !== undefined) data.printerSerialBaudRate = input.printerSerialBaudRate;
    const company = await this.db.company.update({ where: { id: input.companyId }, data });
    await this.db.auditLog.create({ data: { companyId: company.id, actorId: input.actorId, action: 'COMPANY_PROFILE_UPDATED', entityType: 'Company', entityId: company.id, after: this.profileView(company) } });
    return this.profileView(company);
  }

  async listProducts(input: ManagerRequestDto, query?: string) {
    await this.assertPermission(input, 'catalog.manage');
    const term = query?.trim();
    const products = await this.db.product.findMany({
      where: { companyId: input.companyId, ...(term ? { OR: [{ sku: { contains: term, mode: 'insensitive' } }, { name: { contains: term, mode: 'insensitive' } }, { barcodes: { some: { barcode: { contains: term, mode: 'insensitive' } } } }] } : {}) },
      include: { uoms: { orderBy: [{ isBase: 'desc' }, { name: 'asc' }] }, barcodes: true, prices: { include: { priceLevel: true } }, purchasePrices: true },
      orderBy: { name: 'asc' }, take: 100,
    });
    const refs = await this.db.externalReference.findMany({ where: { companyId: input.companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: { in: products.map((product) => product.id) } }, select: { localId: true } });
    const imported = new Set(refs.map((reference) => reference.localId));
    return products.map((product) => this.productView(product, imported.has(product.id)));
  }

  async product(id: string, input: ManagerRequestDto) {
    await this.assertPermission(input, 'catalog.manage');
    const product = await this.db.product.findFirst({ where: { id, companyId: input.companyId }, include: { uoms: { orderBy: [{ isBase: 'desc' }, { name: 'asc' }] }, barcodes: true, prices: { include: { priceLevel: true } }, purchasePrices: true } });
    if (!product) throw new NotFoundException('Product was not found');
    const ref = await this.db.externalReference.findFirst({ where: { companyId: input.companyId, provider: 'BUKKU', entityType: 'PRODUCT', localId: product.id } });
    return this.productView(product, Boolean(ref), ref?.externalId);
  }

  async updateProduct(id: string, input: UpdateManagedProductDto) {
    await this.assertPermission(input, 'catalog.manage');
    return this.db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id, companyId: input.companyId }, include: { uoms: true, barcodes: true } });
      if (!product) throw new NotFoundException('Product was not found');
      const name = input.name?.trim(); const sku = input.sku?.trim();
      if (sku && sku !== product.sku && await tx.product.findFirst({ where: { companyId: input.companyId, sku } })) throw new ConflictException('That SKU already exists');
      if (name && name !== product.name && await tx.product.findFirst({ where: { companyId: input.companyId, name: { equals: name, mode: 'insensitive' } } })) throw new ConflictException('That product name already exists');
      const barcode = input.barcode?.trim();
      if (barcode && product.barcodes[0]?.barcode !== barcode) {
        const match = await tx.productBarcode.findUnique({ where: { barcode } });
        if (match && match.productId !== product.id) throw new ConflictException('That barcode already belongs to another product');
      }
      const updated = await tx.product.update({ where: { id: product.id }, data: {
        ...(name !== undefined ? { name: name || product.name } : {}), ...(sku !== undefined ? { sku: sku || product.sku } : {}),
        ...(input.classificationCode !== undefined ? { classificationCode: input.classificationCode.trim() || null } : {}),
        ...(input.supplierDescription !== undefined ? { supplierDescription: input.supplierDescription.trim() || null } : {}),
        ...(input.supplierName !== undefined ? { supplierName: input.supplierName.trim() || null } : {}),
        ...(input.lastPurchasedAt !== undefined ? { lastPurchasedAt: input.lastPurchasedAt ? new Date(input.lastPurchasedAt) : null } : {}),
        ...(input.category !== undefined ? { category: input.category.trim() || null } : {}),
        ...(input.trackStock !== undefined ? { trackStock: input.trackStock } : {}), ...(input.active !== undefined ? { active: input.active } : {}),
      } });
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
      const product = await tx.product.create({ data: { companyId: input.companyId, name: input.name.trim(), sku: input.sku.trim(), classificationCode: input.classificationCode?.trim(), supplierDescription: input.supplierDescription?.trim(), supplierName: input.supplierName?.trim(), lastPurchasedAt: input.lastPurchasedAt ? new Date(input.lastPurchasedAt) : undefined, category: input.category?.trim(), trackStock: input.trackStock ?? true, uoms: { create: normalizedUnits.map((unit) => ({ code: unit.code, name: unit.name, conversionFactor: unit.conversionFactor, isBase: Math.abs(unit.conversionFactor - 1) < 0.000001 })) } } });
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
        await tx.stockSnapshot.create({ data: { productId: product.id, locationId: location.id, quantity: input.initialQuantity } });
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

  private productView(product: ManagedProduct, imported: boolean, externalId?: string) {
    return { id: product.id, sku: product.sku, name: product.name, barcode: product.barcodes[0]?.barcode ?? null, classificationCode: product.classificationCode, supplierDescription: product.supplierDescription, supplierName: product.supplierName, lastPurchasedAt: product.lastPurchasedAt, category: product.category, active: product.active, trackStock: product.trackStock, basePurchaseCost: product.basePurchaseCost == null ? null : Number(product.basePurchaseCost), source: imported ? 'BUKKU' : 'LOCAL', externalId: externalId ?? null, uoms: product.uoms.map((uom) => ({ id: uom.id, code: uom.code, name: uom.name, conversionFactor: Number(uom.conversionFactor), salePrice: product.prices.find((price) => price.uomId === uom.id && price.priceLevel.code === 'RETAIL')?.amount == null ? null : Number(product.prices.find((price) => price.uomId === uom.id && price.priceLevel.code === 'RETAIL')!.amount), purchasePrice: product.purchasePrices.find((price) => price.uomId === uom.id)?.amount == null ? null : Number(product.purchasePrices.find((price) => price.uomId === uom.id)?.amount) })) };
  }

  private async nextContactCode(companyId: string, name: string) {
    const first = (name.match(/[A-Za-z0-9]/)?.[0] || 'X').toUpperCase();
    let serial = await this.db.customer.count({ where: { companyId } }) + 1;
    while (await this.db.customer.findFirst({ where: { companyId, contactCode: `C-${first}${String(serial).padStart(4, '0')}` }, select: { id: true } })) serial += 1;
    return `C-${first}${String(serial).padStart(4, '0')}`;
  }

  private profileView(company: { id: string; name: string; code: string; legalName: string | null; registrationNo: string | null; tin: string | null; brnNew: string | null; brnOld: string | null; address: string | null; officePhone: string | null; phone: string | null; email: string | null; receiptFooter: string | null; receiptPaperWidthMm: number; printerConnectionMethod: string; printerLanHost: string | null; printerLanPort: number; printerWindowsQueue: string | null; printerSerialPort: string | null; printerSerialBaudRate: number }) {
    return { id: company.id, name: company.name, code: company.code, legalName: company.legalName, registrationNo: company.registrationNo, tin: company.tin, brnNew: company.brnNew, brnOld: company.brnOld, address: company.address, officePhone: company.officePhone, phone: company.phone, email: company.email, receiptFooter: company.receiptFooter, receiptPaperWidthMm: company.receiptPaperWidthMm, printerConnectionMethod: company.printerConnectionMethod, printerLanHost: company.printerLanHost, printerLanPort: company.printerLanPort, printerWindowsQueue: company.printerWindowsQueue, printerSerialPort: company.printerSerialPort, printerSerialBaudRate: company.printerSerialBaudRate };
  }
}
