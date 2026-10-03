import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, JwtUser } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ViewsService } from './views.service';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class ViewsController {
  constructor(private views: ViewsService) {}

  @Roles('ADMIN', 'REVIEWER', 'COLLECTOR')
  @Get('admin/plot-summary')
  plotSummary(@Query('periodId') periodId?: string) {
    return this.views.plotSummary(periodId ? Number(periodId) : undefined);
  }

  @Roles('ADMIN', 'REVIEWER')
  @Get('admin/quota')
  quota() {
    return this.views.quotaBoard();
  }

  @Roles('FARMER')
  @Get('farmer/dashboard')
  farmer(@CurrentUser() user: JwtUser) {
    return this.views.farmerDashboard(user);
  }

  // 基础数据：收料/审核/管理员都可用
  @Roles('ADMIN', 'COLLECTOR', 'REVIEWER')
  @Get('master-data')
  master() {
    return this.views.masterData();
  }
}
