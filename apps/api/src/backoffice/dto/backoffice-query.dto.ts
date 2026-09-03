import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BackOfficeQueryDto {
  @IsString() companyId!: string;
  @IsString() actorId!: string;
  @IsOptional() @IsIn(['TODAY', 'WEEK', 'MONTH', 'CUSTOM']) range?: 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM';
  @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @IsOptional() @IsISO8601({ strict: true }) to?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() registerId?: string;
}

export const INVENTORY_SOURCE_TYPES = ['BUKKU_PURCHASE', 'STAFF_COUNT', 'STAFF_ADJUSTMENT', 'POS_SALE', 'RETURN', 'TRANSFER', 'OPENING_BALANCE'] as const;

export class InventoryLedgerQueryDto {
  @IsString() companyId!: string;
  @IsString() actorId!: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsIn(INVENTORY_SOURCE_TYPES) sourceType?: typeof INVENTORY_SOURCE_TYPES[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}
