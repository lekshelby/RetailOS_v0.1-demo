import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BukkuAdapter } from '../integrations/bukku/bukku.adapter';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const bukku = app.get(BukkuAdapter);
    const [products, contacts] = await Promise.all([
      bukku.pullProducts({ limit: 50 }),
      bukku.pullContacts({ limit: 50 }),
    ]);
    const productsWithoutSku = products.items.filter((product) => !product.sku?.trim()).length;
    process.stdout.write(`${JSON.stringify({
      provider: bukku.provider,
      firstProductPage: products.items.length,
      additionalProductPages: Boolean(products.nextCursor),
      productsWithoutSkuOnFirstPage: productsWithoutSku,
      firstContactPage: contacts.items.length,
      additionalContactPages: Boolean(contacts.nextCursor),
    })}\n`);
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Bukku preview failed'}\n`);
  process.exitCode = 1;
});
