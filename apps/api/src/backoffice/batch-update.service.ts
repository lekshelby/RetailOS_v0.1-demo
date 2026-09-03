import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../database/prisma.service';
import { latestInventoryCost, recordInventoryLedger } from '../inventory/inventory-ledger';
import { adjustFifoInventory, assertFifoStockInvariant } from '../inventory/fifo';
import { structuredSearchFieldsForProduct } from '../products/product-search';
import { BatchActorDto, BatchResultQueryDto, BatchTemplateQueryDto, BatchUpdateType, CommitBatchDto, PreviewBatchDto, PRODUCT_BATCH_TYPE } from './dto/batch-update.dto';
import { parseImportFile, rowsCsv, templateCsv } from './batch-spreadsheet';

type BatchRecord = { id: string; companyId: string; type: BatchUpdateType; checksum: string; fileName: string; mimeType: string; status: string; createdById: string; confirmedById: string | null; approvedById: string | null; rowCount: number; validRowCount: number; invalidRowCount: number; duplicateRowCount: number; highRisk: boolean; summary: unknown; createdAt: Date; committedAt: Date | null };
type BatchRowRecord = { id: string; batchId: string; rowNumber: number; productId: string | null; locationId: string | null; input: unknown; valid: boolean; duplicate: boolean; errors: string[]; beforeQuantity: Prisma.Decimal | null; requestedQuantity: Prisma.Decimal | null; afterQuantity: Prisma.Decimal | null; beforeValue: Prisma.Decimal | null; afterValue: Prisma.Decimal | null; costStatus: string | null; result: unknown };
type ProductData = Prisma.ProductGetPayload<{ include: { barcodes: true; uoms: true; aliases: true; prices: { include: { priceLevel: true } } } }>;
type LatestCostRow = { productId: string; locationId: string; averageUnitCost: Prisma.Decimal | null; runningValue: Prisma.Decimal | null; costStatus: string };
type Operation = Record<string, string | number | boolean | null>;
type PreviewRow = { id: string; rowNumber: number; productId: string | null; productName: string | null; sku: string | null; locationId: string | null; location: string | null; operation: Operation; valid: boolean; duplicate: boolean; errors: string[]; beforeQuantity: Prisma.Decimal | null; requestedQuantity: Prisma.Decimal | null; afterQuantity: Prisma.Decimal | null; beforeValue: Prisma.Decimal | null; afterValue: Prisma.Decimal | null; costStatus: string | null; warnings: string[] };
type DeleteImpact = { hardDeleteAllowed: boolean; relatedRecords: Record<string, number>; totalRelatedRecords: number; action: 'HARD_DELETE' | 'ARCHIVE' };

const ACTIONS = ['create', 'update', 'adjust_stock', 'deactivate', 'reactivate', 'delete', 'receive_purchase'] as const;
const HIGH_VALUE_RM = new Prisma.Decimal(10_000);
const HIGH_VOLUME_UNITS = new Prisma.Decimal(1_000);
const HIGH_ROW_COUNT = 100;
const MANAGER_REAUTH_MS = 5 * 60 * 1000;
const managerPermissions = ['backoffice.view', 'company.manage'];

@Injectable()
export class BatchUpdateService {
  constructor(private readonly db: PrismaService, private readonly sessions: SessionService) {}

  async template(input: BatchTemplateQueryDto) {
    await this.assertManager(input);
    return { content: templateCsv(), fileName: 'retailos-product-batch-template.csv', mimeType: 'text/csv; charset=utf-8' };
  }

  async preview(input: PreviewBatchDto) {
    await this.assertManager(input);
    const raw = this.decodeBase64(input.contentBase64);
    const checksum = createHash('sha256').update(raw).digest('hex');
    const existing = await this.db.$queryRaw<BatchRecord[]>(Prisma.sql`SELECT ${this.batchColumns()} FROM "BatchUpdate" WHERE "companyId"=${input.companyId} AND "type"=${PRODUCT_BATCH_TYPE} AND "checksum"=${checksum} LIMIT 1`);
    if (existing[0]) return this.view(existing[0], await this.rows(existing[0].id), true);
    let imported: Record<string, string>[];
    try { imported = parseImportFile(raw, input.fileName); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'The CSV could not be read'); }
    if (!imported.length) throw new BadRequestException('The CSV contains no non-sample data rows');
    if (imported.length > 5_000) throw new BadRequestException('A batch may contain at most 5,000 data rows');

