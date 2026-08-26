import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { BukkuSyncService } from '../integrations/bukku/bukku-sync.service';

async function run() {
  const [operation, companyReference] = process.argv.slice(2);
  if (!companyReference || !['products', 'contacts'].includes(operation)) {
    throw new Error('Usage: bukku-sync <products|contacts> <company-id-or-code>');
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const db = app.get(PrismaService);
    const sync = app.get(BukkuSyncService);
    const company = await db.company.findFirst({ where: { OR: [{ id: companyReference }, { code: companyReference }] } });
    if (!company) throw new Error(`Company not found: ${companyReference}`);
    const result = operation === 'products'
      ? await sync.importProducts(company.id)
      : await sync.importContacts(company.id);
    process.stdout.write(`${JSON.stringify({ operation, companyCode: company.code, result })}\n`);
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Bukku sync failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
