import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard, type FirebaseRequest } from '../common/firebase-auth.guard';
import { AuthService } from './auth.service';

@Controller('auth')
@UseGuards(FirebaseAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('route')
  async route(@Req() request: FirebaseRequest) {
    return { success: true, data: await this.authService.postLoginRoute(request.firebaseUid!) };
  }

  @Post('owner-application')
  async submitOwnerApplication(@Req() request: FirebaseRequest, @Body() body: unknown) {
    return { success: true, data: await this.authService.submitOwnerApplication(request, body) };
  }

  @Get('owner-application')
  async ownerApplication(@Req() request: FirebaseRequest) {
    return { success: true, data: await this.authService.ownerApplication(request.firebaseUid!) };
  }
}