    const [products, locations, snapshots, latestCosts] = await Promise.all([
      this.db.product.findMany({ where: { companyId: input.companyId }, include: { barcodes: true, uoms: true, aliases: true, prices: { include: { priceLevel: true } } } }),
      this.db.location.findMany({ where: { companyId: input.companyId }, orderBy: { name: 'asc' } }),
      this.db.stockSnapshot.findMany({ where: { location: { companyId: input.companyId } } }),
      this.db.$queryRaw<LatestCostRow[]>(Prisma.sql`SELECT DISTINCT ON ("productId","locationId") "productId","locationId","averageUnitCost","runningValue","costStatus" FROM "InventoryLedgerEntry" WHERE "companyId"=${input.companyId} ORDER BY "productId","locationId","createdAt" DESC,"id" DESC`),
    ]);
    const snapshotMap = new Map(snapshots.map((row) => [`${row.locationId}:${row.productId}`, row.quantity]));
    const costMap = new Map(latestCosts.map((row) => [`${row.locationId}:${row.productId}`, row]));
    const previewRows: PreviewRow[] = [];
    for (let index = 0; index < imported.length; index++) previewRows.push(await this.validateRow(imported[index], index + 2, products, locations, snapshotMap, costMap, input.companyId));
    const duplicateKeys = new Map<string, number>();
    for (const row of previewRows) if (row.operation.duplicateKey) duplicateKeys.set(String(row.operation.duplicateKey), (duplicateKeys.get(String(row.operation.duplicateKey)) ?? 0) + 1);
    for (const row of previewRows) if (row.operation.duplicateKey && (duplicateKeys.get(String(row.operation.duplicateKey)) ?? 0) > 1) { row.duplicate = true; row.valid = false; row.errors.push('Duplicate action and SKU in this file'); }
    const summary = this.summary(previewRows); const batchId = randomUUID();
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`INSERT INTO "BatchUpdate" ("id","companyId","type","checksum","fileName","mimeType","rawFile","status","createdById","rowCount","validRowCount","invalidRowCount","duplicateRowCount","highRisk","summary") VALUES (${batchId},${input.companyId},${PRODUCT_BATCH_TYPE},${checksum},${input.fileName},${input.mimeType},${raw},'PREVIEWED',${input.actorId},${previewRows.length},${summary.validRows},${summary.invalidRows},${summary.duplicateRows},${summary.highRisk},${JSON.stringify(summary)}::jsonb)`);
      for (const row of previewRows) {
        const errors = row.errors.length ? Prisma.sql`ARRAY[${Prisma.join(row.errors)}]::TEXT[]` : Prisma.sql`ARRAY[]::TEXT[]`;
        await tx.$executeRaw(Prisma.sql`INSERT INTO "BatchUpdateRow" ("id","batchId","rowNumber","productId","locationId","input","valid","duplicate","errors","beforeQuantity","requestedQuantity","afterQuantity","beforeValue","afterValue","costStatus") VALUES (${row.id},${batchId},${row.rowNumber},${row.productId},${row.locationId},${JSON.stringify(row.operation)}::jsonb,${row.valid},${row.duplicate},${errors},${row.beforeQuantity},${row.requestedQuantity},${row.afterQuantity},${row.beforeValue},${row.afterValue},${row.costStatus})`);
      }
      await tx.auditLog.create({ data: { companyId: input.companyId, actorId: input.actorId, action: 'BATCH_UPDATE_PREVIEWED', entityType: 'BatchUpdate', entityId: batchId, after: { type: PRODUCT_BATCH_TYPE, checksum, sourceFileName: input.fileName, ...summary } } });
    });
    return this.view(await this.batch(batchId, input.companyId), await this.rows(batchId), false);
  }

  async get(id: string, input: BatchActorDto) { await this.assertManager(input); return this.view(await this.batch(id, input.companyId), await this.rows(id), false); }

  async commit(id: string, input: CommitBatchDto, approvalToken?: string) {
    const actor = await this.assertManager(input);
    if (!input.confirmed) throw new BadRequestException('Explicit manager confirmation is required before committing a batch');
    const batch = await this.batch(id, input.companyId);
    if (batch.status === 'COMMITTED') return this.view(batch, await this.rows(id), true);
    if (batch.status !== 'PREVIEWED') throw new ConflictException(`Batch status ${batch.status} cannot be committed`);
    if (batch.invalidRowCount || batch.duplicateRowCount) throw new UnprocessableEntityException('Every invalid or duplicate row must be corrected before this all-or-nothing batch can be committed');
    const rows = await this.rows(id); const highRisk = this.summary(rows.map((row) => this.previewFromStored(row))).highRisk;
    if (rows.some((row) => Boolean(this.operation(row).createsFifoShortage)) && !input.stockShortageAcknowledged) throw new UnprocessableEntityException('Manager acknowledgement is required because this batch creates FIFO shortage stock');
    const approvedById = highRisk ? await this.assertFreshApproval(input.companyId, approvalToken) : actor.id;
    try {
      await this.db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<BatchRecord[]>(Prisma.sql`SELECT ${this.batchColumns()} FROM "BatchUpdate" WHERE "id"=${id} AND "companyId"=${input.companyId} FOR UPDATE`);
        if (!locked[0]) throw new NotFoundException('Batch was not found');
        if (locked[0].status === 'COMMITTED') return;
        for (const row of [...rows].sort((a, b) => a.rowNumber - b.rowNumber)) await this.commitRow(tx, batch, row, actor.id, approvedById, Boolean(input.stockShortageAcknowledged));
        const committedAt = new Date(); const totals = this.commitTotals(rows);
        await tx.$executeRaw(Prisma.sql`UPDATE "BatchUpdate" SET "status"='COMMITTED',"confirmedById"=${actor.id},"approvedById"=${approvedById},"highRisk"=${highRisk},"summary"=${JSON.stringify({ ...(batch.summary as object ?? {}), ...totals })}::jsonb,"committedAt"=${committedAt} WHERE "id"=${id}`);
        await tx.auditLog.create({ data: { companyId: input.companyId, actorId: actor.id, action: 'BATCH_UPDATE_COMMITTED', entityType: 'BatchUpdate', entityId: id, reason: `Committed ${batch.fileName}`, metadata: { checksum: batch.checksum, uploaderId: batch.createdById, approvingManagerId: approvedById, sourceFileName: batch.fileName, skus: rows.map((row) => String(this.operation(row).sku)) }, after: { ...totals, committedAt: committedAt.toISOString() } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException || error instanceof NotFoundException || error instanceof UnprocessableEntityException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException('Data changed during commit. Review the CSV again before retrying');
      throw error;
    }
    return this.view(await this.batch(id, input.companyId), await this.rows(id), false);
  }

  async result(id: string, input: BatchResultQueryDto) {
    await this.assertManager(input); const batch = await this.batch(id, input.companyId); const rows = await this.rows(id);
    const selected = input.errorsOnly ? rows.filter((row) => !row.valid || row.duplicate) : rows;
    const records = selected.map((row) => ({ row_number: row.rowNumber, sku: this.operation(row).sku, action: this.operation(row).action, current_value: this.operation(row).currentValue, proposed_value: this.operation(row).proposedValue, valid: row.valid, duplicate: row.duplicate, error: row.errors.join('; '), result: row.result }));
    const suffix = input.errorsOnly ? 'errors' : 'results';
    return { content: rowsCsv(records), fileName: `retailos-batch-${id}-${suffix}.csv`, mimeType: 'text/csv; charset=utf-8' };
  }

  private async validateRow(raw: Record<string, string>, rowNumber: number, products: ProductData[], locations: Array<{ id: string; name: string; code: string }>, snapshots: Map<string, Prisma.Decimal>, costs: Map<string, LatestCostRow>, companyId: string): Promise<PreviewRow> {
    const errors: string[] = []; const warnings: string[] = []; const action = raw.action.trim().toLowerCase(); const sku = raw.sku.trim();
    if (!ACTIONS.includes(action as typeof ACTIONS[number])) errors.push(`action must be one of: ${ACTIONS.join(', ')}`);
    if (!sku) errors.push(action === 'create' ? 'SKU is required by the current product rules' : 'SKU is required');
    const matches = sku ? products.filter((product) => product.sku.toLowerCase() === sku.toLowerCase()) : [];
    const product = matches.length === 1 ? matches[0] : null;
    if (action === 'create' && product) errors.push(`SKU ${sku} already exists`);
    if (action !== 'create' && ACTIONS.includes(action as typeof ACTIONS[number]) && !product) errors.push(`Unknown SKU: ${sku}`);
    const populated = (field: string) => Boolean(raw[field]?.trim());
    const operation: Operation = { action, sku, duplicateKey: sku && action ? `${action}:${sku.toLowerCase()}` : null, productName: product?.name ?? raw.product_name, currentValue: null, proposedValue: null };
    let location = locations.length === 1 ? locations[0] : null; let beforeQuantity: Prisma.Decimal | null = null; let requestedQuantity: Prisma.Decimal | null = null; let afterQuantity: Prisma.Decimal | null = null; let beforeValue: Prisma.Decimal | null = null; let afterValue: Prisma.Decimal | null = null; let costStatus: string | null = null;

    if (action === 'create') {
      if (!populated('product_name')) errors.push('product_name is required for create');
      const price = this.decimal(raw.selling_price, 'selling_price', errors, 2, true); if (price && !price.greaterThan(0)) errors.push('selling_price must be greater than zero');
      if (!populated('unit')) errors.push('unit is required for create');
      if (populated('barcode') && products.some((candidate) => candidate.barcodes.some((item) => item.barcode === raw.barcode))) errors.push(`Barcode ${raw.barcode} already exists`);
      const status = this.status(raw.status, errors, true);
      operation.currentValue = null; operation.proposedValue = JSON.stringify({ name: raw.product_name, barcode: raw.barcode || null, category: raw.category || null, supplierDescription: raw.supplier_description || null, unit: raw.unit.toUpperCase(), sellingPrice: price?.toFixed(2), status });
      Object.assign(operation, { name: raw.product_name, barcode: raw.barcode || null, category: raw.category || null, supplierDescription: raw.supplier_description || null, unit: raw.unit.toUpperCase(), sellingPrice: price?.toFixed(2) ?? null, active: status !== 'deactivated' });
    } else if (action === 'update' && product) {
      const fields = ['barcode', 'product_name', 'category', 'supplier_description', 'unit', 'selling_price']; if (!fields.some(populated)) errors.push('Populate at least one editable field for update');
      const price = populated('selling_price') ? this.decimal(raw.selling_price, 'selling_price', errors, 2, false) : null; if (price?.isNegative()) errors.push('selling_price cannot be negative');
      if (populated('barcode') && products.some((candidate) => candidate.id !== product.id && candidate.barcodes.some((item) => item.barcode === raw.barcode))) errors.push(`Barcode ${raw.barcode} already exists`);
      const uom = populated('unit') ? product.uoms.find((item) => item.code.toLowerCase() === raw.unit.toLowerCase() || item.name.toLowerCase() === raw.unit.toLowerCase()) : null; if (populated('unit') && !uom) errors.push(`Unit ${raw.unit} does not belong to ${sku}`);
      const base = uom ?? product.uoms.find((item) => item.isBase) ?? product.uoms[0]; const currentPrice = base ? product.prices.find((item) => item.uomId === base.id && item.priceLevel.code === 'RETAIL')?.amount : null;
      operation.currentValue = JSON.stringify({ name: product.name, barcode: product.barcodes[0]?.barcode ?? null, category: product.category, supplierDescription: product.supplierDescription, unit: base?.code ?? null, sellingPrice: currentPrice?.toFixed(2) ?? null });
      operation.proposedValue = JSON.stringify({ name: raw.product_name || product.name, barcode: raw.barcode || product.barcodes[0]?.barcode || null, category: raw.category || product.category, supplierDescription: raw.supplier_description || product.supplierDescription, unit: uom?.code ?? base?.code ?? null, sellingPrice: price?.toFixed(2) ?? currentPrice?.toFixed(2) ?? null });
      Object.assign(operation, { name: raw.product_name || null, barcode: raw.barcode || null, category: raw.category || null, supplierDescription: raw.supplier_description || null, uomId: uom?.id ?? null, sellingPrice: price?.toFixed(2) ?? null });
    } else if (action === 'adjust_stock' && product) {
      if (!location) errors.push('Stock adjustment CSV requires exactly one company location because the simplified template has no location column');
      if (!product.trackStock) errors.push(`Product ${sku} does not track stock`);
      const quantity = this.decimal(raw.stock_quantity, 'stock_quantity', errors, 4, true); if (quantity?.isZero()) errors.push('stock_quantity adjustment cannot be zero');
      if (!populated('stock_adjustment_reason')) errors.push('stock_adjustment_reason is required');
      const adjustmentUnitCost = populated('stock_unit_cost') ? this.decimal(raw.stock_unit_cost, 'stock_unit_cost', errors, 4, false) : null;
      if (adjustmentUnitCost?.isNegative()) errors.push('stock_unit_cost cannot be negative');
      const uom = populated('unit') ? product.uoms.find((item) => item.code.toLowerCase() === raw.unit.toLowerCase() || item.name.toLowerCase() === raw.unit.toLowerCase()) : product.uoms.find((item) => item.isBase) ?? product.uoms[0]; if (!uom) errors.push(`Product ${sku} has no matching stock unit`);
      if (location && uom && quantity) {
        beforeQuantity = snapshots.get(`${location.id}:${product.id}`) ?? new Prisma.Decimal(0); requestedQuantity = quantity.mul(uom.conversionFactor); afterQuantity = beforeQuantity.add(requestedQuantity);
        if (product.fifoEnabledAt && requestedQuantity.greaterThan(0) && adjustmentUnitCost == null) errors.push('stock_unit_cost is required for a positive FIFO stock adjustment');
        if (populated('fifo_override_batch') && !requestedQuantity.isNegative()) errors.push('fifo_override_batch is valid only for a negative stock adjustment');
        if (populated('fifo_override_batch') && !populated('fifo_override_reason')) errors.push('fifo_override_reason is required when selecting an override batch');
        if (populated('fifo_override_batch')) { const selected = await this.db.inventoryBatch.findFirst({ where: { companyId, locationId: location.id, productId: product.id, displayBatchId: raw.fifo_override_batch, status: 'POSTED', remainingQuantity: { gt: 0 } }, select: { id: true } }); if (!selected) errors.push(`FIFO override batch ${raw.fifo_override_batch} is not active for ${sku}`); else operation.fifoOverrideBatchId = selected.id; }
        const cost = costs.get(`${location.id}:${product.id}`); const unitCost = adjustmentUnitCost ?? cost?.averageUnitCost ?? product.basePurchaseCost;
        if (product.fifoEnabledAt) {
          const fifoBatches = await this.db.inventoryBatch.findMany({ where: { companyId, locationId: location.id, productId: product.id, status: { in: ['POSTED', 'SHORTAGE'] } }, orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { displayBatchId: 'asc' }] });
          const aggregateQuantity = fifoBatches.reduce((sum, item) => sum.add(item.remainingQuantity), new Prisma.Decimal(0)); if (!aggregateQuantity.equals(beforeQuantity)) errors.push(`FIFO stock invariant is already broken: snapshot ${beforeQuantity.toFixed(4)}, batches ${aggregateQuantity.toFixed(4)}`);
          beforeValue = fifoBatches.reduce<Prisma.Decimal | null>((sum, item) => sum == null || item.finalUnitCost == null ? null : sum.add(item.remainingQuantity.mul(item.finalUnitCost)), new Prisma.Decimal(0));
          if (requestedQuantity.greaterThan(0)) afterValue = beforeValue == null || adjustmentUnitCost == null ? null : beforeValue.add(requestedQuantity.mul(adjustmentUnitCost));
          else { let remaining = requestedQuantity.abs(); let consumedValue = new Prisma.Decimal(0); let valued = true; const selectedId = operation.fifoOverrideBatchId ? String(operation.fifoOverrideBatchId) : null; const ordered = selectedId ? [...fifoBatches.filter((item) => item.id === selectedId), ...fifoBatches.filter((item) => item.id !== selectedId && item.status === 'POSTED')] : fifoBatches.filter((item) => item.status === 'POSTED'); for (const item of ordered) { if (remaining.isZero()) break; const used = Prisma.Decimal.min(remaining, item.remainingQuantity); if (item.finalUnitCost == null) valued = false; else consumedValue = consumedValue.add(used.mul(item.finalUnitCost)); remaining = remaining.sub(used); } afterValue = beforeValue == null || !valued || remaining.greaterThan(0) ? null : beforeValue.sub(consumedValue); }
          costStatus = afterValue == null ? 'UNVALUED' : afterQuantity.isNegative() ? 'PROVISIONAL' : 'FINAL';
        } else { beforeValue = cost?.runningValue ?? (unitCost == null ? null : beforeQuantity.mul(unitCost)); afterValue = beforeValue == null || unitCost == null ? null : beforeValue.add(requestedQuantity.mul(unitCost)); costStatus = unitCost == null ? 'UNVALUED' : afterQuantity.isNegative() || !cost ? 'PROVISIONAL' : cost.costStatus; }
        Object.assign(operation, { locationId: location.id, location: location.name, uomId: uom.id, stockQuantity: quantity.toFixed(4), quantityDelta: requestedQuantity.toFixed(4), stockUnitCost: adjustmentUnitCost?.toFixed(4) ?? null, reason: raw.stock_adjustment_reason, adjustmentSupplier: raw.stock_adjustment_supplier || null, adjustmentReference: raw.stock_adjustment_reference || null, fifoOverrideReason: raw.fifo_override_reason || null, createsFifoShortage: Boolean(product.fifoEnabledAt && afterQuantity.isNegative()), currentValue: beforeQuantity.toFixed(4), proposedValue: afterQuantity.toFixed(4) });
        if (afterQuantity.isNegative()) warnings.push(`Negative stock will result: ${afterQuantity.toFixed(4)}`); if (costStatus === 'UNVALUED') warnings.push('Unvalued-cost exception');
      }
    } else if (action === 'receive_purchase' && product) {
      if (!location) errors.push('Purchase receipt CSV requires exactly one company location because the simplified template has no location column');
      const received = this.decimal(raw.received_quantity, 'received_quantity', errors, 4, true); if (received && !received.greaterThan(0)) errors.push('received_quantity must be greater than zero');
      const purchaseCost = this.decimal(raw.purchase_unit_cost, 'purchase_unit_cost', errors, 4, true); if (purchaseCost && purchaseCost.isNegative()) errors.push('purchase_unit_cost cannot be negative');
      const landedCost = this.decimal(raw.landed_cost || '0', 'landed_cost', errors, 4, true); if (landedCost?.isNegative()) errors.push('landed_cost cannot be negative');
      if (!populated('supplier')) errors.push('supplier is required'); if (!populated('bukku_reference')) errors.push('bukku_reference is required'); if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.bill_date)) errors.push('bill_date must use YYYY-MM-DD'); if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.received_date)) errors.push('received_date must use YYYY-MM-DD');
      const uom = populated('unit') ? product.uoms.find((item) => item.code.toLowerCase() === raw.unit.toLowerCase() || item.name.toLowerCase() === raw.unit.toLowerCase()) : product.uoms.find((item) => item.isBase) ?? product.uoms[0]; if (!uom) errors.push(`Product ${sku} has no matching purchase unit`);
      if (populated('bukku_reference') && await this.db.purchaseReceipt.findUnique({ where: { companyId_bukkuReference: { companyId, bukkuReference: raw.bukku_reference } } })) errors.push(`Bukku reference ${raw.bukku_reference} already has a RetailOS purchase receipt`);
      if (location && uom && received?.greaterThan(0) && purchaseCost && landedCost) {
        beforeQuantity = snapshots.get(`${location.id}:${product.id}`) ?? new Prisma.Decimal(0); requestedQuantity = received.mul(uom.conversionFactor); afterQuantity = beforeQuantity.add(requestedQuantity); const finalUnitCost = received.mul(purchaseCost).add(landedCost).div(requestedQuantity); const totalCost = requestedQuantity.mul(finalUnitCost); const activeBatches = await this.db.inventoryBatch.findMany({ where: { companyId, locationId: location.id, productId: product.id, status: 'POSTED', remainingQuantity: { gt: 0 } }, orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { displayBatchId: 'asc' }], select: { displayBatchId: true, remainingQuantity: true, finalUnitCost: true } }); const hasUnvaluedBatch = activeBatches.some((batch) => batch.finalUnitCost == null); beforeValue = hasUnvaluedBatch ? null : activeBatches.reduce((sum, batch) => sum.add(batch.remainingQuantity.mul(batch.finalUnitCost!)), new Prisma.Decimal(0)); afterValue = beforeValue == null ? null : beforeValue.add(totalCost); costStatus = beforeQuantity.isNegative() ? 'PROVISIONAL' : hasUnvaluedBatch ? 'UNVALUED' : 'FINAL';
        Object.assign(operation, { locationId: location.id, location: location.name, uomId: uom.id, receivedQuantity: requestedQuantity.toFixed(4), purchaseUnitCost: purchaseCost.toFixed(4), landedCostPerUnit: landedCost.div(requestedQuantity).toFixed(4), finalUnitCost: finalUnitCost.toFixed(4), totalCost: totalCost.toFixed(4), supplier: raw.supplier, bukkuReference: raw.bukku_reference, billDate: raw.bill_date, receivedDate: raw.received_date, duplicateKey: `receive_purchase:${raw.bukku_reference.toLowerCase()}:${product.id}`, currentValue: JSON.stringify({ quantity: beforeQuantity.toFixed(4), activeBatches: activeBatches.map((batch) => ({ batchId: batch.displayBatchId, remaining: batch.remainingQuantity.toFixed(4), unitCost: batch.finalUnitCost?.toFixed(4) ?? null })) }), proposedValue: JSON.stringify({ draftFifoBatch: true, quantity: requestedQuantity.toFixed(4), finalUnitCost: finalUnitCost.toFixed(4), fifoAfter: activeBatches.map((batch) => batch.displayBatchId).concat(raw.bukku_reference) }) });
        if (beforeQuantity.isNegative()) warnings.push('Current stock is negative; posting will require manager acknowledgement'); if (beforeValue == null && !beforeQuantity.isZero()) errors.push('Existing positive stock has no valuation; resolve it before importing a purchase receipt');
      }
    } else if (['deactivate', 'reactivate', 'delete'].includes(action) && product) {
      const forbidden = ['barcode', 'product_name', 'category', 'supplier_description', 'unit', 'selling_price', 'stock_quantity', 'stock_adjustment_reason', 'status', 'received_quantity', 'purchase_unit_cost', 'landed_cost', 'supplier', 'bukku_reference', 'bill_date', 'received_date'].filter(populated); if (forbidden.length) errors.push(`${action} requires SKU only; clear: ${forbidden.join(', ')}`);
      operation.currentValue = product.deletedAt ? 'Deleted' : product.active ? 'Active' : 'Deactivated';
      operation.proposedValue = action === 'reactivate' ? 'Active' : action === 'deactivate' ? 'Deactivated' : 'Deleted';
      if (action === 'delete') { const impact = await this.deleteImpact(this.db, companyId, product.id); Object.assign(operation, { hardDeleteAllowed: impact.hardDeleteAllowed, deleteAction: impact.action, relatedRecords: JSON.stringify(impact.relatedRecords) }); if (!impact.hardDeleteAllowed) warnings.push('This product has history and will be archived, not hard-deleted'); }
    }
    if (product) Object.assign(operation, { productId: product.id, productName: product.name });
    return { id: randomUUID(), rowNumber, productId: product?.id ?? null, productName: product?.name ?? (raw.product_name || null), sku: sku || null, locationId: location?.id ?? null, location: location?.name ?? null, operation, valid: errors.length === 0, duplicate: false, errors, beforeQuantity, requestedQuantity, afterQuantity, beforeValue, afterValue, costStatus, warnings };
  }

  private async commitRow(tx: Prisma.TransactionClient, batch: BatchRecord, row: BatchRowRecord, actorId: string, approvedById: string, stockShortageAcknowledged: boolean) {
    const op = this.operation(row); const action = String(op.action); let product = row.productId ? await tx.product.findFirst({ where: { id: row.productId, companyId: batch.companyId }, include: { uoms: true, barcodes: true, aliases: true, prices: { include: { priceLevel: true } } } }) : null;
    if (action === 'create') {
      if (product || await tx.product.findFirst({ where: { companyId: batch.companyId, sku: String(op.sku) } })) throw new ConflictException(`SKU ${String(op.sku)} now exists; review the batch again`);
      const retail = await tx.priceLevel.upsert({ where: { companyId_code: { companyId: batch.companyId, code: 'RETAIL' } }, update: { name: 'Retail' }, create: { companyId: batch.companyId, code: 'RETAIL', name: 'Retail' } });
      const createdProduct = await tx.product.create({ data: { companyId: batch.companyId, sku: String(op.sku), name: String(op.name), supplierDescription: op.supplierDescription ? String(op.supplierDescription) : null, category: op.category ? String(op.category) : null, active: Boolean(op.active), classificationCode: 'GENERAL', fifoEnabledAt: new Date(), ...structuredSearchFieldsForProduct([String(op.name), op.supplierDescription ? String(op.supplierDescription) : null, op.category ? String(op.category) : null]), uoms: { create: { code: String(op.unit), name: String(op.unit), conversionFactor: 1, isBase: true } } }, include: { uoms: true } });
      const uom = createdProduct.uoms[0]; await tx.productPrice.create({ data: { productId: createdProduct.id, priceLevelId: retail.id, uomId: uom.id, amount: new Prisma.Decimal(String(op.sellingPrice)) } });
      if (op.barcode) await tx.productBarcode.create({ data: { productId: createdProduct.id, uomId: uom.id, barcode: String(op.barcode) } });
      await this.auditProduct(tx, batch, row, actorId, approvedById, createdProduct.id, null, op.proposedValue, 'PRODUCT_CREATED'); await this.rowResult(tx, row.id, { status: 'CREATED', productId: createdProduct.id }); return;
    }
    if (!product) throw new ConflictException(`Product ${String(op.sku)} no longer exists`);
    if (action === 'receive_purchase') {
      if (!row.locationId) throw new ConflictException(`Purchase receipt row ${row.rowNumber} has no location`);
      let receipt = await tx.purchaseReceipt.findUnique({ where: { companyId_bukkuReference: { companyId: batch.companyId, bukkuReference: String(op.bukkuReference) } } });
      if (receipt && receipt.batchId !== batch.id) throw new ConflictException(`Bukku reference ${String(op.bukkuReference)} already exists`);
      if (!receipt) receipt = await tx.purchaseReceipt.create({ data: { id: randomUUID(), companyId: batch.companyId, locationId: row.locationId, bukkuReference: String(op.bukkuReference), supplier: String(op.supplier), purchaseDate: new Date(`${String(op.billDate)}T00:00:00.000Z`), sourceFileName: batch.fileName, batchId: batch.id, importedById: actorId } });
      await tx.inventoryBatch.create({ data: { id: randomUUID(), companyId: batch.companyId, locationId: row.locationId, purchaseReceiptId: receipt.id, productId: product.id, uomId: String(op.uomId), displayBatchId: String(op.bukkuReference), bukkuReference: String(op.bukkuReference), supplier: String(op.supplier), receivedQuantity: new Prisma.Decimal(String(op.receivedQuantity)), remainingQuantity: 0, purchaseUnitCost: new Prisma.Decimal(String(op.purchaseUnitCost)), landedCostPerUnit: new Prisma.Decimal(String(op.landedCostPerUnit)), finalUnitCost: new Prisma.Decimal(String(op.finalUnitCost)), totalBatchValue: new Prisma.Decimal(String(op.totalCost)), billDate: new Date(`${String(op.billDate)}T00:00:00.000Z`), receivedAt: new Date(`${String(op.receivedDate)}T12:00:00.000Z`), status: 'DRAFT', sourceType: 'BUKKU_PURCHASE', importedById: actorId } });
      await this.auditProduct(tx, batch, row, actorId, approvedById, product.id, null, { purchaseReceiptId: receipt.id, status: 'DRAFT', bukkuReference: receipt.bukkuReference }, 'PURCHASE_RECEIPT_DRAFT_CREATED'); await this.rowResult(tx, row.id, { status: 'DRAFT_PURCHASE_RECEIPT_CREATED', purchaseReceiptId: receipt.id }); return;
    }
    if (action === 'update') {
      const data: Prisma.ProductUpdateInput = { ...(op.name ? { name: String(op.name) } : {}), ...(op.category ? { category: String(op.category) } : {}), ...(op.supplierDescription ? { supplierDescription: String(op.supplierDescription) } : {}) };
      const aliases = product.aliases.map((alias) => alias.text); Object.assign(data, structuredSearchFieldsForProduct([op.name ? String(op.name) : product.name, op.supplierDescription ? String(op.supplierDescription) : product.supplierDescription, op.category ? String(op.category) : product.category, ...aliases])); await tx.product.update({ where: { id: product.id }, data });
      if (op.barcode) { const conflict = await tx.productBarcode.findUnique({ where: { barcode: String(op.barcode) } }); if (conflict && conflict.productId !== product.id) throw new ConflictException(`Barcode ${String(op.barcode)} now belongs to another product`); const base = product.uoms.find((uom) => uom.isBase) ?? product.uoms[0]; if (product.barcodes[0]) await tx.productBarcode.update({ where: { id: product.barcodes[0].id }, data: { barcode: String(op.barcode), uomId: base?.id } }); else await tx.productBarcode.create({ data: { productId: product.id, barcode: String(op.barcode), uomId: base?.id } }); }
      if (op.sellingPrice) { const retail = await tx.priceLevel.upsert({ where: { companyId_code: { companyId: batch.companyId, code: 'RETAIL' } }, update: { name: 'Retail' }, create: { companyId: batch.companyId, code: 'RETAIL', name: 'Retail' } }); const uomId = op.uomId ? String(op.uomId) : (product.uoms.find((uom) => uom.isBase) ?? product.uoms[0])?.id; if (!uomId) throw new ConflictException(`Product ${product.sku} no longer has a unit`); await tx.productPrice.upsert({ where: { productId_priceLevelId_uomId: { productId: product.id, priceLevelId: retail.id, uomId } }, update: { amount: new Prisma.Decimal(String(op.sellingPrice)) }, create: { productId: product.id, priceLevelId: retail.id, uomId, amount: new Prisma.Decimal(String(op.sellingPrice)) } }); }
      await this.auditProduct(tx, batch, row, actorId, approvedById, product.id, op.currentValue, op.proposedValue, 'PRODUCT_UPDATED'); await this.rowResult(tx, row.id, { status: 'UPDATED' }); return;
    }
    if (action === 'adjust_stock') {
      if (!row.locationId || row.beforeQuantity == null || row.afterQuantity == null) throw new ConflictException(`Stock row ${row.rowNumber} is incomplete`);
      const locked = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal }>>(Prisma.sql`SELECT "quantity" FROM "StockSnapshot" WHERE "locationId"=${row.locationId} AND "productId"=${product.id} FOR UPDATE`); const current = locked[0]?.quantity ?? new Prisma.Decimal(0); if (!current.equals(row.beforeQuantity)) throw new ConflictException(`Stock changed for ${product.sku} after preview. Review the CSV again`);
      const after = new Prisma.Decimal(row.afterQuantity); const delta = after.sub(current); const latest = await latestInventoryCost(tx, batch.companyId, row.locationId, product.id); let unitCost = latest?.averageUnitCost ?? product.basePurchaseCost; let valueDelta = unitCost == null ? null : delta.mul(unitCost); let status = unitCost == null ? 'UNVALUED' as const : after.isNegative() || !latest ? 'PROVISIONAL' as const : latest.costStatus === 'FINAL' ? 'FINAL' as const : 'PROVISIONAL' as const; let fifoAllocations: unknown[] | null = null;
      if (product.fifoEnabledAt) {
        const fifo = await adjustFifoInventory(tx, { companyId: batch.companyId, locationId: row.locationId, productId: product.id, uomId: String(op.uomId), delta, unitCost: op.stockUnitCost == null ? null : new Prisma.Decimal(String(op.stockUnitCost)), actorId, approvedById, reason: String(op.reason), referenceId: row.id, reference: op.adjustmentReference ? String(op.adjustmentReference) : null, supplier: op.adjustmentSupplier ? String(op.adjustmentSupplier) : null, override: op.fifoOverrideBatchId ? { batchId: String(op.fifoOverrideBatchId), reason: String(op.fifoOverrideReason), approvedById } : undefined, shortageAcknowledged: stockShortageAcknowledged, occurredAt: new Date() });
        valueDelta = fifo.valueDelta; status = fifo.status; unitCost = valueDelta == null ? null : valueDelta.abs().div(delta.abs()); fifoAllocations = fifo.allocations.map((allocation) => ({ ...allocation, quantity: allocation.quantity.toFixed(4), unitCost: allocation.unitCost?.toFixed(4) ?? null, value: allocation.value?.toFixed(4) ?? null }));
      }
      const runningValue = latest?.runningValue == null || valueDelta == null ? null : latest.runningValue.add(valueDelta);
      await tx.stockSnapshot.upsert({ where: { locationId_productId: { locationId: row.locationId, productId: product.id } }, update: { quantity: after, capturedAt: new Date() }, create: { locationId: row.locationId, productId: product.id, quantity: after } });
      await recordInventoryLedger(tx, { companyId: batch.companyId, locationId: row.locationId, productId: product.id, actorId, approvedById, batchId: batch.id, batchRowId: row.id, uomId: op.uomId ? String(op.uomId) : undefined, type: 'ADJUSTMENT', sourceType: 'STAFF_ADJUSTMENT', quantityDelta: delta, unitCost, valueDelta, runningQuantity: after, runningValue, averageUnitCost: product.fifoEnabledAt ? null : unitCost, costStatus: status, referenceType: 'PRODUCT_BATCH_CSV', referenceId: row.id, reason: String(op.reason) });
      if (product.fifoEnabledAt) await assertFifoStockInvariant(tx, { companyId: batch.companyId, locationId: row.locationId, productId: product.id });
      await this.auditProduct(tx, batch, row, actorId, approvedById, product.id, current.toFixed(4), { quantity: after.toFixed(4), valueDelta: valueDelta?.toFixed(4) ?? null, fifoAllocations, shortageAcknowledged: stockShortageAcknowledged }, 'PRODUCT_STOCK_ADJUSTED'); await this.rowResult(tx, row.id, { status: 'STOCK_ADJUSTED', before: current.toFixed(4), adjustment: delta.toFixed(4), after: after.toFixed(4), fifoAllocations }); return;
    }
    if (action === 'deactivate' || action === 'reactivate') { const active = action === 'reactivate'; await tx.product.update({ where: { id: product.id }, data: { active, deletedAt: null } }); await this.auditProduct(tx, batch, row, actorId, approvedById, product.id, op.currentValue, active ? 'Active' : 'Deactivated', active ? 'PRODUCT_REACTIVATED' : 'PRODUCT_DEACTIVATED'); await this.rowResult(tx, row.id, { status: active ? 'REACTIVATED' : 'DEACTIVATED' }); return; }
    if (action === 'delete') {
      const impact = await this.deleteImpact(tx, batch.companyId, product.id, batch.id);
      if (Boolean(op.hardDeleteAllowed) !== impact.hardDeleteAllowed) throw new ConflictException(`Delete impact changed for ${product.sku}; review the CSV again`);
      if (impact.hardDeleteAllowed) { await this.auditProduct(tx, batch, row, actorId, approvedById, product.id, op.currentValue, 'Hard deleted', 'PRODUCT_HARD_DELETED'); await tx.product.delete({ where: { id: product.id } }); await this.rowResult(tx, row.id, { status: 'DELETED', mode: 'HARD_DELETE' }); }
      else { await tx.product.update({ where: { id: product.id }, data: { active: false, deletedAt: new Date() } }); await this.auditProduct(tx, batch, row, actorId, approvedById, product.id, op.currentValue, 'Deleted', 'PRODUCT_ARCHIVED'); await this.rowResult(tx, row.id, { status: 'DELETED', mode: 'ARCHIVED', relatedRecords: impact.relatedRecords }); }
    }
  }

  private async deleteImpact(db: PrismaService | Prisma.TransactionClient, companyId: string, productId: string, excludeBatchId?: string): Promise<DeleteImpact> {
    const [sales, returns, movements, snapshots, inventoryBatches, aliases, externalReferences, priorBatches, audits] = await Promise.all([
      db.saleItem.count({ where: { productId } }), db.returnItem.count({ where: { productId } }), db.inventoryLedgerEntry.count({ where: { productId } }), db.stockSnapshot.count({ where: { productId } }), db.inventoryBatch.count({ where: { productId } }), db.productAlias.count({ where: { productId } }),
      db.externalReference.count({ where: { companyId, entityType: 'PRODUCT', localId: productId } }), db.batchUpdateRow.count({ where: { productId, ...(excludeBatchId ? { batchId: { not: excludeBatchId } } : {}) } }), db.auditLog.count({ where: { companyId, entityType: 'Product', entityId: productId, action: { not: 'PRODUCT_CREATED' } } }),
    ]);
    const relatedRecords = { sales, returns, stockMovements: movements, stockSnapshots: snapshots, inventoryBatches, aliases, bukkuReferences: externalReferences, priorBatchRows: priorBatches, auditHistory: audits }; const totalRelatedRecords = Object.values(relatedRecords).reduce((sum, value) => sum + value, 0); return { hardDeleteAllowed: totalRelatedRecords === 0, relatedRecords, totalRelatedRecords, action: totalRelatedRecords === 0 ? 'HARD_DELETE' : 'ARCHIVE' };
  }

  private async auditProduct(tx: Prisma.TransactionClient, batch: BatchRecord, row: BatchRowRecord, actorId: string, approvedById: string, productId: string, before: unknown, after: unknown, action: string) { await tx.auditLog.create({ data: { companyId: batch.companyId, actorId, action, entityType: 'Product', entityId: productId, reason: String(this.operation(row).reason ?? `Batch ${batch.fileName}`), before: this.json(before), after: this.json(after), metadata: { importId: batch.id, batchRowId: row.id, rowNumber: row.rowNumber, sourceFileName: batch.fileName, uploaderId: batch.createdById, approvingManagerId: approvedById, sku: this.operation(row).sku } } }); }
  private json(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull { if (value === null || value === undefined) return Prisma.JsonNull; if (typeof value === 'string') { try { return JSON.parse(value) as Prisma.InputJsonValue; } catch { return { value }; } } return value as Prisma.InputJsonValue; }
  private async rowResult(tx: Prisma.TransactionClient, rowId: string, result: Record<string, unknown>) { await tx.$executeRaw(Prisma.sql`UPDATE "BatchUpdateRow" SET "result"=${JSON.stringify(result)}::jsonb WHERE "id"=${rowId}`); }
  private operation(row: BatchRowRecord) { return (row.input && typeof row.input === 'object' && !Array.isArray(row.input) ? row.input : {}) as Operation; }
  private previewFromStored(row: BatchRowRecord): PreviewRow { const operation = this.operation(row); return { id: row.id, rowNumber: row.rowNumber, productId: row.productId, productName: String(operation.productName ?? '') || null, sku: String(operation.sku ?? '') || null, locationId: row.locationId, location: String(operation.location ?? '') || null, operation, valid: row.valid, duplicate: row.duplicate, errors: row.errors, beforeQuantity: row.beforeQuantity, requestedQuantity: row.requestedQuantity, afterQuantity: row.afterQuantity, beforeValue: row.beforeValue, afterValue: row.afterValue, costStatus: row.costStatus, warnings: [] }; }
  private summary(rows: PreviewRow[]) { const quantity = rows.reduce((sum, row) => sum.add(row.requestedQuantity?.abs() ?? 0), new Prisma.Decimal(0)); const value = rows.reduce((sum, row) => sum.add(row.beforeValue != null && row.afterValue != null ? new Prisma.Decimal(row.afterValue).sub(row.beforeValue).abs() : 0), new Prisma.Decimal(0)); const counts = Object.fromEntries(ACTIONS.map((action) => [action, rows.filter((row) => row.operation.action === action).length])); const requiresStockShortageAcknowledgement = rows.some((row) => Boolean(row.operation.createsFifoShortage)); const highRisk = rows.length > HIGH_ROW_COUNT || quantity.greaterThan(HIGH_VOLUME_UNITS) || value.greaterThan(HIGH_VALUE_RM) || rows.some((row) => row.operation.action === 'delete' || Boolean(row.operation.fifoOverrideBatchId)) || requiresStockShortageAcknowledgement; return { rowCount: rows.length, validRows: rows.filter((row) => row.valid).length, invalidRows: rows.filter((row) => !row.valid).length, duplicateRows: rows.filter((row) => row.duplicate).length, totalAbsQuantity: quantity.toNumber(), knownValueImpact: value.toNumber(), highRisk, requiresStockShortageAcknowledgement, actionCounts: counts }; }
  private commitTotals(rows: BatchRowRecord[]) { const result: Record<string, number> = { created: 0, updated: 0, stockAdjusted: 0, deactivated: 0, reactivated: 0, deleted: 0, purchaseReceiptDrafts: 0, failed: 0 }; for (const row of rows) { const key = String(this.operation(row).action); if (key === 'create') result.created++; else if (key === 'update') result.updated++; else if (key === 'adjust_stock') result.stockAdjusted++; else if (key === 'deactivate') result.deactivated++; else if (key === 'reactivate') result.reactivated++; else if (key === 'delete') result.deleted++; else if (key === 'receive_purchase') result.purchaseReceiptDrafts++; } return result; }
  private decimal(value: string | undefined, field: string, errors: string[], precision: number, required: boolean) { const text = value?.trim() ?? ''; if (!text) { if (required) errors.push(`${field} is required`); return null; } if (!new RegExp(`^-?\\d+(?:\\.\\d{1,${precision}})?$`).test(text)) { errors.push(`${field} must be a plain number with at most ${precision} decimal places`); return null; } try { return new Prisma.Decimal(text); } catch { errors.push(`${field} is outside the supported numeric range`); return null; } }
  private status(value: string, errors: string[], allowBlank: boolean) { const normalized = value.trim().toLowerCase(); if (!normalized && allowBlank) return 'active'; if (['active', 'deactivated'].includes(normalized)) return normalized; errors.push('status must be active or deactivated'); return 'active'; }
  private decodeBase64(value: string) { const normalized = value.replace(/\s/g, ''); if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) throw new BadRequestException('The uploaded file encoding is invalid'); const buffer = Buffer.from(normalized, 'base64'); if (buffer.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')) throw new BadRequestException('The uploaded file encoding is invalid'); return buffer; }
  private async assertManager(input: BatchActorDto) { const actor = await this.db.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }); const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions.filter((permission): permission is string => typeof permission === 'string') : []; if (!actor || !managerPermissions.some((permission) => permissions.includes(permission))) throw new ForbiddenException('Manager access is required for Batch Update'); return { id: actor.id, permissions }; }
  private async assertFreshApproval(companyId: string, token?: string) { if (!token) throw new ForbiddenException('Re-enter a manager PIN to approve this high-risk batch'); for (const candidate of token.split(',').map((value) => value.trim()).filter(Boolean)) { try { const session = this.sessions.verify(candidate); if (session.companyId === companyId && session.issuedAt && session.issuedAt >= Date.now() - MANAGER_REAUTH_MS && managerPermissions.some((permission) => session.permissions.includes(permission))) return session.userId; } catch (error) { if (!(error instanceof Error)) throw error; } } throw new ForbiddenException('A manager PIN reauthentication from the last five minutes is required for this high-risk batch'); }
  private async batch(id: string, companyId: string) { const rows = await this.db.$queryRaw<BatchRecord[]>(Prisma.sql`SELECT ${this.batchColumns()} FROM "BatchUpdate" WHERE "id"=${id} AND "companyId"=${companyId} LIMIT 1`); if (!rows[0]) throw new NotFoundException('Batch was not found'); return rows[0]; }
  private rows(batchId: string) { return this.db.$queryRaw<BatchRowRecord[]>(Prisma.sql`SELECT "id","batchId","rowNumber","productId","locationId","input","valid","duplicate","errors","beforeQuantity","requestedQuantity","afterQuantity","beforeValue","afterValue","costStatus","result" FROM "BatchUpdateRow" WHERE "batchId"=${batchId} ORDER BY "rowNumber"`); }
  private batchColumns() { return Prisma.raw('"id","companyId","type","checksum","fileName","mimeType","status","createdById","confirmedById","approvedById","rowCount","validRowCount","invalidRowCount","duplicateRowCount","highRisk","summary","createdAt","committedAt"'); }
  private view(batch: BatchRecord, rows: BatchRowRecord[], duplicateUpload: boolean) { return { ...batch, duplicateUpload, rows: rows.map((row) => ({ ...this.previewFromStored(row), action: this.operation(row).action, currentValue: this.operation(row).currentValue, proposedValue: this.operation(row).proposedValue, beforeQuantity: this.number(row.beforeQuantity), requestedQuantity: this.number(row.requestedQuantity), afterQuantity: this.number(row.afterQuantity), beforeValue: this.number(row.beforeValue), afterValue: this.number(row.afterValue), result: row.result })) }; }
  private number(value: Prisma.Decimal | null) { return value == null ? null : Number(value); }
}
