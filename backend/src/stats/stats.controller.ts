import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { StatsService } from './stats.service';

@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private stats: StatsService) {}

  /** 按地块汇总：回收量 / 合格量 / 已兑付量 + 当期额度 */
  @Get('by-plot')
  byPlot(@CurrentUser() user: any, @Query('periodId') periodId?: string) {
    return this.stats.byPlot(user, periodId ? Number(periodId) : undefined);
  }
}
