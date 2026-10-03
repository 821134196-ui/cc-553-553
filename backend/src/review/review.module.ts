import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SubsidyModule } from '../subsidy/subsidy.module';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [AuthModule, SubsidyModule],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
