import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RECORD_STATUS } from '../domain';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  /** 本地模拟兑付回执（真实场景对接银行/惠农一卡通接口） */
  private issueReceipt(recordId: number, amountYuan: number) {
    const seq = String(100000 + recordId);
    const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
    return {
      receiptNo: `RC${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${seq}${rnd}`,
      channel: 'LOCAL_MOCK_EWALLET',
      paidAt: new Date(),
      echoAmountYuan: amountYuan,
    };
  }

  /**
   * 对一张已审核单据发起兑付。
   * - 仅 APPROVED 且金额>0 可兑付；
   * - recordId 唯一 + idempotencyKey 唯一，重复兑付返回原回执，金额不重复增加；
   * - 兑付金额永远取单据上的核定金额，不信任客户端传入金额。
   */
  async pay(recordId: number, operator: { id: number }, idempotencyKey?: string) {
    const key = idempotencyKey || `pay-${recordId}`;

    // 重复提交：直接返回既有回执
    const existingByKey = await this.prisma.payment.findUnique({ where: { idempotencyKey: key } });
    if (existingByKey) {
      const record = await this.prisma.weighRecord.findUnique({ where: { id: recordId } });
      return { payment: existingByKey, record, idempotentReplay: true };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const record = await tx.weighRecord.findUnique({
          where: { id: recordId },
          include: { payment: true },
        });
        if (!record) throw new NotFoundException('单据不存在');
        if (record.payment || record.isPaid) {
          // 一票一兑付：已兑付过，返回原回执
          const old = await tx.payment.findUnique({ where: { recordId } });
          return { payment: old, record, idempotentReplay: true };
        }
        if (record.status !== RECORD_STATUS.APPROVED) {
          throw new BadRequestException('仅审核通过的单据可以兑付');
        }
        if (record.subsidyYuan <= 0) {
          throw new BadRequestException('核定补贴金额为 0，无需兑付');
        }

        const receipt = this.issueReceipt(recordId, round2(record.subsidyYuan));
        const payment = await tx.payment.create({
          data: {
            recordId: record.id,
            farmerId: record.farmerId,
            periodId: record.periodId,
            amountKg: round2(record.approvedSubsidyKg),
            amountYuan: round2(record.subsidyYuan),
            receiptNo: receipt.receiptNo,
            idempotencyKey: key,
            paidBy: operator.id,
            paidAt: receipt.paidAt,
          },
        });
        await tx.weighRecord.update({ where: { id: recordId }, data: { isPaid: true } });
        return { payment, record };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // 并发重复兑付撞到唯一约束：回查原回执
        const payment = await this.prisma.payment.findFirst({
          where: { OR: [{ recordId }, { idempotencyKey: key }] },
        });
        const record = await this.prisma.weighRecord.findUnique({ where: { id: recordId } });
        return { payment: payment!, record, idempotentReplay: true };
      }
      throw e;
    }
  }

  list(filters: { farmerId?: number }) {
    return this.prisma.payment.findMany({
      where: filters.farmerId ? { farmerId: filters.farmerId } : {},
      orderBy: { id: 'desc' },
      include: {
        record: { select: { id: true, ticketNo: true, filmType: true } },
        farmer: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
    });
  }
}
