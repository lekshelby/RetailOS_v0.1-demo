import { IsBoolean, IsNumber, IsString, Length, Min } from 'class-validator';
import { BatchActorDto } from './batch-update.dto';

export class PurchaseReceiptQueryDto extends BatchActorDto {}

export class PostPurchaseReceiptDto extends BatchActorDto {
  @IsBoolean() confirmed!: boolean;
  @IsBoolean() negativeStockAcknowledged!: boolean;
  @IsString() managerId!: string;
}

export class SettleShortageDto extends PostPurchaseReceiptDto {
  @IsString() targetBatchId!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsString() @Length(1, 300) reason!: string;
}
