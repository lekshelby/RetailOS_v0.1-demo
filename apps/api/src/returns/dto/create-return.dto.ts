import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';

export class ReturnLineDto {
  @IsString() saleItemId!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive() quantity!: number;
}

export class CreateReturnDto {
  @IsString() companyId!: string;
  @IsString() cashierId!: string;
  @IsString() saleId!: string;
  @IsOptional() @IsString() shiftId?: string;
  @IsIn(['REFUND', 'DISPOSE', 'EXCHANGE']) type!: 'REFUND' | 'DISPOSE' | 'EXCHANGE';
  @IsOptional() @IsIn(['CASH', 'CARD', 'DUITNOW', 'BANK_TRANSFER', 'STORE_CREDIT', 'OTHER']) refundMethod?: 'CASH' | 'CARD' | 'DUITNOW' | 'BANK_TRANSFER' | 'STORE_CREDIT' | 'OTHER';
  @IsOptional() @IsString() reason?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReturnLineDto) items!: ReturnLineDto[];
}

export class RefundStoreCreditDto {
  @IsString() companyId!: string;
  @IsString() cashierId!: string;
  @IsOptional() @IsString() shiftId?: string;
  @IsIn(['CASH', 'CARD', 'DUITNOW', 'BANK_TRANSFER', 'OTHER']) refundMethod!: 'CASH' | 'CARD' | 'DUITNOW' | 'BANK_TRANSFER' | 'OTHER';
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount!: number;
}
