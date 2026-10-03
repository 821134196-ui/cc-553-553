import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { ROLES } from '../domain';
import { ScaleService } from './scale.service';
import { PrismaService } from '../prisma/prisma.service';

class ReadScaleDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedGross?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedTare?: number;

  @IsOptional()
  ticketNo?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('scale')
export class ScaleController {
  constructor(
    private scale: ScaleService,
    private prisma: PrismaService,
  ) {}

  /** 收料员触发地磅读数（本地模拟），读数留痕 */
  @Roles(ROLES.COLLECTOR, ROLES.ADMIN)
  @Post('read')
  async read(@Body() dto: ReadScaleDto) {
    const result = this.scale.read(dto.expectedGross ?? 120, dto.expectedTare ?? 5);
    await this.prisma.scaleReading.create({
      data: {
        ticketNo: dto.ticketNo || `SIM-${Date.now()}`,
        grossKg: result.grossKg,
        tareKg: result.tareKg,
        stable: result.stable,
        deviceId: result.deviceId,
      },
    });
    return result;
  }
}
