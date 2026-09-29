import { Module } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController],
  providers: [SupabaseService, AdminAuthGuard, AdminService]
})
export class AdminModule {}
