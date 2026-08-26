import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CreateManagedContactDto, CreateManagedProductDto, ManagerRequestDto, UpdateCompanyProfileDto, UpdateManagedProductDto } from './dto/management.dto';
import { ManagementService } from './management.service';

@Controller('management')
export class ManagementController {
  constructor(private readonly management: ManagementService) {}
  @Get('company') company(@Query() input: ManagerRequestDto) { return this.management.profile(input); }
  @Put('company') updateCompany(@Body() input: UpdateCompanyProfileDto) { return this.management.updateProfile(input); }
  @Get('products') products(@Query() input: ManagerRequestDto, @Query('query') query?: string) { return this.management.listProducts(input, query); }
  @Get('products/:id') product(@Param('id') id: string, @Query() input: ManagerRequestDto) { return this.management.product(id, input); }
  @Post('products') createProduct(@Body() input: CreateManagedProductDto) { return this.management.createProduct(input); }
  @Put('products/:id') updateProduct(@Param('id') id: string, @Body() input: UpdateManagedProductDto) { return this.management.updateProduct(id, input); }
  @Get('contacts') contacts(@Query() input: ManagerRequestDto, @Query('query') query?: string) { return this.management.listContacts(input, query); }
  @Post('contacts') createContact(@Body() input: CreateManagedContactDto) { return this.management.createContact(input); }
}
