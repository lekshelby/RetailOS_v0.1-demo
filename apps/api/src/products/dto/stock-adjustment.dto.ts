import { IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class StockAdjustmentDto {
  @IsString() companyId!: string;
  @IsString() locationId!: string;
  @IsString() actorId!: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) countedQuantity!: number;
  @IsString() @MaxLength(500) reason!: string;
}
