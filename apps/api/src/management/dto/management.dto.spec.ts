import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PreviewBukkuDailyInvoiceDto, UpdateCompanyProfileDto } from './management.dto';

describe('UpdateCompanyProfileDto', () => {
  it('allows a blank Bukku tax code so an obsolete mapping can be cleared', async () => {
    const input = plainToInstance(UpdateCompanyProfileDto, {
      companyId: 'company-1', actorId: 'manager-1', bukkuDailyInvoiceTaxCodeId: '',
    });
    await expect(validate(input)).resolves.toHaveLength(0);
  });

  it('still rejects an invalid non-empty Bukku tax code', async () => {
    const input = plainToInstance(UpdateCompanyProfileDto, {
      companyId: 'company-1', actorId: 'manager-1', bukkuDailyInvoiceTaxCodeId: 'x'.repeat(161),
    });
    await expect(validate(input)).resolves.not.toHaveLength(0);
  });

  it('accepts a closed-shift preview query with its shift ID', async () => {
    const input = plainToInstance(PreviewBukkuDailyInvoiceDto, {
      companyId: 'company-1', actorId: 'manager-1', shiftId: 'closed-shift-1',
    });
    await expect(validate(input)).resolves.toHaveLength(0);
  });
});
