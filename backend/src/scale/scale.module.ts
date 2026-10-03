import { Module } from '@nestjs/common';
import { ScaleService } from './scale.service';

@Module({
  providers: [ScaleService],
  exports: [ScaleService],
})
export class ScaleModule {}
