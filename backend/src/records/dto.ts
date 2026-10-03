import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { FILM_TYPES } from '../domain';

export class CreateWeighDto {
  @IsInt()
  plotId: number;

  @IsEnum(FILM_TYPES)
  filmType: string;

  @IsNumber()
  @Min(0)
  grossWeightKg: number;

  @IsNumber()
  @Min(0)
  tareWeightKg: number;

  /** 幂等键：同一请求重放不会重复过磅 */
  @IsOptional()
  @IsString()
  clientTicketNo?: string;

  /** 登记时指定种植户（收料员代登记）；缺省取地块所属种植户 */
  @IsOptional()
  @IsInt()
  farmerId?: number;
}

export class SortingDto {
  @IsNumber()
  @Min(0)
  sortedNetWeightKg: number;

  @IsEnum(['A', 'B', 'C', 'REJECT'])
  grade: string;

  @IsOptional()
  @IsString()
  qualityNote?: string;
}

export class CorrectionDto {
  @IsEnum(['GROSS_WEIGHT', 'TARE_WEIGHT', 'SORTED_NET_WEIGHT', 'GRADE'])
  field: string;

  @IsString()
  newValue: string;

  @IsString()
  reason: string;
}

export class ReviewDto {
  @IsEnum(['APPROVE', 'REJECT'])
  decision: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsEnum(['SOIL_CONTAMINATION', 'DUPLICATE_FILM', 'OTHER'])
  rejectReason?: string;

  @IsOptional()
  @IsString()
  reviewNote?: string;
}
