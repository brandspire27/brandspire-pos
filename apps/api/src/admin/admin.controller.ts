import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminService } from './admin.service';

type AdminRequest = {
  adminUserId?: string;
  adminEmail?: string;
};

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('me')
  me(@Req() request: AdminRequest) {
    return {
      success: true,
      admin: {
        userId: request.adminUserId,
        email: request.adminEmail
      }
    };
  }

  @Get('dashboard')
  async dashboard() {
    return { success: true, data: await this.adminService.dashboard() };
  }

  @Get('applications')
  async applications(@Query('status') status = 'PENDING') {
    return {
      success: true,
      data: await this.adminService.listApplications(status)
    };
  }

  @Post('applications/:id/approve')
  async approve(
    @Param('id') id: string,
    @Req() request: AdminRequest,
    @Body() body: unknown
  ) {
    return {
      success: true,
      data: await this.adminService.approve(id, request.adminUserId!, body)
    };
  }

  @Post('applications/:id/reject')
  async reject(
    @Param('id') id: string,
    @Req() request: AdminRequest,
    @Body() body: { note?: string }
  ) {
    return {
      success: true,
      data: await this.adminService.reject(id, request.adminUserId!, body.note ?? '')
    };
  }

  @Get('organizations')
  async organizations(
    @Query('q') query = '',
    @Query('status') status = 'ALL',
    @Query('attention') attention = 'false'
  ) {
    return {
      success: true,
      data: await this.adminService.listOrganizations({
        query,
        status,
        attentionOnly: attention === 'true'
      })
    };
  }

  @Get('organizations/:id')
  async organization(@Param('id') id: string) {
    return { success: true, data: await this.adminService.organizationDetail(id) };
  }

  @Post('organizations/:id/suspend')
  async suspendOrganization(
    @Param('id') id: string,
    @Req() request: AdminRequest,
    @Body() body: unknown
  ) {
    return {
      success: true,
      data: await this.adminService.suspendOrganization(id, request.adminUserId!, body)
    };
  }

  @Post('organizations/:id/restore')
  async restoreOrganization(
    @Param('id') id: string,
    @Req() request: AdminRequest,
    @Body() body: unknown
  ) {
    return {
      success: true,
      data: await this.adminService.restoreOrganization(id, request.adminUserId!, body)
    };
  }

  @Post('organizations/:id/extend')
  async extendOrganization(
    @Param('id') id: string,
    @Req() request: AdminRequest,
    @Body() body: unknown
  ) {
    return {
      success: true,
      data: await this.adminService.extendOrganization(id, request.adminUserId!, body)
    };
  }

  @Post('organizations/:id/message')
  async updateAdminMessage(
    @Param('id') id: string,
    @Req() request: AdminRequest,
    @Body() body: unknown
  ) {
    return {
      success: true,
      data: await this.adminService.updateAdminMessage(id, request.adminUserId!, body)
    };
  }

  @Get('audit')
  async audit(
    @Query('q') query = '',
    @Query('organizationId') organizationId = '',
    @Query('limit') limit = '100'
  ) {
    return {
      success: true,
      data: await this.adminService.auditTrail({ query, organizationId, limit: Number(limit) })
    };
  }
}
