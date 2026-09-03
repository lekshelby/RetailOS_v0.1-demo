import { IsBoolean, IsIn, IsNumber, IsOptional, IsPositive, IsString, Max, Min, MinLength } from 'class-validator';

export class OpenShiftDto {
  @IsString() companyId!: string;
  @IsString() locationId!: string;
  @IsString() registerId!: string;
  @IsString() cashierId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10000) openingFloat!: number;
  @IsOptional() @IsString() managerId?: string;
  @IsOptional() @IsBoolean() anomalyConfirmed?: boolean;
}

export class CashMovementDto {
  @IsString() companyId!: string;
  @IsString() cashierId!: string;
  @IsIn(['CASH_IN', 'CASH_OUT']) type!: 'CASH_IN' | 'CASH_OUT';
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(10000) amount!: number;
  @IsString() @MinLength(1) reason!: string;
  @IsOptional() @IsString() managerId?: string;
  @IsOptional() @IsBoolean() anomalyConfirmed?: boolean;
}

export class CloseShiftDto {
  @IsString() companyId!: string;
  @IsString() cashierId!: string;
  @IsString() managerId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) closingFloat!: number;
  @IsOptional() @IsBoolean() stockShortageAcknowledged?: boolean;
}

export class CorrectOpeningFloatDto {
  @IsString() companyId!: string;
  @IsString() managerId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10000) correctedOpeningFloat!: number;
  @IsString() @MinLength(1) reason!: string;
}
