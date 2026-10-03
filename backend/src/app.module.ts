import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ScaleModule } from './scale/scale.module';
import { RecordsModule } from './records/records.module';
import { PlotsModule } from './plots/plots.module';
import { PaymentsModule } from './payments/payments.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [PrismaModule, AuthModule, ScaleModule, RecordsModule, PlotsModule, PaymentsModule, StatsModule],
})
export class AppModule {}
