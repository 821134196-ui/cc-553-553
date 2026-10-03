import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, JwtUser } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PayoutsService } from './payouts.service';
import { CreatePayoutDto } from './payouts.dto';

@Controller('payouts')
@UseGuards(AuthGuard, RolesGuard)
export class PayoutsController {
  constructor(private payouts: PayoutsService) {}

  @Roles('ADMIN')
  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreatePayoutDto) {
    return this.payouts.create(user, dto);
  }

  // 管理员看全部，种植户只能看自己的回执
  @Roles('ADMIN', 'REVIEWER', 'FARMER')
  @Get()
  list(@CurrentUser() user: JwtUser, @Query('periodId') periodId?: string) {
    return this.payouts.list(user, periodId ? Number(periodId) : undefined);
  }
}
