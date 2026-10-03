import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** 泥土夹杂比例上限：超过 10% 判定为泥土过多，不进入补贴 */
export const DIRT_RATE_LIMIT = 0.1;
/** 质量等级折算系数：A 级全额，B 级按 85% 计补贴量，REJECT 不计 */
export const GRADE_FACTOR: Record<string, number> = { A: 1, B: 0.85 };

export interface CapResult {
  eligible: number;
  notes: string[];
}

@Injectable()
export class SubsidyService {
  constructor(private prisma: PrismaService) {}

  round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /**
   * 计算单据可计入补贴的数量，同时受三重约束：
   * 1) 质量折算（等级 + 分拣净重）
   * 2) 地块面积上限（亩数 × 每亩回收上限）
   * 3) 当期总额度
   * 已审核通过的其它单据先占用额度，本单据按剩余空间裁剪。
   */
  async computeEligible(params: {
    periodId: number;
    plotId: number;
    netWeight: number;
    grade: string;
    excludeTicketId?: number;
  }): Promise<CapResult> {
    const notes: string[] = [];
    const { periodId, plotId, netWeight, grade, excludeTicketId } = params;

    const period = await this.prisma.subsidyPeriod.findUniqueOrThrow({
      where: { id: periodId },
    });
    const plot = await this.prisma.plot.findUniqueOrThrow({ where: { id: plotId } });

    const factor = GRADE_FACTOR[grade] ?? 0;
    let eligible = this.round2(netWeight * factor);
    notes.push(`分拣净重 ${netWeight}kg × 等级${grade}系数 ${factor} = ${eligible}kg`);

    // 地块面积上限
    const approvedForPlot = await this.prisma.ticket.aggregate({
      where: {
        plotId,
        periodId,
        status: 'APPROVED',
        ...(excludeTicketId ? { NOT: { id: excludeTicketId } } : {}),
      },
      _sum: { eligibleWeight: true },
    });
    const plotUsed = this.round2(approvedForPlot._sum.eligibleWeight ?? 0);
    const plotCap = this.round2(plot.areaMu * period.kgPerMu);
    const plotRemaining = this.round2(plotCap - plotUsed);
    if (eligible > plotRemaining) {
      notes.push(
        `地块面积上限裁剪：${plot.code} 共 ${plot.areaMu} 亩 × ${period.kgPerMu}kg/亩 = ${plotCap}kg，已用 ${plotUsed}kg，剩余 ${plotRemaining}kg`,
      );
      eligible = this.round2(Math.max(0, Math.min(eligible, plotRemaining)));
    }

    // 当期总额度
    const approvedForPeriod = await this.prisma.ticket.aggregate({
      where: {
        periodId,
        status: 'APPROVED',
        ...(excludeTicketId ? { NOT: { id: excludeTicketId } } : {}),
      },
      _sum: { eligibleWeight: true },
    });
    const periodUsed = this.round2(approvedForPeriod._sum.eligibleWeight ?? 0);
    const periodRemaining = this.round2(period.totalQuotaKg - periodUsed);
    if (eligible > periodRemaining) {
      notes.push(
        `当期额度裁剪：总额度 ${period.totalQuotaKg}kg，已用 ${periodUsed}kg，剩余 ${periodRemaining}kg`,
      );
      eligible = this.round2(Math.max(0, Math.min(eligible, periodRemaining)));
    }

    return { eligible, notes };
  }

  assertApprovable(sort: {
    qualityGrade: string | null;
    dirtRate: number | null;
    duplicateOfId: number | null;
  }) {
    if (sort.duplicateOfId) {
      throw new BadRequestException(
        `该单据被标记为第 ${sort.duplicateOfId} 号单的同批膜重复过磅，不得计入补贴，请驳回`,
      );
    }
    if ((sort.dirtRate ?? 0) > DIRT_RATE_LIMIT) {
      throw new BadRequestException(
        `泥土夹杂比例 ${((sort.dirtRate ?? 0) * 100).toFixed(1)}% 超过 ${DIRT_RATE_LIMIT * 100}% 上限，不得计入补贴，请驳回`,
      );
    }
    if (sort.qualityGrade !== 'A' && sort.qualityGrade !== 'B') {
      throw new BadRequestException('质量等级为 REJECT 的单据不能通过审核');
    }
  }
}
