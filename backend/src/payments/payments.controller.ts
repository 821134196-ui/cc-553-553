import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ROLES } from '../domain';
import { PaymentsService } from './payments.service';

class PayDto {
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  /** 兑付（管理员）。重复提交返回原回执，不增加补贴金额 */
  @Roles(ROLES.ADMIN)
  @Post('records/:id/pay')
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayDto,
    @CurrentUser() user: any,
  ) {
    return this.payments.pay(id, user, dto.idempotencyKey);
  }

  /** 兑付清单：种植户只看自己的回执 */
  @Get()
  list(@CurrentUser() user: any, @Query('farmerId') farmerId?: string) {
    return this.payments.list(
      user.role === ROLES.FARMER ? { farmerId: user.id } : { farmerId: farmerId ? Number(farmerId) : undefined },
    );
  }
}
