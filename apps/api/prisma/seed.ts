import { PrismaClient } from '@prisma/client';
import { hashPin } from '../src/auth/pin';

const db = new PrismaClient();

async function main() {
  const company = await db.company.upsert({ where: { code: 'TH-DEMO' }, update: {}, create: { name: 'Taiping Hardware Demo', code: 'TH-DEMO' } });
  const cashierRole = await db.role.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Cashier' } },
    update: { permissions: ['checkout', 'returns', 'cash_movement', 'catalog.manage', 'shift.open', 'sync.run'] },
    create: { companyId: company.id, name: 'Cashier', permissions: ['checkout', 'returns', 'cash_movement', 'catalog.manage', 'shift.open', 'sync.run'] },
  });
  const managerRole = await db.role.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Manager' } },
    update: { permissions: ['checkout', 'returns', 'cash_movement', 'discount.approve', 'sale.void', 'shift.open', 'shift.close', 'shift.report.view', 'sync.run', 'stock.adjust', 'catalog.manage', 'contact.manage', 'company.manage', 'printer.manage', 'backoffice.view'] },
    create: { companyId: company.id, name: 'Manager', permissions: ['checkout', 'returns', 'cash_movement', 'discount.approve', 'sale.void', 'shift.open', 'shift.close', 'shift.report.view', 'sync.run', 'stock.adjust', 'catalog.manage', 'contact.manage', 'company.manage', 'printer.manage', 'backoffice.view'] },
  });
  const cashier = await db.user.upsert({
    where: { companyId_email: { companyId: company.id, email: 'cashier@retailos.local' } },
    update: {}, create: { companyId: company.id, roleId: cashierRole.id, name: 'Demo Cashier', email: 'cashier@retailos.local', pinHash: hashPin('1234') },
  });
  await db.user.upsert({
    where: { companyId_email: { companyId: company.id, email: 'manager@retailos.local' } },
    update: {}, create: { companyId: company.id, roleId: managerRole.id, name: 'Demo Manager', email: 'manager@retailos.local', pinHash: hashPin('2468') },
  });
  const location = await db.location.upsert({ where: { companyId_code: { companyId: company.id, code: 'MAIN' } }, update: {}, create: { companyId: company.id, name: 'Main Store', code: 'MAIN' } });
  const register = await db.register.upsert({ where: { locationId_code: { locationId: location.id, code: 'R1' } }, update: {}, create: { locationId: location.id, name: 'Front Counter', code: 'R1' } });
  const retail = await db.priceLevel.upsert({ where: { companyId_code: { companyId: company.id, code: 'RETAIL' } }, update: {}, create: { companyId: company.id, name: 'Retail', code: 'RETAIL' } });

  const products = [
    { sku: 'HAMMER-16', name: '16oz Claw Hammer', barcode: '9551000000011', units: [{ code: 'EA', name: 'Each', factor: 1, price: 35.9 }] },
    { sku: 'SCREW-8X1', name: 'Wood Screw #8 x 1 inch', barcode: '9551000000028', units: [{ code: 'EA', name: 'Each', factor: 1, price: 0.2 }, { code: 'BOX', name: 'Box of 100', factor: 100, price: 18 }] },
    { sku: 'TAPE-5M', name: 'Measuring Tape 5m', barcode: '9551000000035', units: [{ code: 'EA', name: 'Each', factor: 1, price: 18 }] },
    { sku: 'PVC-15-E-5.8', name: '1/2" PVC PIPE CLASS E', supplierDescription: '15MM X 5.8M PVC PIPE "E" - SIRIM', nominalLengthMeters: 5.8, basePurchaseCost: 8.68, stock: 211, units: [{ code: 'LEN', name: 'Length (5.8m)', factor: 1, price: 11.5 }, { code: 'FT', name: 'Foot', factor: 1 / 19, price: 0.7 }, { code: 'METER', name: 'Meter', factor: 1 / 5.8, price: 2.3 }, { code: 'INCH', name: 'Inch', factor: 1 / 228, price: 0.06 }] },
  ];
  for (const definition of products) {
    const product = await db.product.upsert({ where: { companyId_sku: { companyId: company.id, sku: definition.sku } }, update: { name: definition.name, supplierDescription: definition.supplierDescription, nominalLengthMeters: definition.nominalLengthMeters, basePurchaseCost: definition.basePurchaseCost }, create: { companyId: company.id, sku: definition.sku, name: definition.name, supplierDescription: definition.supplierDescription, nominalLengthMeters: definition.nominalLengthMeters, basePurchaseCost: definition.basePurchaseCost } });
    for (const unit of definition.units) {
      const uom = await db.productUOM.upsert({ where: { productId_code: { productId: product.id, code: unit.code } }, update: { name: unit.name, conversionFactor: unit.factor }, create: { productId: product.id, code: unit.code, name: unit.name, conversionFactor: unit.factor, isBase: unit.factor === 1 } });
      await db.productPrice.upsert({ where: { productId_priceLevelId_uomId: { productId: product.id, priceLevelId: retail.id, uomId: uom.id } }, update: { amount: unit.price }, create: { productId: product.id, priceLevelId: retail.id, uomId: uom.id, amount: unit.price } });
      if (unit.factor === 1 && definition.barcode) await db.productBarcode.upsert({ where: { barcode: definition.barcode }, update: { productId: product.id, uomId: uom.id }, create: { productId: product.id, barcode: definition.barcode, uomId: uom.id } });
    }
    await db.stockSnapshot.upsert({ where: { locationId_productId: { locationId: location.id, productId: product.id } }, update: {}, create: { locationId: location.id, productId: product.id, quantity: definition.stock ?? 500 } });
  }
  await db.customer.upsert({
    where: { companyId_contactCode: { companyId: company.id, contactCode: 'C-D0001' } },
    update: {},
    create: { companyId: company.id, contactCode: 'C-D0001', entityType: 'MALAYSIAN_COMPANY', contactTypes: ['CUSTOMER'], name: 'Demo Walk-in Customer', phone: '60123456789', countryCode: 'MY', remarks: 'Demo contact — safe to use for RetailOS walkthrough.' },
  });
  const openShift = await db.shift.findFirst({ where: { registerId: register.id, cashierId: cashier.id, closedAt: null } });
  if (!openShift) await db.shift.create({ data: { locationId: location.id, registerId: register.id, cashierId: cashier.id, openingFloat: 200 } });
  console.log(JSON.stringify({ companyId: company.id, locationId: location.id, registerId: register.id, priceLevelId: retail.id, cashierPin: '1234', managerApprovalPin: '2468' }, null, 2));
}

main().finally(() => db.$disconnect());
