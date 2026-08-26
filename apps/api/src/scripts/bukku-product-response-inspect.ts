import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BukkuHttpClient } from '../integrations/bukku/bukku-http.client';

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const client = app.get(BukkuHttpClient);
    const response = object(await client.get('/products?page=1&page_size=100'));
    const products = Array.isArray(response.products) ? response.products : [];
    const paging = object(response.paging);
    const pagingValues = Object.fromEntries(Object.entries(paging).map(([key, value]) => [key, ['string', 'number', 'boolean'].includes(typeof value) ? value : typeof value]));
    process.stdout.write(`${JSON.stringify({
      responseKeys: Object.keys(response),
      productArrayCount: products.length,
      firstProductFieldNames: products[0] && typeof products[0] === 'object' ? Object.keys(object(products[0])) : [],
      pagingValues,
    })}\n`);
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Bukku product inspection failed'}\n`);
  process.exitCode = 1;
});
