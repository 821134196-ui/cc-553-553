import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, JwtUser } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { TicketsService } from './tickets.service';
import { CorrectionDto, SortingDto, WeighInDto } from './tickets.dto';

@Controller('tickets')
@UseGuards(AuthGuard, RolesGuard)
export class TicketsController {
  constructor(private tickets: TicketsService) {}

  // 地磅模拟读数（收料端调用，展示仪表跳变）
  @Roles('COLLECTOR', 'ADMIN')
  @Get('scale-reading')
  scale() {
    return { message: '过磅时自动读取地磅，无需手工输入毛重/皮重' };
  }

  // 过磅登记
  @Roles('COLLECTOR', 'ADMIN')
  @Post()
  weighIn(@CurrentUser() user: JwtUser, @Body() dto: WeighInDto) {
    return this.tickets.weighIn(user, dto);
  }

  // 分拣补充
  @Roles('COLLECTOR', 'ADMIN')
  @Post(':id/sorting')
  sorting(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SortingDto,
  ) {
    return this.tickets.sorting(user, id, dto);
  }

  // 称重修正（原值/原因/复核人留痕）
  @Roles('REVIEWER', 'ADMIN')
  @Post(':id/corrections')
  correct(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorrectionDto,
  ) {
    return this.tickets.correct(user, id, dto);
  }

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.tickets.list(user);
  }

  @Get(':id')
  detail(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.tickets.detail(user, id);
  }
}
