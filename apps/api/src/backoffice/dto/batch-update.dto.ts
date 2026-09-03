import { IsBoolean, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export const PRODUCT_BATCH_TYPE = 'PRODUCT_CSV' as const;
export type BatchUpdateType = typeof PRODUCT_BATCH_TYPE;

export class BatchActorDto {
  @IsString() companyId!: string;
  @IsString() actorId!: string;
}

export class BatchTemplateQueryDto extends BatchActorDto {}

export class PreviewBatchDto extends BatchActorDto {
  @IsString() @Length(1, 180) fileName!: string;
  @IsString() @Length(1, 120) mimeType!: string;
  @IsString() @MaxLength(7_100_000) contentBase64!: string;
}

export class CommitBatchDto extends BatchActorDto {
  @IsBoolean() confirmed!: boolean;
  @IsOptional() @IsBoolean() stockShortageAcknowledged?: boolean;
  @IsOptional() @IsString() managerId?: string;
}

export class BatchResultQueryDto extends BatchActorDto {
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() errorsOnly?: boolean;
}
