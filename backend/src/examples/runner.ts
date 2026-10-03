/**
 * 端到端示例场景（使用独立 examples.db，不污染开发库）：
 *  A. 重量修正：保留原值/新值/原因/复核人；本人登记不得自行修正
 *  B. 泥土夹杂过多（C 级）不得计入补贴
 *  C. 同一批膜重复过磅：标记嫌疑、禁止直接通过、驳回不计补
 *  D. 地块面积上限：恰好达到 100kg 上限，下一笔被截断为 0
 *  E. 当期额度上限：额度恰好耗尽，再交膜补贴为 0
 *  F. 收料员不能审批自己的单据
 *  G. 幂等：重复提交过磅/审核/兑付都不增加补贴金额
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { RecordsService } from '../records/records.service';
import { PaymentsService } from '../payments/payments.service';

const prisma = new PrismaClient();
const records = new RecordsService(prisma as any);
const payments = new PaymentsService(prisma as any);

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.error(`  ❌ ${name}`, extra ?? '');
  }
}

async function expectThrow(name: string, fn: () => Promise<unknown>, messageIncludes?: string) {
  try {
    await fn();
    check(name, false, '未抛出预期异常');
  } catch (e: any) {
    const ok = !messageIncludes || String(e.message).includes(messageIncludes);
    check(`${name}（${messageIncludes ?? '抛异常'}）`, ok, e.message);
  }
}

async function setup() {
  const hash = await bcrypt.hash('123456', 10);
  const farmer = await prisma.user.create({ data: { username: 'ex-zhang', passwordHash: hash, name: '张示例', role: 'FARMER' } });
  const farmer2 = await prisma.user.create({ data: { username: 'ex-li', passwordHash: hash, name: '李示例', role: 'FARMER' } });
  const collector = await prisma.user.create({ data: { username: 'ex-collector', passwordHash: hash, name: '王收料', role: 'COLLECTOR' } });
  const reviewer = await prisma.user.create({ data: { username: 'ex-reviewer', passwordHash: hash, name: '李审核', role: 'REVIEWER' } });
  const admin = await prisma.user.create({ data: { username: 'ex-admin', passwordHash: hash, name: '管理员', role: 'ADMIN' } });

  const p01 = await prisma.plot.create({ data: { code: 'E-01', name: '示例田1(10亩)', areaMu: 10, farmerId: farmer.id } });
  const p02 = await prisma.plot.create({ data: { code: 'E-02', name: '示例田2(5亩)', areaMu: 5, farmerId: farmer.id } });
  const p03 = await prisma.plot.create({ data: { code: 'E-03', name: '示例田3(8亩)', areaMu: 8, farmerId: farmer2.id } });

  const autumn = await prisma.subsidyPeriod.create({
    data: {
      code: 'EX-AUTUMN', name: '示例秋季当期', startAt: '2026-09-01', endAt: '2026-11-30',
      totalQuotaYuan: 2000, usedQuotaYuan: 0, perMuCapKg: 20, pricePerKg: 2, active: true,
    },
  });
  return { farmer, farmer2, collector, reviewer, admin, p01, p02, p03, autumn };
}

async function scenarioA(ctx: Awaited<ReturnType<typeof setup>>) {
  console.log('\n场景 A：重量修正留痕 + 禁止自行修正');
  const { p01, collector, reviewer } = ctx;
  const { record } = await records.createWeigh(
    { plotId: p01.id, filmType: 'PE', grossWeightKg: 120, tareWeightKg: 5 },
    { id: collector.id, role: 'COLLECTOR' },
  );
  check('过磅净重 = 毛重120 - 皮5 = 115', Math.abs(record.netWeightKg - 115) < 1e-9);

  // 收料员修正自己的单 → 拒绝
  await expectThrow(
    '收料员不能修正本人登记的单据',
    () => records.correct(record.id, { field: 'GROSS_WEIGHT', newValue: '110', reason: '地磅偏差' }, { id: collector.id }),
    '本人登记',
  );

  // 审核人员修正：毛重 120 → 110，原因与复核人全部留痕
  await records.correct(
    record.id,
    { field: 'GROSS_WEIGHT', newValue: '110', reason: '复核地磅读数偏差，第三方地磅复称 110kg' },
    { id: reviewer.id },
  );
  const corrected = await prisma.weighRecord.findUniqueOrThrow({ where: { id: record.id } });
  check('修正后净重同步重算为 105', Math.abs(corrected.netWeightKg - 105) < 1e-9);
  const log = await prisma.weightCorrection.findFirstOrThrow({ where: { recordId: record.id } });
  check('修正留痕保留原值 120', log.oldValue === '120', log);
  check('修正留痕记录新值 110', log.newValue === '110', log);
  check('修正留痕包含原因', log.reason.includes('第三方地磅复称'), log);
  check('修正留痕记录复核人', log.reviewerId === reviewer.id, log);
  return record.id;
}

async function scenarioB(ctx: Awaited<ReturnType<typeof setup>>) {
  console.log('\n场景 B：泥土夹杂过多（C 级）不得计入补贴');
  const { p01, collector, reviewer } = ctx;
  const { record } = await records.createWeigh(
    { plotId: p01.id, filmType: 'PE', grossWeightKg: 80, tareWeightKg: 5 },
    { id: collector.id, role: 'COLLECTOR' },
  );
  await records.addSorting(record.id, { sortedNetWeightKg: 75, grade: 'C', qualityNote: '泥土夹杂约40%' }, { id: collector.id });
  await expectThrow(
    'C 级单据直接通过审核被拒',
    () => records.review(record.id, { decision: 'APPROVE' }, { id: reviewer.id, role: 'REVIEWER' }),
    '泥土',
  );
  const rejected = await records.review(
    record.id,
    { decision: 'REJECT', rejectReason: 'SOIL_CONTAMINATION' },
    { id: reviewer.id, role: 'REVIEWER' },
  );
  check('泥膜单据被驳回且不计补贴', rejected.record.status === 'REJECTED' && rejected.record.subsidyYuan === 0);
}

async function scenarioC(ctx: Awaited<ReturnType<typeof setup>>) {
  console.log('\n场景 C：同一批膜重复过磅');
  const { p03, collector, reviewer } = ctx;
  const first = await records.createWeigh(
    { plotId: p03.id, filmType: 'PE', grossWeightKg: 65, tareWeightKg: 5 },
    { id: collector.id, role: 'COLLECTOR' },
  );
  // 同一车膜 5 分钟内换张票再磅一次，重量几乎相同
  const dup = await records.createWeigh(
    { plotId: p03.id, filmType: 'PE', grossWeightKg: 65.4, tareWeightKg: 5 },
    { id: collector.id, role: 'COLLECTOR' },
  );
  check('第二次过磅被标记为重复嫌疑', dup.suspectedDuplicate === true);
  check('关联到首张票据', dup.record.duplicateOfId === first.record.id);

  await records.addSorting(first.record.id, { sortedNetWeightKg: 60, grade: 'A' }, { id: collector.id });
  await records.addSorting(dup.record.id, { sortedNetWeightKg: 60, grade: 'A' }, { id: collector.id });
  await expectThrow(
    '重复嫌疑单据不得直接计入补贴',
    () => records.review(dup.record.id, { decision: 'APPROVE' }, { id: reviewer.id, role: 'REVIEWER' }),
    '重复过磅',
  );
  const rejected = await records.review(
    dup.record.id,
    { decision: 'REJECT', rejectReason: 'DUPLICATE_FILM' },
    { id: reviewer.id, role: 'REVIEWER' },
  );
  check('重复单据驳回，补贴为 0', rejected.record.status === 'REJECTED' && rejected.record.subsidyYuan === 0);

  const ok = await records.review(first.record.id, { decision: 'APPROVE' }, { id: reviewer.id, role: 'REVIEWER' });
  check('首张真实单据正常通过，核定 60kg / 120 元', ok.record.approvedSubsidyKg === 60 && ok.record.subsidyYuan === 120, ok.calc);
}

async function scenarioD(ctx: Awaited<ReturnType<typeof setup>>) {
  console.log('\n场景 D：地块面积上限（5亩 × 20kg = 100kg，恰好达到上限）');
  const { p02, collector, reviewer } = ctx;
  const r1 = await records.createWeigh(
    { plotId: p02.id, filmType: 'PE', grossWeightKg: 105, tareWeightKg: 5 },
    { id: collector.id, role: 'COLLECTOR' },
  );
  await records.addSorting(r1.record.id, { sortedNetWeightKg: 100, grade: 'A' }, { id: collector.id });
  const a1 = await records.review(r1.record.id, { decision: 'APPROVE' }, { id: reviewer.id, role: 'REVIEWER' });
  check('首笔 100kg 恰好达到地块上限，足额补贴 200 元', a1.record.approvedSubsidyKg === 100 && a1.record.subsidyYuan === 200, a1.calc);
  check('未触发截断标记', a1.record.cappedByPlot === false && a1.record.cappedByPeriod === false);

  const r2 = await records.createWeigh(
    { plotId: p02.id, filmType: 'PE', grossWeightKg: 55, tareWeightKg: 5 },
    { id: collector.id, role: 'COLLECTOR' },
  );
  await records.addSorting(r2.record.id, { sortedNetWeightKg: 50, grade: 'A' }, { id: collector.id });
  const a2 = await records.review(r2.record.id, { decision: 'APPROVE' }, { id: reviewer.id, role: 'REVIEWER' });
  check('超过地块面积上限的部分被截断：核定 0kg / 0 元', a2.record.approvedSubsidyKg === 0 && a2.record.subsidyYuan === 0, a2.calc);
  check('标记为地块面积截断', a2.record.cappedByPlot === true);
}

async function scenarioE(ctx: Awaited<ReturnType<typeof setup>>) {
  console.log('\n场景 E：当期总额度恰好耗尽（100 元 = 50kg × 2 元）');
  // 独立小额度当期，面积上限给足，只验证总额度
  const plot = await prisma.plot.create({ data: { code: 'E-04', name: '额度测试田(100亩)', areaMu: 100, farmerId: ctx.farmer.id } });
  await prisma.subsidyPeriod.update({ where: { code: 'EX-AUTUMN' }, data: { active: false } });
  const period = await prisma.subsidyPeriod.create({
    data: {
      code: 'EX-QUOTA', name: '额度测试当期', startAt: '2026-09-01', endAt: '2026-11-30',
      totalQuotaYuan: 100, usedQuotaYuan: 0, perMuCapKg: 1000, pricePerKg: 2, active: true,
    },
  });

  const ticket = async (net: number) => {
    const r = await records.createWeigh(
      { plotId: plot.id, filmType: 'PO', grossWeightKg: net + 5, tareWeightKg: 5 },
      { id: ctx.collector.id, role: 'COLLECTOR' },
    );
    await records.addSorting(r.record.id, { sortedNetWeightKg: net, grade: 'A' }, { id: ctx.collector.id });
    return records.review(r.record.id, { decision: 'APPROVE' }, { id: ctx.reviewer.id, role: 'REVIEWER' });
  };

  const e1 = await ticket(40);
  check('第一笔 40kg → 80 元', e1.record.subsidyYuan === 80, e1.calc);
  const e2 = await ticket(10);
  check('第二笔 10kg → 20 元，额度恰好达到上限 100 元', e2.record.subsidyYuan === 20, e2.calc);
  const periodAfter = await prisma.subsidyPeriod.findUniqueOrThrow({ where: { id: period.id } });
  check('当期已用额度 = 100 元，剩余 0', periodAfter.usedQuotaYuan === 100);
  const e3 = await ticket(5);
  check('额度用尽后再交膜：核定 0kg / 0 元', e3.record.approvedSubsidyKg === 0 && e3.record.subsidyYuan === 0, e3.calc);
  check('标记为当期额度截断', e3.record.cappedByPeriod === true);
}

async function scenarioF(ctx: Awaited<ReturnType<typeof setup>>) {
  console.log('\n场景 F：收料员不能审批自己的单据');
  // 重新启用秋季当期以便继续登记
  await prisma.subsidyPeriod.update({ where: { code: 'EX-AUTUMN' }, data: { active: true } });
  await prisma.subsidyPeriod.update({ where: { code: 'EX-QUOTA' }, data: { active: false } });
  const { p01, collector } = ctx;
  const { record } = await records.createWeigh(
    { plotId: p01.id, filmType: 'EVA', grossWeightKg: 30, tareWeightKg: 2 },
    { id: collector.id, role: 'COLLECTOR' },
  );
  await records.addSorting(record.id, { sortedNetWeightKg: 28, grade: 'A' }, { id: collector.id });
  await expectThrow(
    '收料员审批本人单据被拒',
    () => records.review(record.id, { decision: 'APPROVE' }, { id: collector.id, role: 'COLLECTOR' }),
    '自己登记',
  );
  const ok = await records.review(record.id, { decision: 'APPROVE' }, { id: ctx.reviewer.id, role: 'REVIEWER' });
  check('换审核人员后正常通过', ok.record.status === 'APPROVED');
  return record.id;
}

async function scenarioG(ctx: Awaited<ReturnType<typeof setup>>, approvedId: number) {
  console.log('\n场景 G：重复提交与重复兑付不增加补贴金额');
  const { p01, collector, reviewer, admin } = ctx;

  // 过磅登记幂等：同一 clientTicketNo 重放
  const r1 = await records.createWeigh(
    { plotId: p01.id, filmType: 'PE', grossWeightKg: 55, tareWeightKg: 5, clientTicketNo: 'CLIENT-UUID-001' },
    { id: collector.id, role: 'COLLECTOR' },
  );
  const r2 = await records.createWeigh(
    { plotId: p01.id, filmType: 'PE', grossWeightKg: 55, tareWeightKg: 5, clientTicketNo: 'CLIENT-UUID-001' },
    { id: collector.id, role: 'COLLECTOR' },
  );
  check('重复提交返回同一张单据（票据号一致）', r1.record.id === r2.record.id && r2.idempotentReplay === true);
  const count = await prisma.weighRecord.count({ where: { clientTicketNo: 'CLIENT-UUID-001' } });
  check('数据库只有一张过磅单', count === 1);

  await records.addSorting(r1.record.id, { sortedNetWeightKg: 50, grade: 'A' }, { id: collector.id });
  const before = await prisma.subsidyPeriod.findUniqueOrThrow({ where: { id: r1.record.periodId } });
  const a1 = await records.review(r1.record.id, { decision: 'APPROVE' }, { id: reviewer.id, role: 'REVIEWER' });
  const a2 = await records.review(r1.record.id, { decision: 'APPROVE' }, { id: reviewer.id, role: 'REVIEWER' });
  const after = await prisma.subsidyPeriod.findUniqueOrThrow({ where: { id: r1.record.periodId } });
  check('重复审核返回原结果（幂等重放）', a2.idempotentReplay === true);
  check('重复审核不重复占用额度', after.usedQuotaYuan - before.usedQuotaYuan === 100);

  // 兑付幂等：同一单据兑付两次，回执号相同、金额不增加
  const pay1 = await payments.pay(approvedId, { id: admin.id }, 'PAY-KEY-1');
  const pay2 = await payments.pay(approvedId, { id: admin.id }, 'PAY-KEY-1');
  check('重复兑付返回同一回执号', pay1.payment!.receiptNo === pay2.payment!.receiptNo && pay2.idempotentReplay === true);
  const payCount = await prisma.payment.count({ where: { recordId: approvedId } });
  check('兑付记录只有一条', payCount === 1);
  const paySum = await prisma.payment.aggregate({ where: { recordId: approvedId }, _sum: { amountYuan: true } });
  check('兑付总额 = 单次核定金额 56 元', paySum._sum.amountYuan === 56, paySum);
}

async function main() {
  console.log('🌾 农膜回收补贴系统 —— 示例场景（examples.db）');
  const ctx = await setup();
  await scenarioA(ctx);
  await scenarioB(ctx);
  await scenarioC(ctx);
  await scenarioD(ctx);
  await scenarioE(ctx);
  const approvedId = await scenarioF(ctx);
  await scenarioG(ctx, approvedId);

  console.log(`\n────────────────────────`);
  console.log(`通过 ${pass} 项，失败 ${fail} 项`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
