import { Module } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { OwnerAuthGuard } from './owner-auth.guard';
import { OwnerController } from './owner.controller';
import { OwnerService } from './owner.service';
import { BusinessInsightsService } from '../ai/business-insights.service';

@Module({
  controllers: [OwnerController],
  providers: [SupabaseService, OwnerAuthGuard, OwnerService, BusinessInsightsService]
})
export class OwnerModule {}
