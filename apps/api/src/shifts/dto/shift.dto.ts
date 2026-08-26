import { IsIn, IsNumber, IsPositive, IsString, Min, MinLength } from 'class-validator';

export class OpenShiftDto {
  @IsString() companyId!: string;
  @IsString() locationId!: string;
  @IsString() registerId!: string;
  @IsString() cashierId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) openingFloat!: number;
}

export class CashMovementDto {
  @IsString() companyId!: string;
  @IsString() cashierId!: string;
  @IsIn(['CASH_IN', 'CASH_OUT']) type!: 'CASH_IN' | 'CASH_OUT';
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount!: number;
  @IsString() @MinLength(1) reason!: string;
}

export class CloseShiftDto {
  @IsString() companyId!: string;
  @IsString() cashierId!: string;
  @IsString() managerId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) closingFloat!: number;
}
