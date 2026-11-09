import { Module } from '@nestjs/common';
import { OwnerAuthGuard } from './owner-auth.guard';
import { OwnerController } from './owner.controller';
import { OwnerService } from './owner.service';
import { BusinessInsightsService } from '../ai/business-insights.service';

@Module({
  controllers: [OwnerController],
  providers: [OwnerAuthGuard, OwnerService, BusinessInsightsService]
})
export class OwnerModule {}
