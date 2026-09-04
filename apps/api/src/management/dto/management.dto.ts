import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Min, ValidateIf, ValidateNested } from 'class-validator';

export class ManagerRequestDto {
  @IsString() companyId!: string;
  @IsString() actorId!: string;
  @IsOptional() @IsString() query?: string;
}

export class UpdateCompanyProfileDto extends ManagerRequestDto {
  @IsOptional() @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsString() @Length(1, 160) legalName?: string;
  @IsOptional() @IsString() @Length(1, 80) registrationNo?: string;
  @IsOptional() @IsString() @Length(1, 40) tin?: string;
  @IsOptional() @IsString() @Length(1, 80) brnNew?: string;
  @IsOptional() @IsString() @Length(1, 80) brnOld?: string;
  @IsOptional() @IsString() @Length(1, 800) address?: string;
  @IsOptional() @IsString() @Length(1, 40) officePhone?: string;
  @IsOptional() @IsString() @Length(1, 40) phone?: string;
  @IsOptional() @ValidateIf((_object, value) => value !== '') @IsEmail() email?: string;
  @IsOptional() @IsString() @ValidateIf((_object, value) => value !== '') @Length(1, 500) receiptFooter?: string;
  @IsOptional() @IsIn([58, 76, 80, 82, 110]) receiptPaperWidthMm?: number;
  @IsOptional() @IsIn(['LAN_ESC_POS', 'WINDOWS_RAW', 'SERIAL_ESC_POS', 'WINDOWS_USB', 'BLUETOOTH']) printerConnectionMethod?: string;
  @IsOptional() @IsString() @Matches(/^(?:10|127|192\.168)\.\d{1,3}\.\d{1,3}$/) printerLanHost?: string;
  @IsOptional() @IsNumber() @Min(1) printerLanPort?: number;
  @IsOptional() @IsString() @Length(1, 160) printerWindowsQueue?: string;
  @IsOptional() @IsString() @Matches(/^COM([1-9]|[1-9]\d|1\d{2}|2[0-4]\d|25[0-6])$/i) printerSerialPort?: string;
  @IsOptional() @IsNumber() @Min(1200) printerSerialBaudRate?: number;
  @IsOptional() @IsString() @Length(1, 120) printerProfileName?: string;
  @IsOptional() @IsIn(['LAN_ESC_POS', 'WINDOWS_RAW', 'SERIAL_ESC_POS']) printerFallbackMethod?: string;
  @IsOptional() @IsString() @Matches(/^(?:10|127|192\.168)\.\d{1,3}\.\d{1,3}$/) printerFallbackLanHost?: string;
  @IsOptional() @IsNumber() @Min(1) printerFallbackLanPort?: number;
  @IsOptional() @IsIn(['COMPACT', 'STANDARD', 'DETAILED']) receiptTemplate?: string;
  @IsOptional() @IsIn(['DASHED', 'DOUBLE', 'DOT']) receiptDividerStyle?: string;
  @IsOptional() @IsBoolean() receiptShowLogo?: boolean;
  @IsOptional() @IsBoolean() receiptShowSku?: boolean;
  @IsOptional() @IsIn(['AUTO', 'UTF8', 'RASTER']) receiptChineseMode?: string;
  @IsOptional() @IsBoolean() customerEInvoiceRequestsEnabled?: boolean;
  @IsOptional() @IsBoolean() bukkuDailyInvoiceEnabled?: boolean;
  @IsOptional() @IsString() @Length(1, 160) bukkuDailyInvoiceContactId?: string;
  @IsOptional() @IsString() @Length(1, 160) bukkuDailyInvoiceLocationId?: string;
  @IsOptional() @IsString() @Length(1, 160) bukkuDailyInvoiceRevenueAccountId?: string;
  // An empty string intentionally clears an old mapping; only a supplied non-empty ID needs validation.
  @IsOptional() @ValidateIf((_object, value) => value !== '') @IsString() @Length(1, 160) bukkuDailyInvoiceTaxCodeId?: string;
  @IsOptional() @IsObject() bukkuDailyInvoicePaymentAccounts?: Record<string, string>;
}

export class PreviewBukkuDailyInvoiceDto extends ManagerRequestDto {
  @IsString() @Length(1, 80) shiftId!: string;
}

export class ApproveBukkuProductMappingDto extends ManagerRequestDto {
  @IsString() productId!: string;
  @IsString() @Length(1, 160) bukkuItemId!: string;
  @IsString() @Length(1, 160) bukkuItemCode!: string;
  @IsString() @Length(1, 240) bukkuDisplayName!: string;
  @IsBoolean() confirmed!: boolean;
}

