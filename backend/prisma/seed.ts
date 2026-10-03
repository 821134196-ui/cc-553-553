/**
 * 种子数据：覆盖三类必交付示例
 *  A. 重量修正：复磅净重 120→118kg，原值/原因/复核人留痕
 *  B. 重复交膜：同一批次 BATCH-Z-01 第二次过磅被标记并驳回
 *  C. 额度刚好达到上限：全部审核通过量恰好 = 当期总额度 500kg，
 *     之后再通过的单据被裁剪为 0；同时演示地块面积上限（200kg/2亩）恰好顶满
 *  另含：泥土夹杂过多驳回、B 级折算、重复兑付幂等（见 README 接口验证）
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertUser(username: string, name: string, role: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { username },
    update: { passwordHash, name, role },
    create: { username, name, role, passwordHash },
  });
}

async function main() {
  // 清空旧数据（外键顺序）
  await prisma.payoutLine.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.weightCorrection.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.plot.deleteMany();
  await prisma.subsidyPeriod.deleteMany();
  // 不清用户表以外，保证可重复执行
  await prisma.user.deleteMany();
  // 重置自增序列，保证每次播种 ID 稳定（期次=1，地块=1/2/3，种植户=4/5）
  await prisma.$executeRawUnsafe('DELETE FROM sqlite_sequence');

  const admin = await upsertUser('admin', '赵管理', 'ADMIN', 'admin123');
  const collector = await upsertUser('collector', '王收料', 'COLLECTOR', 'collect123');
  const reviewer = await upsertUser('reviewer', '李审核', 'REVIEWER', 'review123');
  const zhang = await upsertUser('zhang', '张种植', 'FARMER', 'zhang123');
  const wang = await upsertUser('wang', '王种植', 'FARMER', 'wang123');

  const period = await prisma.subsidyPeriod.create({
    data: {
      code: '2026-Q3',
      name: '2026年第三季度农膜回收补贴',
      ratePerKg: 2.0,
      kgPerMu: 100,
      totalQuotaKg: 500,
      active: true,
      startDate: '2026-07-01',
      endDate: '2026-09-30',
    },
  });

  const p01 = await prisma.plot.create({ data: { code: 'P-01', name: '村东一号地', areaMu: 5, farmerId: zhang.id } });
  const p02 = await prisma.plot.create({ data: { code: 'P-02', name: '村南大棚区', areaMu: 3, farmerId: zhang.id } });
  const p03 = await prisma.plot.create({ data: { code: 'P-03', name: '西坡二号地', areaMu: 2, farmerId: wang.id } });

  const now = new Date();
  let seq = 0;
  const no = () => `2026-Q3-${String(++seq).padStart(4, '0')}`;
  const mk = (d: Parameters<typeof prisma.ticket.create>[0]['data']) =>
    prisma.ticket.create({ data: { ticketNo: no(), periodId: period.id, collectorId: collector.id, ...d } });

  // ── 场景 A：重量修正留痕 ────────────────────────────────
  // 初称净重 120kg，分拣 A 级；复核复磅发现夹带石块 2kg，净重修正为 118kg 后通过
  const tA = await mk({
    farmerId: zhang.id,
    plotId: p01.id,
    filmType: 'MULCH',
    grossWeight: 160.0,
    tareWeight: 40.0,
    netWeight: 120.0,
    qualityGrade: 'A',
    dirtRate: 0.02,
    status: 'PENDING_REVIEW',
  });
  await prisma.weightCorrection.create({
    data: {
      ticketId: tA.id,
      fieldName: 'NET',
      oldValue: 120.0,
      newValue: 118.0,
      reason: '复磅发现膜卷夹带石块，净重扣减 2kg',
      reviewerId: reviewer.id,
    },
  });
  // 修正生效：当前净重更新为 118kg，原始 120kg 永久保留在上面的修正记录中
  await prisma.ticket.update({ where: { id: tA.id }, data: { netWeight: 118.0 } });

  // ── 场景 B：同批膜重复过磅 ─────────────────────────────
  // BATCH-Z-01 第一次过磅 80kg，正常审核通过
  const tB1 = await mk({
    farmerId: zhang.id,
    plotId: p01.id,
    filmType: 'SHED',
    batchCode: 'BATCH-Z-01',
    grossWeight: 120.0,
    tareWeight: 40.0,
    netWeight: 80.0,
    qualityGrade: 'A',
    dirtRate: 0.01,
    status: 'PENDING_REVIEW',
  });
  // 同一批膜第二次拉来过磅，系统自动标记 duplicateOf
  const tB2 = await mk({
    farmerId: zhang.id,
    plotId: p01.id,
    filmType: 'SHED',
    batchCode: 'BATCH-Z-01',
    grossWeight: 120.0,
    tareWeight: 40.0,
    netWeight: 80.0,
    qualityGrade: 'A',
    dirtRate: 0.01,
    status: 'PENDING_REVIEW',
    duplicateOfId: tB1.id,
  });

  // ── 场景 C：地块上限 + 当期额度恰好顶满 ──────────────────
  // P-03 共 2 亩 × 100kg/亩 = 200kg，本单恰好顶满地快上限
  const tC1 = await mk({
    farmerId: wang.id,
    plotId: p03.id,
    filmType: 'MULCH',
    grossWeight: 240.0,
    tareWeight: 40.0,
    netWeight: 200.0,
    qualityGrade: 'A',
    dirtRate: 0.03,
    status: 'PENDING_REVIEW',
  });
  // 当期已用 118+80+200=398kg，本单 102kg 通过后总额度恰好达到 500kg 上限
  const tC2 = await mk({
    farmerId: zhang.id,
    plotId: p02.id,
    filmType: 'MULCH',
    grossWeight: 142.0,
    tareWeight: 40.0,
    netWeight: 102.0,
    qualityGrade: 'A',
    dirtRate: 0.02,
    status: 'PENDING_REVIEW',
  });
  // 额度已满 + P-03 地块上限已满：本单虽审核通过，合格量被裁剪为 0
  const tC3 = await mk({
    farmerId: wang.id,
    plotId: p03.id,
    filmType: 'MULCH',
    grossWeight: 70.0,
    tareWeight: 40.0,
    netWeight: 30.0,
    qualityGrade: 'A',
    dirtRate: 0.04,
    status: 'PENDING_REVIEW',
  });

  // ── 泥土夹杂过多：驳回 ────────────────────────────────
  const tDirt = await mk({
    farmerId: zhang.id,
    plotId: p02.id,
    filmType: 'MULCH',
    grossWeight: 110.0,
    tareWeight: 40.0,
    netWeight: 60.0,
    qualityGrade: 'REJECT',
    dirtRate: 0.15,
    status: 'PENDING_REVIEW',
  });

  // ── 队列里留两条在途单据，方便演示各角色待办 ───────────────
  await mk({
    farmerId: zhang.id,
    plotId: p02.id,
    filmType: 'SHED',
    grossWeight: 96.0,
    tareWeight: 40.0,
    // 尚未分拣
    status: 'PENDING_SORTING',
  });
  await mk({
    farmerId: zhang.id,
    plotId: p01.id,
    filmType: 'MULCH',
    grossWeight: 80.0,
    tareWeight: 40.0,
    netWeight: 40.0,
    qualityGrade: 'B', // B 级按 85% 折算
    dirtRate: 0.03,
    status: 'PENDING_REVIEW',
  });

  // ── 执行审核结论（直接落库，模拟审核人员在系统中的操作）──────
  const approve = async (id: number, eligibleWeight: number, capNote: string) =>
    prisma.ticket.update({
      where: { id },
      data: {
        status: 'APPROVED',
        eligibleWeight,
        capNote,
        reviewerId: reviewer.id,
        reviewedAt: now,
      },
    });

  await approve(
    tA.id,
    118.0,
    '分拣净重 118kg × 等级A系数 1 = 118kg（净重经复核修正：120→118kg）',
  );
  await approve(tB1.id, 80.0, '分拣净重 80kg × 等级A系数 1 = 80kg');
  await approve(
    tC1.id,
    200.0,
    '分拣净重 200kg × 等级A系数 1 = 200kg；地块 P-03 面积上限恰好顶满（2亩 × 100kg/亩 = 200kg）',
  );
  await approve(
    tC2.id,
    102.0,
    '分拣净重 102kg × 等级A系数 1 = 102kg；通过后当期总额度恰好达到上限 500kg',
  );
  await approve(
    tC3.id,
    0.0,
    '地块 P-03 面积额度已用尽（剩余 0kg）；当期总额度已用尽（剩余 0kg），合格量裁剪为 0',
  );

  await prisma.ticket.update({
    where: { id: tB2.id },
    data: {
      status: 'REJECTED',
      eligibleWeight: 0,
      reviewerId: reviewer.id,
      rejectReason: `同批膜（批次 BATCH-Z-01，与 ${tB1.ticketNo} 同批）重复过磅，按规定不得重复计入补贴`,
      reviewedAt: now,
    },
  });
  await prisma.ticket.update({
    where: { id: tDirt.id },
    data: {
      status: 'REJECTED',
      eligibleWeight: 0,
      reviewerId: reviewer.id,
      rejectReason: '泥土夹杂比例 15.0% 超过 10% 上限，且质量等级为 REJECT，不计入补贴',
      reviewedAt: now,
    },
  });

  // ── 兑付回执（本地模拟）────────────────────────────────
  const buildPayout = async (farmerId: number, idx: number) => {
    const tickets = await prisma.ticket.findMany({
      where: { periodId: period.id, farmerId, status: 'APPROVED', eligibleWeight: { gt: 0 } },
      orderBy: { id: 'asc' },
    });
    const totalWeight = Math.round(tickets.reduce((s, t) => s + t.eligibleWeight, 0) * 100) / 100;
    const amount = Math.round(totalWeight * period.ratePerKg * 100) / 100;
    const payout = await prisma.payout.create({
      data: {
        receiptNo: `PAY-2026-Q3-${String(idx).padStart(4, '0')}`,
        periodId: period.id,
        farmerId,
        totalWeight,
        amount,
        idempotencyKey: `seed:2026-Q3:${farmerId}`,
        createdById: admin.id,
        lines: {
          create: tickets.map((t) => ({
            ticketId: t.id,
            plotId: t.plotId,
            weight: t.eligibleWeight,
            amount: Math.round(t.eligibleWeight * period.ratePerKg * 100) / 100,
          })),
        },
      },
    });
    for (const t of tickets) {
      await prisma.ticket.update({ where: { id: t.id }, data: { paidWeight: t.eligibleWeight } });
    }
    return payout;
  };

  const payZhang = await buildPayout(zhang.id, 1);
  const payWang = await buildPayout(wang.id, 2);

  console.log('🌱 种子数据写入完成');
  console.log('── 场景 A 重量修正：', `${tA.ticketNo} 净重 120→118kg，复核人=李审核`);
  console.log('── 场景 B 重复交膜：', `${tB2.ticketNo} 已驳回，原单 ${tB1.ticketNo}`);
  console.log('── 场景 C 额度顶满：', '当期合格量 500/500kg；', `${tC3.ticketNo} 被裁剪为 0kg`);
  console.log('── 兑付回执：', payZhang.receiptNo, `${payZhang.amount}元 /`, payWang.receiptNo, `${payWang.amount}元`);
  console.log('');
  console.log('登录账号（密码见括号）：');
  console.log('  admin/admin123（管理员）  collector/collect123（收料员）');
  console.log('  reviewer/review123（审核） zhang/zhang123（张种植）  wang/wang123（王种植）');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
