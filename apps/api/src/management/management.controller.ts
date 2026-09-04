import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApproveBukkuProductMappingDto, CreateManagedContactDto, CreateManagedProductDto, CreateManagedStaffDto, CreateProductAliasDto, DeleteManagedProductDto, ManagerRequestDto, PreviewBukkuDailyInvoiceDto, ProductLifecycleDto, UpdateCompanyProfileDto, UpdateManagedProductDto, UpdateManagedStaffDto } from './dto/management.dto';
import { ManagementService } from './management.service';

@Controller('management')
export class ManagementController {
  constructor(private readonly management: ManagementService) {}
  @Get('company') company(@Query() input: ManagerRequestDto) { return this.management.profile(input); }
  @Put('company') updateCompany(@Body() input: UpdateCompanyProfileDto) { return this.management.updateProfile(input); }
  @Get('bukku/mapping-options') bukkuMappingOptions(@Query() input: ManagerRequestDto) { return this.management.bukkuMappingOptions(input); }
  @Get('bukku/product-mappings') bukkuProductMappings(@Query() input: ManagerRequestDto, @Query('query') query?: string) { return this.management.listBukkuProductMappings(input, query); }
  @Post('bukku/product-mappings') approveBukkuProductMapping(@Body() input: ApproveBukkuProductMappingDto) { return this.management.approveBukkuProductMapping(input); }
  @Get('bukku/daily-invoice-preview') previewBukkuDailyInvoice(@Query() input: PreviewBukkuDailyInvoiceDto) { return this.management.previewBukkuDailyInvoice(input.shiftId, input); }
  @Get('staff') staff(@Query() input: ManagerRequestDto) { return this.management.listStaff(input); }
  @Post('staff') createStaff(@Body() input: CreateManagedStaffDto) { return this.management.createStaff(input); }
  @Put('staff/:id') updateStaff(@Param('id') id: string, @Body() input: UpdateManagedStaffDto) { return this.management.updateStaff(id, input); }
  @Get('products') products(@Query() input: ManagerRequestDto, @Query('query') query?: string) { return this.management.listProducts(input, query); }
  @Get('products/:id') product(@Param('id') id: string, @Query() input: ManagerRequestDto) { return this.management.product(id, input); }
  @Post('products') createProduct(@Body() input: CreateManagedProductDto) { return this.management.createProduct(input); }
  @Put('products/:id') updateProduct(@Param('id') id: string, @Body() input: UpdateManagedProductDto) { return this.management.updateProduct(id, input); }
  @Get('products/:id/delete-impact') deleteImpact(@Param('id') id: string, @Query() input: ManagerRequestDto) { return this.management.productDeleteImpact(id, input); }
  @Post('products/:id/deactivate') deactivateProduct(@Param('id') id: string, @Body() input: ProductLifecycleDto) { return this.management.setProductActive(id, false, input); }
  @Post('products/:id/reactivate') reactivateProduct(@Param('id') id: string, @Body() input: ProductLifecycleDto) { return this.management.setProductActive(id, true, input); }
  @Delete('products/:id') deleteProduct(@Param('id') id: string, @Body() input: DeleteManagedProductDto) { return this.management.deleteProduct(id, input); }
  @Post('products/:id/aliases') addProductAlias(@Param('id') id: string, @Body() input: CreateProductAliasDto) { return this.management.addProductAlias(id, input); }
  @Delete('products/:id/aliases/:aliasId') deleteProductAlias(@Param('id') id: string, @Param('aliasId') aliasId: string, @Body() input: ManagerRequestDto) { return this.management.deleteProductAlias(id, aliasId, input); }
  @Get('contacts') contacts(@Query() input: ManagerRequestDto, @Query('query') query?: string) { return this.management.listContacts(input, query); }
  @Post('contacts') createContact(@Body() input: CreateManagedContactDto) { return this.management.createContact(input); }
}
