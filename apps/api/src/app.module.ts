import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { OwnerModule } from './owner/owner.module';
import { PaymentsModule } from './payments/payments.module';
import { FirebaseModule } from './common/firebase.module';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { PosModule } from './pos/pos.module';

@Module({
  imports: [FirebaseModule, DatabaseModule, StorageModule, AuthModule, PosModule, AdminModule, OwnerModule, PaymentsModule, HealthModule]
})
export class AppModule {}
