import { Module } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { OwnerAuthGuard } from '../owner/owner-auth.guard';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { AdminBillingController, CashfreeWebhookController, OwnerSubscriptionController } from './payments.controller';
import { CashfreeService } from './cashfree.service';

@Module({
  controllers: [OwnerSubscriptionController, AdminBillingController, CashfreeWebhookController],
  providers: [SupabaseService, OwnerAuthGuard, AdminAuthGuard, CashfreeService]
})
export class PaymentsModule {}
