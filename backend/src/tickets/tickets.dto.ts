import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class WeighInDto {
  @IsInt()
  farmerId: number;

  @IsInt()
  plotId: number;

  @IsEnum(['MULCH', 'SHED'])
  filmType: 'MULCH' | 'SHED';

  @IsOptional()
  @IsString()
  batchCode?: string;

  // 仅用于本地模拟地磅：期望的净重基准值；真实设备环境应删除
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedKg?: number;
}

export class SortingDto {
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  netWeight: number;

  @IsEnum(['A', 'B', 'REJECT'])
  qualityGrade: 'A' | 'B' | 'REJECT';

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  dirtRate: number;
}

export class CorrectionDto {
  @IsEnum(['GROSS', 'TARE', 'NET'])
  fieldName: 'GROSS' | 'TARE' | 'NET';

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  newValue: number;

  @IsString()
  reason: string;
}
