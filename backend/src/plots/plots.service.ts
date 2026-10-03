import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES } from '../domain';

@Injectable()
export class PlotsService {
  constructor(private prisma: PrismaService) {}

  /** 地块 + 所属种植户（过磅登记下拉用）；种植户只看到自己的地块 */
  async list(user: { id: number; role: string }) {
    return this.prisma.plot.findMany({
      where: user.role === ROLES.FARMER ? { farmerId: user.id } : {},
      orderBy: { code: 'asc' },
      include: { farmer: { select: { id: true, name: true, username: true } } },
    });
  }

  /** 农户与当期信息（收料/审核页面需要） */
  async meta() {
    const [farmers, periods] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: ROLES.FARMER },
        select: { id: true, name: true, username: true, phone: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.subsidyPeriod.findMany({ orderBy: { id: 'desc' } }),
    ]);
    return { farmers, periods };
  }
}
