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
import { RecordsService } from './records.service';
import { CorrectionDto, CreateWeighDto, ReviewDto, SortingDto } from './dto';

class ClearDupDto {
  @IsString()
  @IsOptional()
  note?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('records')
export class RecordsController {
  constructor(private records: RecordsService) {}

  /** 过磅登记（收料员/管理员） */
  @Roles(ROLES.COLLECTOR, ROLES.ADMIN)
  @Post()
  create(@Body() dto: CreateWeighDto, @CurrentUser() user: any) {
    return this.records.createWeigh(dto, user);
  }

  /** 单据列表：种植户仅能看到自己的单据与处理进度 */
  @Get()
  list(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('plotId') plotId?: string,
  ) {
    return this.records.list(
      user,
      {
        status,
        plotId: plotId ? Number(plotId) : undefined,
      },
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.records.findOne(id, user);
  }

  /** 分拣补录净重与质量等级（收料员） */
  @Roles(ROLES.COLLECTOR, ROLES.ADMIN)
  @Post(':id/sorting')
  sorting(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SortingDto,
    @CurrentUser() user: any,
  ) {
    return this.records.addSorting(id, dto, user);
  }

  /** 称重修正（审核人员/管理员；不能修正本人登记的单） */
  @Roles(ROLES.REVIEWER, ROLES.ADMIN)
  @Post(':id/corrections')
  correct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorrectionDto,
    @CurrentUser() user: any,
  ) {
    return this.records.correct(id, dto, user);
  }

  /** 补贴资格审核（审核人员/管理员；收料员不能审自己的单） */
  @Roles(ROLES.REVIEWER, ROLES.ADMIN)
  @Post(':id/review')
  review(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewDto,
    @CurrentUser() user: any,
  ) {
    return this.records.review(id, dto, user);
  }

  /** 核实后解除重复过磅嫌疑 */
  @Roles(ROLES.REVIEWER, ROLES.ADMIN)
  @Post(':id/clear-duplicate')
  clearDuplicate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ClearDupDto,
    @CurrentUser() user: any,
  ) {
    return this.records.clearDuplicate(id, dto.note ?? '', user);
  }
}
