import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RECORD_STATUS, ROLES } from '../domain';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  /**
   * 管理页面：按地块展示回收量 / 合格量 / 已兑付量。
   * - 回收量：过磅净重合计（不含驳回单）
   * - 合格量：审核通过的补贴量合计
   * - 已兑付量：已兑付公斤数与金额
   */
  async byPlot(user: { id: number; role: string }, periodId?: number) {
    const periodWhere = periodId ? { id: periodId } : { active: true };
    const period = await this.prisma.subsidyPeriod.findFirst({
      where: periodWhere,
      orderBy: { id: 'desc' },
    });
    if (!period) return { period: null, plots: [] };

    const plots = await this.prisma.plot.findMany({
      where: user.role === ROLES.FARMER ? { farmerId: user.id } : {},
      orderBy: { code: 'asc' },
      include: { farmer: { select: { id: true, name: true, username: true } } },
    });

    const rows = await Promise.all(
      plots.map(async (plot) => {
        const recordBase = { plotId: plot.id, periodId: period.id };
        const [recycled, qualified, paid] = await Promise.all([
          this.prisma.weighRecord.aggregate({
            where: {
              ...recordBase,
              status: { in: [RECORD_STATUS.SORTED, RECORD_STATUS.APPROVED] },
            },
            _sum: { netWeightKg: true },
            _count: true,
          }),
          this.prisma.weighRecord.aggregate({
            where: { ...recordBase, status: RECORD_STATUS.APPROVED },
            _sum: { approvedSubsidyKg: true, subsidyYuan: true },
          }),
          this.prisma.payment.aggregate({
            where: { periodId: period.id, record: { plotId: plot.id } },
            _sum: { amountKg: true, amountYuan: true },
            _count: true,
          }),
        ]);
        return {
          plotId: plot.id,
          plotCode: plot.code,
          plotName: plot.name,
          areaMu: plot.areaMu,
          farmer: plot.farmer,
          ticketCount: recycled._count,
          recycledKg: round2(recycled._sum.netWeightKg ?? 0),
          qualifiedKg: round2(qualified._sum.approvedSubsidyKg ?? 0),
          qualifiedYuan: round2(qualified._sum.subsidyYuan ?? 0),
          paidKg: round2(paid._sum.amountKg ?? 0),
          paidYuan: round2(paid._sum.amountYuan ?? 0),
          paidCount: paid._count,
          plotCapKg: round2(plot.areaMu * period.perMuCapKg),
        };
      }),
    );

    return {
      period: {
        id: period.id,
        code: period.code,
        name: period.name,
        totalQuotaYuan: period.totalQuotaYuan,
        usedQuotaYuan: round2(period.usedQuotaYuan),
        remainingQuotaYuan: round2(period.totalQuotaYuan - period.usedQuotaYuan),
        perMuCapKg: period.perMuCapKg,
        pricePerKg: period.pricePerKg,
      },
      plots: rows,
    };
  }
}
