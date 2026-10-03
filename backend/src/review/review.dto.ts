import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ReviewDto {
  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}
