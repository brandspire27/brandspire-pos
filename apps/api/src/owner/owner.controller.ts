import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { OwnerAuthGuard } from './owner-auth.guard';
import { OwnerService } from './owner.service';
import { BusinessInsightsService } from '../ai/business-insights.service';

type OwnerRequest = { ownerUserId?: string; organizationId?: string; ownerEmail?: string };

@Controller('owner')
@UseGuards(OwnerAuthGuard)
export class OwnerController {
  constructor(private readonly ownerService: OwnerService, private readonly businessInsights: BusinessInsightsService) {}

  @Get('me')
  me(@Req() request: OwnerRequest) {
    return { success: true, owner: { userId: request.ownerUserId, organizationId: request.organizationId, email: request.ownerEmail } };
  }

  @Get('staff')
  async staff(@Req() request: OwnerRequest) {
    return { success: true, data: await this.ownerService.listStaff(request.organizationId!) };
  }

  @Post('staff')
  async createStaff(@Req() request: OwnerRequest, @Body() body: unknown) {
    return { success: true, data: await this.ownerService.createStaff(request.organizationId!, request.ownerUserId!, body) };
  }

  @Patch('staff/:id/status')
  async setStatus(@Param('id') id: string, @Req() request: OwnerRequest, @Body() body: unknown) {
    return { success: true, data: await this.ownerService.setStaffStatus(request.organizationId!, request.ownerUserId!, id, body) };
  }


  @Post('assist/insights')
  async businessInsightsAsk(@Req() request: OwnerRequest, @Body() body: unknown) {
    return { success: true, data: await this.businessInsights.ask(request.organizationId!, request.ownerUserId!, body) };
  }

  @Post('staff/:id/reset-password')
  async resetPassword(@Param('id') id: string, @Req() request: OwnerRequest, @Body() body: unknown) {
    return { success: true, data: await this.ownerService.resetStaffPassword(request.organizationId!, request.ownerUserId!, id, body) };
  }
}
