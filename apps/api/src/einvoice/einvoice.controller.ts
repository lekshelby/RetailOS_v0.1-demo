import { Body, Controller, Get, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
import * as QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

class CustomerEInvoiceRequestDto {
  @IsIn(['MALAYSIAN_COMPANY', 'MALAYSIAN_INDIVIDUAL', 'FOREIGN_COMPANY', 'FOREIGN_INDIVIDUAL']) entityType!: string;
  @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() registrationNoType?: string;
  @IsOptional() @IsString() registrationNo?: string;
  @IsOptional() @IsString() tin?: string;
  @IsOptional() @IsString() phone?: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() address?: string;
}

@Controller('e-invoice')
export class EInvoiceController {
  constructor(private readonly db: PrismaService, private readonly config: ConfigService) {}
  @Get('request/:token') async details(@Param('token') token: string) {
    const sale = await this.db.sale.findFirst({ where: { eInvoiceRequestToken: token, status: 'COMPLETED' }, include: { company: true } });
    if (!sale) throw new NotFoundException('This receipt is not available for an e-Invoice request');
    const existing = await this.db.eInvoiceRequest.findFirst({ where: { token } });
    return { receiptNo: sale.receiptNo, total: Number(sale.grandTotal), completedAt: sale.completedAt, company: sale.company.name, status: existing?.status ?? 'AVAILABLE' };
  }
  @Get('request/:token/qr') async qr(@Param('token') token: string, @Req() request: { protocol: string; get: (name: string) => string | undefined }, @Res() response: { setHeader: (name: string, value: string) => void; send: (data: string) => void }) {
    const sale = await this.db.sale.findFirst({ where: { eInvoiceRequestToken: token, status: 'COMPLETED' } });
    if (!sale) throw new NotFoundException('This receipt is not available for an e-Invoice request');
    const configuredPublicUrl = this.config.get<string>('PUBLIC_APP_URL')?.replace(/\/$/, '');
    const baseUrl = configuredPublicUrl || `${request.protocol}://${request.get('host')}`;
    const url = `${baseUrl}/e-invoice.html?token=${encodeURIComponent(token)}`;
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 180, errorCorrectionLevel: 'M' });
    response.setHeader('Content-Type', 'image/svg+xml'); response.send(svg);
  }
  @Post('request/:token') async submit(@Param('token') token: string, @Body() input: CustomerEInvoiceRequestDto) {
    const sale = await this.db.sale.findFirst({ where: { eInvoiceRequestToken: token, status: 'COMPLETED' } });
    if (!sale) throw new NotFoundException('This receipt is not available for an e-Invoice request');
    const existing = await this.db.eInvoiceRequest.findFirst({ where: { token } });
    if (existing) return { status: existing.status, message: 'An e-Invoice request has already been received for this receipt.' };
    const request = await this.db.eInvoiceRequest.create({ data: { saleId: sale.id, companyId: sale.companyId, token, entityType: input.entityType, name: input.name.trim(), registrationNoType: input.registrationNoType?.trim(), registrationNo: input.registrationNo?.trim(), tin: input.tin?.trim(), phone: input.phone?.trim(), email: input.email.trim(), address: input.address?.trim() } });
    await this.db.auditLog.create({ data: { companyId: sale.companyId, action: 'EINVOICE_CUSTOMER_REQUESTED', entityType: 'Sale', entityId: sale.id, after: { requestId: request.id, receiptNo: sale.receiptNo, status: request.status } } });
    return { status: request.status, message: 'Your e-Invoice request has been received. Taiping Hardware will process it through Bukku/MyInvois.' };
  }
  static token() { return randomBytes(18).toString('base64url'); }
}
