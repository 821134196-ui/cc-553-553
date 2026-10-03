/**
 * 演示种子数据：
 * 农户 zhang/li（密码均为 123456），收料员 collector，审核员 reviewer，管理员 admin。
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const round2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const hash = await bcrypt.hash('123456', 10);

  const upsertUser = async (username: string, name: string, role: string, phone?: string) =>
    prisma.user.upsert({
      where: { username },
      update: {},
      create: { username, passwordHash: hash, name, role, phone },
    });

  const zhang = await upsertUser('zhang', '张老旱', 'FARMER', '13800000001');
  const li = await upsertUser('li', '李春耕', 'FARMER', '13800000002');
  await upsertUser('collector', '王收料', 'COLLECTOR');
  await upsertUser('reviewer', '李审核', 'REVIEWER');
  await upsertUser('admin', '管理员', 'ADMIN');

  const plots = [
    { code: 'P-01', name: '村东一号田', areaMu: 10, crop: '棉花', farmerId: zhang.id },
    { code: 'P-02', name: '村西二号田', areaMu: 5, crop: '玉米', farmerId: zhang.id },
    { code: 'P-03', name: '南坡三号田', areaMu: 8, crop: '花生', farmerId: li.id },
  ];
  for (const p of plots) {
    await prisma.plot.upsert({ where: { code: p.code }, update: {}, create: p });
  }

  // 2026 年秋覆膜回收当期：总额度 2000 元，每亩合格膜上限 20kg，补贴 2 元/kg
  await prisma.subsidyPeriod.upsert({
    where: { code: '2026-AUTUMN' },
    update: {},
    create: {
      code: '2026-AUTUMN',
      name: '2026 年秋季废旧农膜回收当期',
      startAt: '2026-09-01',
      endAt: '2026-11-30',
      totalQuotaYuan: 2000,
      usedQuotaYuan: 0,
      perMuCapKg: 20,
      pricePerKg: 2,
      active: true,
    },
  });

  console.log('✅ 种子数据完成');
  console.log('   农户: zhang / li    收料员: collector    审核员: reviewer    管理员: admin');
  console.log('   密码统一为: 123456');
  void round2;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
