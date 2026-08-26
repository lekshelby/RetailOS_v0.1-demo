import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BukkuHttpClient } from '../integrations/bukku/bukku-http.client';

function object(value: unknown): Record<string, unknown> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function rows(payload: Record<string, unknown>) {
  const section = object(payload.product_list);
  for (const candidate of [payload.product_list, section?.products, section?.items, payload.products, payload.items]) if (Array.isArray(candidate)) return candidate;
  return [];
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const client = app.get(BukkuHttpClient);
    const payload = await client.post('/v2/lists', { lists: ['product_list'], params: { product_list: { version: null } } });
    const body = object(payload) ?? {};
    const section = object(body.product_list);
    const products = rows(body);
    const first = object(products[0]);
    const units = Array.isArray(first?.units) ? first?.units : [];
    console.log(JSON.stringify({ responseKeys: Object.keys(body), productListKeys: section ? Object.keys(section) : [], productCount: products.length, firstProductFieldNames: first ? Object.keys(first) : [], firstUnitFieldNames: object(units[0]) ? Object.keys(object(units[0])!) : [], versionCandidates: { response: body.version, productList: section?.version, productListVersion: body.product_list_version ?? section?.product_list_version }, notChanged: body.not_changed === true || section?.not_changed === true }, null, 2));
  } finally { await app.close(); }
}
run().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
