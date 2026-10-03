import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ViewsController } from './views.controller';
import { ViewsService } from './views.service';

@Module({
  imports: [AuthModule],
  controllers: [ViewsController],
  providers: [ViewsService],
})
export class ViewsModule {}
