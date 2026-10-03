import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PlotsService } from './plots.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class PlotsController {
  constructor(private plots: PlotsService) {}

  @Get('plots')
  list(@CurrentUser() user: any) {
    return this.plots.list(user);
  }

  @Get('meta')
  meta() {
    return this.plots.meta();
  }
}
