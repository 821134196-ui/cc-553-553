import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../auth/auth.guard';

@Injectable()
export class ViewsService {
  constructor(private prisma: PrismaService) {}

  /** 管理页面：按地块展示回收量 / 合格量 / 已兑付量 */
  async plotSummary(periodId?: number) {
    const plots = await this.prisma.plot.findMany({
      orderBy: { code: 'asc' },
      include: { farmer: { select: { id: true, name: true, username: true } } },
    });
    const tickets = await this.prisma.ticket.findMany({
      where: periodId ? { periodId } : {},
      select: {
        plotId: true,
        status: true,
        netWeight: true,
        grossWeight: true,
        tareWeight: true,
        eligibleWeight: true,
        paidWeight: true,
      },
    });

    return plots.map((p) => {
      const rows = tickets.filter((t) => t.plotId === p.id);
      // 回收量：分拣后以净重计，未分拣以毛重-皮重暂计
      const recoveredKg = rows.reduce((s, t) => {
        const w = t.netWeight ?? Math.max(0, t.grossWeight - t.tareWeight);
        return s + (t.status === 'REJECTED' ? 0 : w);
      }, 0);
      const eligibleKg = rows
        .filter((t) => t.status === 'APPROVED')
        .reduce((s, t) => s + t.eligibleWeight, 0);
      const paidKg = rows.reduce((s, t) => s + t.paidWeight, 0);
      const rejectedCount = rows.filter((t) => t.status === 'REJECTED').length;
      return {
        plotId: p.id,
        plotCode: p.code,
        plotName: p.name,
        areaMu: p.areaMu,
        farmer: p.farmer,
        recoveredKg: Math.round(recoveredKg * 100) / 100,
        eligibleKg: Math.round(eligibleKg * 100) / 100,
        paidKg: Math.round(paidKg * 100) / 100,
        pendingKg: Math.round((eligibleKg - paidKg) * 100) / 100,
        rejectedCount,
      };
    });
  }

  /** 管理页面：当期额度占用 */
  async quotaBoard() {
    const periods = await this.prisma.subsidyPeriod.findMany({ orderBy: { id: 'desc' } });
    return Promise.all(
      periods.map(async (p) => {
        const agg = await this.prisma.ticket.aggregate({
          where: { periodId: p.id, status: 'APPROVED' },
          _sum: { eligibleWeight: true, paidWeight: true },
        });
        const eligible = agg._sum.eligibleWeight ?? 0;
        return {
          periodId: p.id,
          code: p.code,
          name: p.name,
          ratePerKg: p.ratePerKg,
          kgPerMu: p.kgPerMu,
          totalQuotaKg: p.totalQuotaKg,
          approvedKg: Math.round(eligible * 100) / 100,
          paidKg: Math.round((agg._sum.paidWeight ?? 0) * 100) / 100,
          remainingKg: Math.round((p.totalQuotaKg - eligible) * 100) / 100,
          quotaReached: eligible >= p.totalQuotaKg - 0.001,
        };
      }),
    );
  }

  /** 种植户页面：自己交了多少膜、处理进度、最终能领多少补贴 */
  async farmerDashboard(user: JwtUser) {
    const farmerId = user.sub;
    const plots = await this.prisma.plot.findMany({
      where: { farmerId },
      orderBy: { code: 'asc' },
    });
    const tickets = await this.prisma.ticket.findMany({
      where: { farmerId },
      orderBy: [{ periodId: 'asc' }, { id: 'asc' }],
      include: { period: true, plot: { select: { code: true, name: true } } },
    });
    const payouts = await this.prisma.payout.findMany({
      where: { farmerId },
      orderBy: { id: 'asc' },
      include: { period: true },
    });

    const byPeriod = new Map<
      number,
      {
        periodCode: string;
        periodName: string;
        submittedKg: number;
        eligibleKg: number;
        estimatedYuan: number;
        paidYuan: number;
        paidKg: number;
      }
    >();
    for (const t of tickets) {
      const cur =
        byPeriod.get(t.periodId) ??
        {
          periodCode: t.period.code,
          periodName: t.period.name,
          submittedKg: 0,
          eligibleKg: 0,
          estimatedYuan: 0,
          paidYuan: 0,
          paidKg: 0,
        };
      if (t.status !== 'REJECTED') {
        cur.submittedKg += t.netWeight ?? Math.max(0, t.grossWeight - t.tareWeight);
      }
      if (t.status === 'APPROVED') {
        cur.eligibleKg += t.eligibleWeight;
        cur.estimatedYuan += t.eligibleWeight * t.period.ratePerKg;
      }
      cur.paidKg += t.paidWeight;
      byPeriod.set(t.periodId, cur);
    }
    for (const p of payouts) {
      const cur = byPeriod.get(p.periodId);
      if (cur) cur.paidYuan += p.amount;
    }
    const round = (n: number) => Math.round(n * 100) / 100;

    return {
      plots,
      tickets: tickets.map((t) => ({
        id: t.id,
        ticketNo: t.ticketNo,
        periodCode: t.period.code,
        plotCode: t.plot.code,
        filmType: t.filmType,
        grossWeight: t.grossWeight,
        tareWeight: t.tareWeight,
        netWeight: t.netWeight,
        qualityGrade: t.qualityGrade,
        dirtRate: t.dirtRate,
        status: t.status,
        rejectReason: t.rejectReason,
        eligibleWeight: t.eligibleWeight,
        paidWeight: t.paidWeight,
        capNote: t.capNote,
        createdAt: t.createdAt,
      })),
      payouts,
      summary: [...byPeriod.values()].map((v) => ({
        ...v,
        submittedKg: round(v.submittedKg),
        eligibleKg: round(v.eligibleKg),
        estimatedYuan: round(v.estimatedYuan),
        paidYuan: round(v.paidYuan),
        paidKg: round(v.paidKg),
        pendingYuan: round(v.estimatedYuan - v.paidYuan),
      })),
    };
  }

  /** 基础数据（下拉框用）：种植户、地块、期次 */
  async masterData() {
    const [farmers, plots, periods] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'FARMER' },
        select: { id: true, name: true, username: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.plot.findMany({
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, areaMu: true, farmerId: true },
      }),
      this.prisma.subsidyPeriod.findMany({ orderBy: { id: 'desc' } }),
    ]);
    return { farmers, plots, periods };
  }
}
