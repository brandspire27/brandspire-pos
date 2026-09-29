import { Module } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [SupabaseService]
})
export class HealthModule {}
