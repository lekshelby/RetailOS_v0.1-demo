import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsPositive, IsString, Max, Min, ValidateNested } from 'class-validator';

export class DiscountInputDto {
  @IsIn(['PERCENTAGE', 'FIXED']) type!: 'PERCENTAGE' | 'FIXED';
  @IsNumber() @Min(0) value!: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() approvedById?: string;
}

export class CheckoutItemDto {
  @IsString() productId!: string;
  @IsString() uomId!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() quantity!: number;
  @IsOptional() @ValidateNested() @Type(() => DiscountInputDto) discount?: DiscountInputDto;
}

export class PaymentInputDto {
  @IsIn(['CASH', 'CARD', 'DUITNOW', 'BANK_TRANSFER', 'STORE_CREDIT', 'OTHER'])
  method!: 'CASH' | 'CARD' | 'DUITNOW' | 'BANK_TRANSFER' | 'STORE_CREDIT' | 'OTHER';
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount!: number;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() storeCreditId?: string;
}

export class ExchangeRefundInputDto {
  @IsIn(['CASH', 'CARD', 'DUITNOW', 'BANK_TRANSFER', 'OTHER'])
  method!: 'CASH' | 'CARD' | 'DUITNOW' | 'BANK_TRANSFER' | 'OTHER';
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount!: number;
}

export class VoidSaleDto {
  @IsString() companyId!: string;
  @IsString() actorId!: string;
  @IsString() reason!: string;
}

export class MarkReceiptPrintedDto {
  @IsString() companyId!: string;
  @IsString() actorId!: string;
}

export class CheckoutDto {
  @IsString() companyId!: string;
  @IsString() locationId!: string;
  @IsString() registerId!: string;
  @IsString() cashierId!: string;
  @IsString() priceLevelId!: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() exchangeReturnId?: string;
  @IsOptional() @ValidateNested() @Type(() => ExchangeRefundInputDto) exchangeRefund?: ExchangeRefundInputDto;
  @IsOptional() @IsString() shiftId?: string;
  @IsOptional() @IsString() offlineId?: string;
  @IsOptional() @IsString() deviceId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];
  @IsOptional() @ValidateNested() @Type(() => DiscountInputDto) saleDiscount?: DiscountInputDto;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PaymentInputDto)
  payments!: PaymentInputDto[];
}
