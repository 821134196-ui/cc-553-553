import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ScaleModule } from '../scale/scale.module';
import { SubsidyModule } from '../subsidy/subsidy.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [AuthModule, ScaleModule, SubsidyModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
