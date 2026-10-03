import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, JwtUser } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ReviewService } from './review.service';
import { ReviewDto } from './review.dto';

@Controller('review')
@Roles('REVIEWER', 'ADMIN')
@UseGuards(AuthGuard, RolesGuard)
export class ReviewController {
  constructor(private review: ReviewService) {}

  @Get('pending')
  pending() {
    return this.review.pendingQueue();
  }

  @Post(':id')
  decide(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewDto,
  ) {
    return this.review.review(user, id, dto);
  }
}
