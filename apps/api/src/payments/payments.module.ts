import { Module } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { OwnerAuthGuard } from '../owner/owner-auth.guard';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { AdminBillingController, OwnerSubscriptionController, RazorpayWebhookController } from './payments.controller';
import { RazorpayService } from './razorpay.service';

@Module({
  controllers: [OwnerSubscriptionController, AdminBillingController, RazorpayWebhookController],
  providers: [SupabaseService, OwnerAuthGuard, AdminAuthGuard, RazorpayService]
})
export class PaymentsModule {}
