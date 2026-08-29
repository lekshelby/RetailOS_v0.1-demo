import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
    throw new Error('CORS_ORIGIN must be set in production. Use a comma-separated list of permitted HTTPS origins.');
  }
  (app as unknown as { useStaticAssets: (path: string) => void }).useStaticAssets(join(process.cwd(), 'public'));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: allowedOrigins.length ? allowedOrigins : true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(process.env.PORT || 3000, process.env.HOST || '0.0.0.0');
}
bootstrap();
