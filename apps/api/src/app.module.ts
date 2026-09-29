import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { OwnerModule } from './owner/owner.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [AdminModule, OwnerModule, PaymentsModule, HealthModule]
})
export class AppModule {}
