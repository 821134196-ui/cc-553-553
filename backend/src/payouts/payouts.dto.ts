import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePayoutDto {
  @IsInt()
  periodId: number;

  @IsInt()
  farmerId: number;

  // 幂等键：同一批次重复提交兑付返回同一张回执，金额不重复累加
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
