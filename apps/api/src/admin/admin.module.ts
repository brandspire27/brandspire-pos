import { Module } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [AdminController],
  providers: [AdminAuthGuard, AdminService]
})
export class AdminModule {}