export class CreateManagedStaffDto extends ManagerRequestDto {
  @IsString() @Length(1, 120) name!: string;
  @IsEmail() email!: string;
  @IsString() roleId!: string;
  @IsString() @Length(4, 12) pin!: string;
}

export class UpdateManagedStaffDto extends ManagerRequestDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() @Length(4, 12) pin?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateProductUomDto {
  @IsString() @Length(1, 32) code!: string;
  @IsString() @Length(1, 80) name!: string;
  @IsNumber() @Min(0.000001) conversionFactor!: number;
  @IsNumber() @Min(0) salePrice!: number;
  @IsOptional() @IsNumber() @Min(0) purchasePrice?: number;
}

export class CreateManagedProductDto extends ManagerRequestDto {
  @IsString() @Length(1, 200) name!: string;
  @IsString() @Length(1, 100) sku!: string;
  @IsOptional() @IsString() @Length(1, 100) barcode?: string;
  @IsOptional() @IsString() @Length(1, 80) classificationCode?: string;
  @IsOptional() @IsString() @Length(1, 300) supplierDescription?: string;
  @IsOptional() @IsString() @Length(1, 120) supplierName?: string;
  @IsOptional() @IsDateString() lastPurchasedAt?: string;
  @IsOptional() @IsString() @Length(1, 120) category?: string;
  @IsOptional() @IsBoolean() trackStock?: boolean;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsNumber() @Min(0) initialQuantity?: number;
  @Type(() => CreateProductUomDto) @ValidateNested({ each: true }) uoms!: CreateProductUomDto[];
}

export class UpdateManagedProductUomDto extends CreateProductUomDto {
  @IsString() id!: string;
}

export class UpdateManagedProductDto extends ManagerRequestDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;
  @IsOptional() @IsString() @Length(1, 100) sku?: string;
  @IsOptional() @IsString() @Length(0, 100) barcode?: string;
  @IsOptional() @IsString() @Length(0, 80) classificationCode?: string;
  @IsOptional() @IsString() @Length(0, 300) supplierDescription?: string;
  @IsOptional() @IsString() @Length(0, 120) supplierName?: string;
  @IsOptional() @IsDateString() lastPurchasedAt?: string;
  @IsOptional() @IsString() @Length(0, 120) category?: string;
  @IsOptional() @IsBoolean() trackStock?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @ValidateNested({ each: true }) @Type(() => UpdateManagedProductUomDto) uoms?: UpdateManagedProductUomDto[];
}

export class CreateProductAliasDto extends ManagerRequestDto {
  @IsString() @Length(1, 160) text!: string;
}

export class ProductLifecycleDto extends ManagerRequestDto {
  @IsBoolean() confirmed!: boolean;
}

export class DeleteManagedProductDto extends ProductLifecycleDto {
  @IsOptional() @IsBoolean() hardDelete?: boolean;
}

export class CreateManagedContactDto extends ManagerRequestDto {
  @IsString() @Length(1, 200) name!: string;
  @IsIn(['MALAYSIAN_COMPANY', 'MALAYSIAN_INDIVIDUAL', 'FOREIGN_COMPANY', 'FOREIGN_INDIVIDUAL', 'EXEMPTED_PERSON', 'GENERAL_PUBLIC']) entityType!: string;
  @IsOptional() @IsString() @Length(1, 15) @Matches(/^[A-Za-z0-9_-]+$/) contactCode?: string;
  @IsArray() @ArrayMinSize(1) @IsIn(['CUSTOMER', 'SUPPLIER', 'EMPLOYEE'], { each: true }) contactTypes!: string[];
  @IsOptional() @IsIn(['BRN', 'NRIC', 'PASSPORT', 'NONE']) registrationNoType?: string;
  @IsOptional() @IsString() @Length(1, 80) registrationNo?: string;
  @IsOptional() @IsString() @Length(1, 80) oldRegistrationNo?: string;
  @IsOptional() @IsString() @Length(1, 60) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(1, 80) taxId?: string;
  @IsOptional() @IsString() @Length(1, 80) sstRegistrationNo?: string;
  @IsOptional() @IsString() @Length(1, 160) company?: string;
  @IsOptional() @IsString() @Length(1, 800) address?: string;
  @IsOptional() @IsString() @Length(1, 120) city?: string;
  @IsOptional() @IsString() @Length(1, 120) state?: string;
  @IsOptional() @Matches(/^\d{5}$/) postcode?: string;
  @IsOptional() @IsString() @Length(2, 2) countryCode?: string;
  @IsOptional() @IsString() @Length(1, 1000) remarks?: string;
}
