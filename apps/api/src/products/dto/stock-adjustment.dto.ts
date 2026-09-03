import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class StockAdjustmentDto {
  @IsString() companyId!: string;
  @IsString() locationId!: string;
  @IsString() actorId!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) countedQuantity!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) unitCost?: number;
  @IsOptional() @IsString() fifoOverrideBatchId?: string;
  @IsOptional() @IsString() @MaxLength(500) fifoOverrideReason?: string;
  @IsOptional() @IsBoolean() stockShortageAcknowledged?: boolean;
  @IsString() @MaxLength(500) reason!: string;
}
