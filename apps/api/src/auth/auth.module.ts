import { Module } from '@nestjs/common';
import { FirebaseAuthGuard } from '../common/firebase-auth.guard';
import { PaymentsModule } from '../payments/payments.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [PaymentsModule],
  controllers: [AuthController],
  providers: [FirebaseAuthGuard, AuthService]
})
export class AuthModule {}
