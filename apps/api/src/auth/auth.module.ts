import { Module } from '@nestjs/common';
import { FirebaseAuthGuard } from '../common/firebase-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [FirebaseAuthGuard, AuthService]
})
export class AuthModule {}
