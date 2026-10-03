import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScaleService } from '../scale/scale.service';
import { JwtUser } from '../auth/auth.guard';
import { CorrectionDto, SortingDto, WeighInDto } from './tickets.dto';

const ticketInclude = {
  farmer: { select: { id: true, name: true, username: true } },
  plot: { select: { id: true, code: true, name: true, areaMu: true } },
  period: { select: { id: true, code: true, name: true, ratePerKg: true } },
  collector: { select: { id: true, name: true } },
  reviewer: { select: { id: true, name: true } },
  duplicateOf: { select: { id: true, ticketNo: true } },
  corrections: {
    orderBy: { id: 'asc' },
    include: { reviewer: { select: { id: true, name: true } } },
  },
} satisfies Prisma.TicketInclude;

export type TicketDetail = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private scale: ScaleService,
  ) {}

  private serialize(t: TicketDetail) {
    return {
      ...t,
      rawNetWeight: Math.round((t.grossWeight - t.tareWeight) * 100) / 100,
    };
  }

  /** 过磅登记：种植户 + 地块 + 膜种类，读数来自本地模拟地磅 */
  async weighIn(user: JwtUser, dto: WeighInDto) {
    const plot = await this.prisma.plot.findUnique({ where: { id: dto.plotId } });
    if (!plot) throw new NotFoundException('地块不存在');
    if (plot.farmerId !== dto.farmerId) {
      throw new BadRequestException('该地块不属于所选种植户');
    }
    const period = await this.prisma.subsidyPeriod.findFirst({ where: { active: true } });
    if (!period) throw new BadRequestException('当前没有开放的补贴期次');

    const reading = this.scale.read(dto.expectedKg);
    if (reading.grossWeight <= reading.tareWeight) {
      throw new BadRequestException('地磅读数异常：毛重必须大于皮重');
    }

    // 同批膜重复过磅检测：
    // 1) 相同批次标记 batchCode；2) 同一种植户/地块/膜种类且毛重皮重完全相同
    const baseWhere: Prisma.TicketWhereInput = {
      periodId: period.id,
      farmerId: dto.farmerId,
      plotId: dto.plotId,
      filmType: dto.filmType,
      status: { not: 'REJECTED' },
    };
    const candidates = await this.prisma.ticket.findMany({
      where: {
        ...baseWhere,
        OR: [
          ...(dto.batchCode ? [{ batchCode: dto.batchCode }] : []),
          { grossWeight: reading.grossWeight, tareWeight: reading.tareWeight },
        ],
      },
      orderBy: { id: 'asc' },
    });
    const duplicateOf = candidates[0] ?? null;

    const count = await this.prisma.ticket.count();
    const ticketNo = `${period.code}-${String(count + 1).padStart(4, '0')}`;

    const ticket = await this.prisma.ticket.create({
      data: {
        ticketNo,
        periodId: period.id,
        farmerId: dto.farmerId,
        plotId: dto.plotId,
        filmType: dto.filmType,
        batchCode: dto.batchCode ?? null,
        grossWeight: reading.grossWeight,
        tareWeight: reading.tareWeight,
        collectorId: user.sub,
        duplicateOfId: duplicateOf?.id ?? null,
      },
      include: ticketInclude,
    });

    return {
      ticket: this.serialize(ticket),
      scaleReading: reading,
      warning: duplicateOf
        ? `检测到与第 ${duplicateOf.ticketNo} 号单疑似同批膜重复过磅，已标记，审核前不得计入补贴`
        : null,
    };
  }

  /** 分拣后补充净重、质量等级、泥土夹杂比例 */
  async sorting(user: JwtUser, id: number, dto: SortingDto) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id } });
    if (ticket.status !== 'PENDING_SORTING') {
      throw new BadRequestException(`单据当前状态 ${ticket.status}，不能再补充分拣结果`);
    }
    if (dto.netWeight > ticket.grossWeight - ticket.tareWeight + 0.5) {
      throw new BadRequestException('分拣净重不能超过毛重减皮重（允许 0.5kg 误差）');
    }
    if (dto.dirtRate > 1) throw new BadRequestException('泥土夹杂比例应在 0~1 之间');

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        netWeight: dto.netWeight,
        qualityGrade: dto.qualityGrade,
        dirtRate: dto.dirtRate,
        status: 'PENDING_REVIEW',
      },
      include: ticketInclude,
    });
    return this.serialize(updated);
  }

  /**
   * 称重修正：只允许在审核完成前进行。
   * 原值、新值、原因、复核人全部留痕，原始过磅读数字段被更新但历史永久保留在 WeightCorrection。
   */
  async correct(user: JwtUser, id: number, dto: CorrectionDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: { payoutLines: true },
    });
    if (!ticket) throw new NotFoundException('单据不存在');
    if (ticket.status === 'APPROVED') {
      throw new BadRequestException('已审核通过的单据不能直接修正，请走复核驳回流程');
    }
    if (ticket.payoutLines.length > 0) {
      throw new BadRequestException('已进入兑付的单据不能修正');
    }
    // 收料员不能作为自己单据的复核人
    if (ticket.collectorId === user.sub) {
      throw new ForbiddenException('收料员不能复核自己登记的单据');
    }

    const oldValue =
      dto.fieldName === 'GROSS'
        ? ticket.grossWeight
        : dto.fieldName === 'TARE'
          ? ticket.tareWeight
          : ticket.netWeight ?? 0;
    if (oldValue === dto.newValue) {
      throw new BadRequestException('修正后数值与原值相同，无需修正');
    }

    const data: Prisma.TicketUpdateInput = {};
    if (dto.fieldName === 'GROSS') data.grossWeight = dto.newValue;
    if (dto.fieldName === 'TARE') data.tareWeight = dto.newValue;
    if (dto.fieldName === 'NET') {
      data.netWeight = dto.newValue;
      // 尚未分拣时直接修正净重，视同补齐分拣结果后进入待审核
      if (ticket.status === 'PENDING_SORTING') data.status = 'PENDING_REVIEW';
    }
    if (dto.fieldName === 'GROSS' || dto.fieldName === 'TARE') {
      if (dto.newValue <= (dto.fieldName === 'GROSS' ? ticket.tareWeight : ticket.grossWeight)) {
        throw new BadRequestException('修正后毛重必须大于皮重');
      }
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.weightCorrection.create({
        data: {
          ticketId: id,
          fieldName: dto.fieldName,
          oldValue,
          newValue: dto.newValue,
          reason: dto.reason,
          reviewerId: user.sub,
        },
      }),
      this.prisma.ticket.update({ where: { id }, data, include: ticketInclude }),
    ]);
    return this.serialize(updated);
  }

  async list(user: JwtUser): Promise<Array<TicketDetail & { rawNetWeight: number }>> {
    const where: Prisma.TicketWhereInput =
      user.role === 'FARMER' ? { farmerId: user.sub } : {};
    const tickets = await this.prisma.ticket.findMany({
      where,
      orderBy: { id: 'desc' },
      include: ticketInclude,
    });
    return tickets.map((t) => this.serialize(t));
  }

  async detail(user: JwtUser, id: number) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id }, include: ticketInclude });
    if (!ticket) throw new NotFoundException('单据不存在');
    if (user.role === 'FARMER' && ticket.farmerId !== user.sub) {
      throw new ForbiddenException('种植户只能查看自己的收据');
    }
    return this.serialize(ticket);
  }
}
