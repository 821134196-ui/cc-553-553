import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../auth/auth.guard';
import { CreatePayoutDto } from './payouts.dto';

/**
 * 本地模拟兑付回执。真实环境对接银行/财政代发接口，
 * 这里生成带凭证号的回执，并以“兑付成功”本地落库。
 */
@Injectable()
export class PayoutsService {
  constructor(private prisma: PrismaService) {}

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  private static receiptInclude = {
    period: true,
    farmer: { select: { id: true, name: true, username: true } },
    createdBy: { select: { id: true, name: true } },
    lines: { include: { ticket: { select: { id: true, ticketNo: true } }, plot: { select: { code: true, name: true } } } },
  } satisfies Prisma.PayoutInclude;

  /**
   * 生成（或取回）某种植户某期次的兑付回执。
   * 关键约束：
   * - 只汇总审核通过、且未兑付的数量；
   * - 每个种植户每期最多一张回执（DB 唯一约束兜底）；
   * - idempotencyKey 重复提交直接返回原回执，绝不重复加钱；
   * - 无待兑付数量时拒绝出单。
   */
  async create(user: JwtUser, dto: CreatePayoutDto) {
    const period = await this.prisma.subsidyPeriod.findUnique({ where: { id: dto.periodId } });
    if (!period) throw new NotFoundException('补贴期次不存在');

    // 幂等：重复提交兑付返回既有回执
    if (dto.idempotencyKey) {
      const existing = await this.prisma.payout.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: PayoutsService.receiptInclude,
      });
      if (existing) {
        return { payout: existing, duplicated: true, mockReceipt: this.mockReceipt(existing) };
      }
    }

    const prior = await this.prisma.payout.findUnique({
      where: { periodId_farmerId: { periodId: dto.periodId, farmerId: dto.farmerId } },
    });
    if (prior) {
      const full = await this.prisma.payout.findUniqueOrThrow({
        where: { id: prior.id },
        include: PayoutsService.receiptInclude,
      });
      return { payout: full, duplicated: true, mockReceipt: this.mockReceipt(full) };
    }

    const tickets = await this.prisma.ticket.findMany({
      where: {
        periodId: dto.periodId,
        farmerId: dto.farmerId,
        status: 'APPROVED',
        eligibleWeight: { gt: 0 },
      },
      orderBy: { id: 'asc' },
    });
    const payable = tickets.filter((t) => t.eligibleWeight - t.paidWeight > 0.001);
    if (payable.length === 0) {
      throw new BadRequestException('该种植户当前没有审核通过且待兑付的补贴数量');
    }

    const lines = payable.map((t) => {
      const weight = this.round2(t.eligibleWeight - t.paidWeight);
      return {
        ticketId: t.id,
        plotId: t.plotId,
        weight,
        amount: this.round2(weight * period.ratePerKg),
      };
    });
    const totalWeight = this.round2(lines.reduce((s, l) => s + l.weight, 0));
    const amount = this.round2(lines.reduce((s, l) => s + l.amount, 0));

    const payoutCount = await this.prisma.payout.count();
    const receiptNo = `PAY-${period.code}-${String(payoutCount + 1).padStart(4, '0')}`;
    // 未显式传幂等键时，按 期次+种植户 生成确定键，天然防重复点击
    const idempotencyKey =
      dto.idempotencyKey ?? `auto:${dto.periodId}:${dto.farmerId}`;

    try {
      const payout = await this.prisma.$transaction(async (tx) => {
        const created = await tx.payout.create({
          data: {
            receiptNo,
            periodId: dto.periodId,
            farmerId: dto.farmerId,
            totalWeight,
            amount,
            idempotencyKey,
            createdById: user.sub,
            lines: { create: lines },
          },
          include: PayoutsService.receiptInclude,
        });
        for (const t of payable) {
          await tx.ticket.update({
            where: { id: t.id },
            data: { paidWeight: t.eligibleWeight },
          });
        }
        return created;
      });
      return { payout, duplicated: false, mockReceipt: this.mockReceipt(payout) };
    } catch (e) {
      // 唯一约束冲突（并发重复提交）→ 取回既有回执，金额不变
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.payout.findUniqueOrThrow({
          where: { periodId_farmerId: { periodId: dto.periodId, farmerId: dto.farmerId } },
          include: PayoutsService.receiptInclude,
        });
        return { payout: existing, duplicated: true, mockReceipt: this.mockReceipt(existing) };
      }
      throw e;
    }
  }

  list(user: JwtUser, periodId?: number) {
    return this.prisma.payout.findMany({
      where: {
        ...(periodId ? { periodId } : {}),
        ...(user.role === 'FARMER' ? { farmerId: user.sub } : {}),
      },
      orderBy: { id: 'desc' },
      include: PayoutsService.receiptInclude,
    });
  }

  private mockReceipt(p: { receiptNo: string; totalWeight: number; amount: number; createdAt: Date; farmer: { name: string } }) {
    return {
      channel: '本地模拟兑付（财政惠农一卡通）',
      status: 'SUCCESS',
      receiptNo: p.receiptNo,
      payee: p.farmer.name,
      totalWeightKg: p.totalWeight,
      amountYuan: p.amount,
      paidAt: p.createdAt.toISOString(),
      remark: '本回执由本地模拟器生成，不代表真实资金划转',
    };
  }
}
