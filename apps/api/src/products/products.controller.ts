import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { ProductsService } from './products.service';
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}
  @Get('catalog') catalog(@Query('companyId') companyId: string, @Query('priceLevelId') priceLevelId?: string, @Query('locationId') locationId?: string, @Query('offset') offset?: string, @Query('limit') limit?: string) {
    return this.products.catalog(companyId, priceLevelId, locationId, Number(offset || 0), Number(limit || 250));
  }
  @Get('lookup') lookup(@Query('companyId') companyId: string, @Query('query') query: string, @Query('priceLevelId') priceLevelId?: string, @Query('locationId') locationId?: string) {
    return this.products.lookup(companyId, query, priceLevelId, locationId);
  }
  @Post(':id/stock-adjustment') adjustStock(@Param('id') productId: string, @Body() input: StockAdjustmentDto) {
    return this.products.adjustStock(productId, input);
  }
}
