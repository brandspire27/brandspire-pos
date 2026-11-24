import { Module } from '@nestjs/common';
import { OwnerAuthGuard } from '../owner/owner-auth.guard';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { AdminBillingController, CashfreeWebhookController, OwnerSubscriptionController } from './payments.controller';
import { CashfreeService } from './cashfree.service';
import { CashfreeOrdersService } from './cashfree-orders.service';
import { InstallationPaymentsService } from './installation-payments.service';
import { PaymentRecoveryService } from './payment-recovery.service';

@Module({
  controllers: [OwnerSubscriptionController, AdminBillingController, CashfreeWebhookController],
  providers: [OwnerAuthGuard, AdminAuthGuard, CashfreeService, CashfreeOrdersService, InstallationPaymentsService, PaymentRecoveryService],
  exports: [CashfreeService, InstallationPaymentsService]
})
export class PaymentsModule {}
