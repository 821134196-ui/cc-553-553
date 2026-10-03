import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubsidyService } from '../subsidy/subsidy.service';
import { JwtUser } from '../auth/auth.guard';
import { ReviewDto } from './review.dto';

@Injectable()
export class ReviewService {
  constructor(
    private prisma: PrismaService,
    private subsidy: SubsidyService,
  ) {}

  private static include = {
    farmer: { select: { id: true, name: true } },
    plot: { select: { id: true, code: true, name: true, areaMu: true } },
    period: true,
    collector: { select: { id: true, name: true } },
    reviewer: { select: { id: true, name: true } },
    duplicateOf: { select: { id: true, ticketNo: true } },
  } satisfies Prisma.TicketInclude;

  pendingQueue() {
    return this.prisma.ticket.findMany({
      where: { status: 'PENDING_REVIEW' },
      orderBy: { id: 'asc' },
      include: ReviewService.include,
    });
  }

  /**
   * 审核确认补贴资格。
   * - 收料员不能审批自己登记的单据；
   * - 重复过磅、泥土过多、REJECT 等级只能驳回；
   * - 通过数量受地块面积与当期额度裁剪，裁剪说明写入 capNote。
   */
  async review(user: JwtUser, id: number, dto: ReviewDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: { payoutLines: true },
    });
    if (!ticket) throw new NotFoundException('单据不存在');

    // 收料员不能审批自己的单据（管理员若亲自收料同样受限）
    if (ticket.collectorId === user.sub) {
      throw new ForbiddenException('不能审批自己登记的过磅单据，请换其他审核人员');
    }
    if (ticket.payoutLines.length > 0) {
      throw new BadRequestException('单据已进入兑付回执，不能再改审核结论');
    }

    if (dto.approved) {
      if (ticket.status !== 'PENDING_REVIEW') {
        throw new BadRequestException(`只有待审核单据可以通过，当前状态 ${ticket.status}`);
      }
      if (ticket.netWeight == null || !ticket.qualityGrade) {
        throw new BadRequestException('缺少分拣净重或质量等级，不能审核');
      }
      // 业务红线：重复过磅 / 泥土过多 / 等级不合格，禁止计入补贴
      this.subsidy.assertApprovable(ticket);

      const cap = await this.subsidy.computeEligible({
        periodId: ticket.periodId,
        plotId: ticket.plotId,
        netWeight: ticket.netWeight,
        grade: ticket.qualityGrade,
        excludeTicketId: ticket.id,
      });

      return this.prisma.ticket.update({
        where: { id },
        data: {
          status: 'APPROVED',
          eligibleWeight: cap.eligible,
          capNote: cap.notes.join('；'),
          reviewerId: user.sub,
          rejectReason: null,
          reviewedAt: new Date(),
        },
        include: ReviewService.include,
      });
    }

    // 驳回
    if (!dto.reason?.trim()) {
      throw new BadRequestException('驳回必须填写原因');
    }
    if (ticket.status === 'REJECTED') {
      throw new BadRequestException('单据已是驳回状态');
    }
    return this.prisma.ticket.update({
      where: { id },
      data: {
        status: 'REJECTED',
        eligibleWeight: 0,
        capNote: null,
        reviewerId: user.sub,
        rejectReason: dto.reason,
        reviewedAt: new Date(),
      },
      include: ReviewService.include,
    });
  }
}
