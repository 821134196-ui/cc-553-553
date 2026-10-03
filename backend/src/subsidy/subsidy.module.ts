import { Module } from '@nestjs/common';
import { SubsidyService } from './subsidy.service';

@Module({
  providers: [SubsidyService],
  exports: [SubsidyService],
})
export class SubsidyModule {}
