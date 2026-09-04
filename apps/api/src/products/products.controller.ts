import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req } from '@nestjs/common';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { ProductsService } from './products.service';
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}
  private assertCatalogueAccess(request: { retailosSession?: { permissions?: string[] } }) {
    if (!request.retailosSession?.permissions?.includes('checkout')) throw new ForbiddenException('Product catalogue access requires checkout permission');
  }
  @Get('catalog') catalog(@Req() request: { retailosSession?: { permissions?: string[] } }, @Query('companyId') companyId: string, @Query('priceLevelId') priceLevelId?: string, @Query('locationId') locationId?: string, @Query('offset') offset?: string, @Query('limit') limit?: string) {
    this.assertCatalogueAccess(request);
    return this.products.catalog(companyId, priceLevelId, locationId, Number(offset || 0), Number(limit || 250));
  }
  @Get('lookup') lookup(@Req() request: { retailosSession?: { permissions?: string[] } }, @Query('companyId') companyId: string, @Query('query') query: string, @Query('priceLevelId') priceLevelId?: string, @Query('locationId') locationId?: string, @Query('structured') structured?: string, @Query('related') related?: string) {
    this.assertCatalogueAccess(request);
    return this.products.lookup(companyId, query, priceLevelId, locationId, structured === 'true', related === 'true');
  }
  @Post(':id/stock-adjustment') adjustStock(@Param('id') productId: string, @Body() input: StockAdjustmentDto) {
    return this.products.adjustStock(productId, input);
  }
}
