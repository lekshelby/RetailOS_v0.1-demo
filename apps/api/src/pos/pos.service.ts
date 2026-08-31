import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PosService {
  constructor(private readonly db: PrismaService) {}

  async bootstrap(companyCode: string) {
    if (!companyCode?.trim()) throw new BadRequestException('Company code is required');
    const company = await this.db.company.findUnique({
      where: { code: companyCode.trim().toUpperCase() },
      include: {
        locations: { include: { registers: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } },
        priceLevels: { orderBy: { name: 'asc' } },
      },
    });
    if (!company) throw new NotFoundException('Company was not found');
    return {
      company: { id: company.id, code: company.code, name: company.name, currency: company.currency, printerConnectionMethod: company.printerConnectionMethod, customerEInvoiceRequestsEnabled: company.customerEInvoiceRequestsEnabled },
      locations: company.locations,
      priceLevels: company.priceLevels,
      pricing: {
        taxMode: 'NONE',
        taxRate: 0,
        priceEditableByCashier: false,
        discountsRequireManagerApproval: true,
      },
    };
  }
}
