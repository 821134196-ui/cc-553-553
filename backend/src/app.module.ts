import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ScaleModule } from './scale/scale.module';
import { AuthModule } from './auth/auth.module';
import { TicketsModule } from './tickets/tickets.module';
import { ReviewModule } from './review/review.module';
import { SubsidyModule } from './subsidy/subsidy.module';
import { PayoutsModule } from './payouts/payouts.module';
import { ViewsModule } from './views/views.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ScaleModule,
    AuthModule,
    SubsidyModule,
    TicketsModule,
    ReviewModule,
    PayoutsModule,
    ViewsModule,
  ],
})
export class AppModule {}
