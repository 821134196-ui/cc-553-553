import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CORRECTABLE_FIELDS,
  GRADE_FACTOR,
  RECORD_STATUS,
  REJECT_REASONS,
  ROLES,
} from '../domain';
import { CorrectionDto, CreateWeighDto, ReviewDto, SortingDto } from './dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** 同批膜重复过磅的判定窗口：同地块同膜种、净重相差 2kg 内、30 分钟内 */
const DUP_WEIGHT_TOLERANCE_KG = 2;
const DUP_WINDOW_MS = 30 * 60 * 1000;

@Injectable()
export class RecordsService {
  constructor(private prisma: PrismaService) {}

  private async activePeriod() {
    const period = await this.prisma.subsidyPeriod.findFirst({
      where: { active: true },
      orderBy: { id: 'desc' },
    });
    if (!period) throw new BadRequestException('没有启用的补贴当期');
    return period;
  }

  private genTicketNo() {
    return `NP${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;
  }

  /** 过磅登记（收料员）。clientTicketNo 保证重复提交不会产生第二张单 */
  async createWeigh(dto: CreateWeighDto, user: { id: number; role: string }) {
    if (dto.grossWeightKg < dto.tareWeightKg) {
      throw new BadRequestException('毛重不能小于皮重');
    }

    // 幂等：同一客户端单据号重放 → 返回原单据，不重复计量
    if (dto.clientTicketNo) {
      const existing = await this.prisma.weighRecord.findUnique({
        where: { clientTicketNo: dto.clientTicketNo },
      });
      if (existing) {
        return { record: existing, duplicated: false, idempotentReplay: true };
      }
    }

    const plot = await this.prisma.plot.findUnique({ where: { id: dto.plotId } });
    if (!plot) throw new NotFoundException('地块不存在');
    const farmerId = dto.farmerId ?? plot.farmerId;
    const period = await this.activePeriod();
    const netWeightKg = round2(dto.grossWeightKg - dto.tareWeightKg);

    // 同一批膜重复过磅检测（不阻断过磅，但标记嫌疑，审核时不得直接计入补贴）
    const since = new Date(Date.now() - DUP_WINDOW_MS);
    const near = await this.prisma.weighRecord.findFirst({
      where: {
        plotId: plot.id,
        filmType: dto.filmType,
        status: { not: RECORD_STATUS.REJECTED },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });
    const suspectedDuplicate =
      !!near && Math.abs(near.netWeightKg - netWeightKg) <= DUP_WEIGHT_TOLERANCE_KG;

    const data: Prisma.WeighRecordCreateInput = {
      ticketNo: this.genTicketNo(),
      clientTicketNo: dto.clientTicketNo ?? null,
      period: { connect: { id: period.id } },
      farmer: { connect: { id: farmerId } },
      plot: { connect: { id: plot.id } },
      filmType: dto.filmType,
      grossWeightKg: dto.grossWeightKg,
      tareWeightKg: dto.tareWeightKg,
      netWeightKg,
      collector: { connect: { id: user.id } },
      suspectedDuplicate,
      duplicateOf: suspectedDuplicate && near ? { connect: { id: near.id } } : undefined,
    };

    const record = await this.prisma.weighRecord.create({ data });
    return { record, suspectedDuplicate, duplicateOfTicketNo: suspectedDuplicate ? near?.ticketNo : null };
  }

  /** 分拣后补充净重与质量等级 */
  async addSorting(id: number, dto: SortingDto, user: { id: number }) {
    const record = await this.prisma.weighRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('单据不存在');
    if (record.status !== RECORD_STATUS.PENDING) {
      throw new ConflictException('该单据已分拣，不能重复分拣');
    }
    if (dto.sortedNetWeightKg > record.netWeightKg + 1) {
      throw new BadRequestException('分拣净重不能大于过磅净重（异常请走称重修正流程）');
    }
    return this.prisma.weighRecord.update({
      where: { id },
      data: {
        sortedNetWeightKg: dto.sortedNetWeightKg,
        grade: dto.grade,
        qualityNote: dto.qualityNote ?? null,
        status: RECORD_STATUS.SORTED,
        sortedById: user.id,
        sortedAt: new Date(),
      },
    });
  }

  /** 称重修正：保留原值、原因、复核人；审核角色操作，且不能修正本人登记的单 */
  async correct(id: number, dto: CorrectionDto, user: { id: number }) {
    const record = await this.prisma.weighRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('单据不存在');
    if (record.collectorId === user.id) {
      throw new ForbiddenException('不能复核/修正本人登记的单据');
    }
    if (!['PENDING', 'SORTED'].includes(record.status)) {
      throw new ConflictException('仅待分拣/待审核单据允许修正');
    }
    if (!dto.reason?.trim()) throw new BadRequestException('必须填写修正原因');

    const oldRaw: Record<string, string | null> = {
      [CORRECTABLE_FIELDS.GROSS_WEIGHT]: String(record.grossWeightKg),
      [CORRECTABLE_FIELDS.TARE_WEIGHT]: String(record.tareWeightKg),
      [CORRECTABLE_FIELDS.SORTED_NET_WEIGHT]:
        record.sortedNetWeightKg == null ? null : String(record.sortedNetWeightKg),
      [CORRECTABLE_FIELDS.GRADE]: record.grade,
    };
    const oldValue = oldRaw[dto.field] ?? null;

    const patch: Prisma.WeighRecordUpdateInput = {};
    if (dto.field === CORRECTABLE_FIELDS.GROSS_WEIGHT) {
      const v = Number(dto.newValue);
      if (!(v >= 0)) throw new BadRequestException('新毛重无效');
      patch.grossWeightKg = v;
      patch.netWeightKg = round2(v - record.tareWeightKg);
    } else if (dto.field === CORRECTABLE_FIELDS.TARE_WEIGHT) {
      const v = Number(dto.newValue);
      if (!(v >= 0)) throw new BadRequestException('新皮重无效');
      patch.tareWeightKg = v;
      patch.netWeightKg = round2(record.grossWeightKg - v);
    } else if (dto.field === CORRECTABLE_FIELDS.SORTED_NET_WEIGHT) {
      const v = Number(dto.newValue);
      if (!(v >= 0)) throw new BadRequestException('新净重无效');
      patch.sortedNetWeightKg = v;
    } else if (dto.field === CORRECTABLE_FIELDS.GRADE) {
      if (!GRADE_FACTOR.hasOwnProperty(dto.newValue)) {
        throw new BadRequestException('质量等级无效（A/B/C/REJECT）');
      }
      patch.grade = dto.newValue;
    }
    if ((patch.netWeightKg as number | undefined) != null && (patch.netWeightKg as number) < 0) {
      throw new BadRequestException('修正后净重不能为负');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.weighRecord.update({ where: { id }, data: patch });
      await tx.weightCorrection.create({
        data: {
          recordId: id,
          field: dto.field,
          oldValue,
          newValue: String(dto.newValue),
          reason: dto.reason,
          reviewerId: user.id,
        },
      });
      return updated;
    });
  }

  /**
   * 审核：
   * - 收料员不能审批自己的单据；
   * - 重复过磅嫌疑 / C 级（泥土过多）不得直接通过；
   * - 通过数量受 等级折算 → 地块面积上限 → 当期额度 三重约束。
   * 重复提交审核结果不会重复占用额度（事务内复查状态）。
   */
  async review(id: number, dto: ReviewDto, user: { id: number; role: string }) {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.weighRecord.findUnique({
        where: { id },
        include: { period: true, plot: true },
      });
      if (!record) throw new NotFoundException('单据不存在');
      if (record.collectorId === user.id && user.role !== ROLES.ADMIN) {
        throw new ForbiddenException('收料员不能审批自己登记的单据');
      }

      // 幂等：已经审核过的单，重复提交直接返回原结果，不重复计补
      if (record.status === RECORD_STATUS.APPROVED || record.status === RECORD_STATUS.REJECTED) {
        return { record, idempotentReplay: true };
      }
      if (record.status !== RECORD_STATUS.SORTED) {
        throw new ConflictException('仅待审核单据可以审核');
      }

      if (dto.decision === 'REJECT') {
        const updated = await tx.weighRecord.update({
          where: { id },
          data: {
            status: RECORD_STATUS.REJECTED,
            rejectReason: dto.rejectReason ?? REJECT_REASONS.OTHER,
            reviewedById: user.id,
            reviewedAt: new Date(),
            qualityNote: dto.reviewNote ?? record.qualityNote,
          },
        });
        return { record: updated };
      }

      // —— 通过前硬性校验 ——
      if (record.suspectedDuplicate) {
        throw new ConflictException('该单据疑似同一批膜重复过磅，请先核实并驳回或解除嫌疑');
      }
      if (!record.grade || !(GRADE_FACTOR[record.grade] > 0)) {
        throw new ConflictException('质量等级不合格（泥土夹杂过多），不得计入补贴');
      }
      if (record.sortedNetWeightKg == null) {
        throw new ConflictException('缺少分拣净重');
      }

      // 1) 等级折算
      const qualifiedKg = round2(record.sortedNetWeightKg * GRADE_FACTOR[record.grade]);

      // 2) 地块面积上限（按当期同地块已核定合格量累计）
      const plotAgg = await tx.weighRecord.aggregate({
        where: {
          plotId: record.plotId,
          periodId: record.periodId,
          status: RECORD_STATUS.APPROVED,
        },
        _sum: { approvedSubsidyKg: true },
      });
      const plotUsedKg = plotAgg._sum.approvedSubsidyKg ?? 0;
      const plotCapKg = round2(record.plot.areaMu * record.period.perMuCapKg);
      const plotRemainingKg = round2(Math.max(0, plotCapKg - plotUsedKg));

      // 3) 当期总额度
      const quotaRemainingYuan = round2(
        Math.max(0, record.period.totalQuotaYuan - record.period.usedQuotaYuan),
      );
      const quotaRemainingKg = Math.floor((quotaRemainingYuan / record.period.pricePerKg) * 100) / 100;

      const beforeKg = Math.min(qualifiedKg, plotRemainingKg, quotaRemainingKg);
      // 金额取分，反推公斤，避免金额×数量把额度冲破
      const finalYuan = round2(Math.round(beforeKg * record.period.pricePerKg * 100) / 100);
      const finalKg =
        record.period.pricePerKg > 0
          ? round2(Math.round((finalYuan / record.period.pricePerKg) * 100) / 100)
          : 0;

      const cappedByPlot = qualifiedKg > plotRemainingKg;
      const cappedByPeriod =
        Math.min(qualifiedKg, plotRemainingKg) > quotaRemainingKg + 1e-9;

      const [updated] = await Promise.all([
        tx.weighRecord.update({
          where: { id },
          data: {
            status: RECORD_STATUS.APPROVED,
            reviewedById: user.id,
            reviewedAt: new Date(),
            approvedSubsidyKg: finalKg,
            subsidyYuan: finalYuan,
            cappedByPlot,
            cappedByPeriod,
          },
        }),
        tx.subsidyPeriod.update({
          where: { id: record.periodId },
          data: { usedQuotaYuan: { increment: finalYuan } },
        }),
      ]);

      return {
        record: updated,
        calc: {
          qualifiedKg,
          plotCapKg,
          plotUsedKg,
          plotRemainingKg,
          quotaRemainingYuan,
          quotaRemainingKg,
          finalKg,
          finalYuan,
          cappedByPlot,
          cappedByPeriod,
        },
      };
    });
  }

  /** 审核人员核实后解除重复嫌疑（需备注核实结论） */
  async clearDuplicate(id: number, note: string, user: { id: number }) {
    const record = await this.prisma.weighRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('单据不存在');
    if (!record.suspectedDuplicate) return record;
    if (!note?.trim()) throw new BadRequestException('必须填写核实结论');
    return this.prisma.weighRecord.update({
      where: { id },
      data: {
        suspectedDuplicate: false,
        duplicateOfId: null,
        qualityNote: `[重复嫌疑解除 by#${user.id}] ${note}` + (record.qualityNote ? ` | ${record.qualityNote}` : ''),
      },
    });
  }

  async list(user: { id: number; role: string }, filters: { status?: string; plotId?: number }) {
    const where: Prisma.WeighRecordWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.plotId ? { plotId: filters.plotId } : {}),
      ...(user.role === ROLES.FARMER ? { farmerId: user.id } : {}),
    };
    return this.prisma.weighRecord.findMany({
      where,
      orderBy: { id: 'desc' },
      include: {
        plot: { select: { id: true, code: true, name: true } },
        farmer: { select: { id: true, name: true, username: true } },
        collector: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        payment: true,
        corrections: { include: { reviewer: { select: { id: true, name: true } } } },
      },
    });
  }

  async findOne(id: number, user: { id: number; role: string }) {
    const record = await this.prisma.weighRecord.findUnique({
      where: { id },
      include: {
        plot: true,
        farmer: { select: { id: true, name: true, username: true } },
        collector: { select: { id: true, name: true } },
        sortedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        duplicateOf: { select: { id: true, ticketNo: true } },
        corrections: { include: { reviewer: { select: { id: true, name: true } } } },
        payment: true,
      },
    });
    if (!record) throw new NotFoundException('单据不存在');
    if (user.role === ROLES.FARMER && record.farmerId !== user.id) {
      throw new ForbiddenException('只能查看本人的收据');
    }
    return record;
  }
}
