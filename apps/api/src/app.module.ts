import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'path';
import { DatabaseModule } from './database/database.module';
import { BukkuModule } from './integrations/bukku/bukku.module';
import { CheckoutModule } from './checkout/checkout.module';
import { ProductsModule } from './products/products.module';
import { AuthModule } from './auth/auth.module';
import { PosModule } from './pos/pos.module';
import { ShiftsModule } from './shifts/shifts.module';
import { ReturnsModule } from './returns/returns.module';
import { ManagementModule } from './management/management.module';
import { EInvoiceModule } from './einvoice/einvoice.module';
import { HealthController } from './health.controller';
import { SessionMiddleware } from './auth/session.middleware';
import { BackOfficeModule } from './backoffice/backoffice.module';
@Module({imports:[ConfigModule.forRoot({isGlobal:true,envFilePath:[resolve(process.cwd(),'.env.local'),resolve(process.cwd(),'../..','.env.local'),resolve(process.cwd(),'.env'),resolve(process.cwd(),'../..','.env')]}),DatabaseModule,BukkuModule,CheckoutModule,ProductsModule,AuthModule,PosModule,ShiftsModule,ReturnsModule,ManagementModule,EInvoiceModule,BackOfficeModule],controllers:[HealthController],providers:[SessionMiddleware]})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) { consumer.apply(SessionMiddleware).forRoutes('*'); }
}
