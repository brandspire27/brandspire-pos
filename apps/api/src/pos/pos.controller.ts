import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, InternalServerErrorException, NotFoundException, Param, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PosService } from './pos.service';
import { PosAuthGuard, type PosRequest } from './pos-auth.guard';
import { R2Service } from '../storage/r2.service';
import { TursoService } from '../database/turso.service';
import { randomUUID } from 'node:crypto';
import { PosAssistService } from './pos-assist.service';

@Controller('pos')
@UseGuards(PosAuthGuard)
export class PosController {
  constructor(
    private readonly pos: PosService,
    private readonly storage: R2Service,
    private readonly database: TursoService,
    private readonly assist: PosAssistService
  ) {}

  @Post('assist/draft')
  async assistDraft(@Req() request: PosRequest, @Body() body: unknown) {
    return { success: true, data: await this.assist.draft(request.organizationId!, body) };
  }

  @Get('workspace')
  async workspace(@Req() request: PosRequest) {
    return { success: true, data: await this.pos.workspace(request.ownerUserId!, request.organizationId!) };
  }

  @Post('files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadFile(
    @Req() request: PosRequest,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string } | undefined,
    @Body('purpose') purpose: string
  ) {
    if (!file) throw new BadRequestException('A file is required');
    const allowedPurposes = ['INVOICE_PDF', 'PRODUCT_IMAGE', 'BUSINESS_LOGO', 'REPORT_EXPORT', 'DOCUMENT'];
    if (!allowedPurposes.includes(purpose)) throw new BadRequestException('Invalid file purpose');
    const organizationId = request.organizationId!;
    const uploaded = await this.storage.uploadBusinessFile(organizationId, file.mimetype, file.buffer);
    const id = randomUUID();
    try {
      await this.database.execute(
        `INSERT INTO file_objects(id, organization_id, object_key, purpose, original_name, content_type, size_bytes, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, organizationId, uploaded.key, purpose, file.originalname.slice(0, 255), uploaded.contentType, uploaded.size, request.ownerUserId!]
      );
    } catch (error) {
      try {
        await this.storage.deleteBusinessFile(organizationId, uploaded.key);
      } catch {
        throw new InternalServerErrorException('File metadata could not be saved and the uploaded object could not be removed');
      }
      throw error;
    }
    return { success: true, data: { id, purpose, size: uploaded.size, contentType: uploaded.contentType } };
  }

  @Get('files/:id/download')
  async downloadFile(@Req() request: PosRequest, @Param('id') id: string) {
    const result = await this.database.execute(
      `SELECT object_key FROM file_objects WHERE id = ? AND organization_id = ? LIMIT 1`,
      [id, request.organizationId!]
    );
    const row = result.rows[0] as { object_key?: string } | undefined;
    if (!row?.object_key) throw new NotFoundException('File not found');
    const url = await this.storage.createDownloadUrl(request.organizationId!, row.object_key);
    return { success: true, data: { url, expiresInSeconds: 180 } };
  }

  @Get('products')
  async products(@Req() request: PosRequest, @Query('q') query = '', @Query('active') active = 'false', @Query('limit') limit = '500') {
    return { success: true, data: await this.pos.listProducts(request.organizationId!, { query, activeOnly: active === 'true', limit: Number(limit) }) };
  }

  @Get('products/:id')
  async product(@Req() request: PosRequest, @Param('id') id: string) {
    return { success: true, data: await this.pos.product(request.organizationId!, id) };
  }

  @Post('products')
  async createProduct(@Req() request: PosRequest, @Body() body: unknown) {
    const id = await this.pos.createProduct(request.organizationId!, request.ownerUserId!, body);
    return { success: true, data: { id } };
  }

  @Delete('products/:id')
  async deleteProduct(@Req() request: PosRequest, @Param('id') id: string) {
    this.requireOwner(request);
    await this.pos.deleteProduct(request.organizationId!, id);
    return { success: true };
  }

  @Get('customers')
  async customers(@Req() request: PosRequest, @Query('q') query = '', @Query('active') active = 'false', @Query('limit') limit = '500') {
    return { success: true, data: await this.pos.listCustomers(request.organizationId!, { query, activeOnly: active === 'true', limit: Number(limit) }) };
  }

  @Get('customers/:id')
  async customer(@Req() request: PosRequest, @Param('id') id: string) {
    return { success: true, data: await this.pos.customer(request.organizationId!, id) };
  }

  @Post('customers')
  async createCustomer(@Req() request: PosRequest, @Body() body: unknown) {
    const id = await this.pos.createCustomer(request.organizationId!, request.ownerUserId!, body);
    return { success: true, data: { id } };
  }

  @Delete('customers/:id')
  async deleteCustomer(@Req() request: PosRequest, @Param('id') id: string) {
    this.requireOwner(request);
    await this.pos.deleteCustomer(request.organizationId!, id);
    return { success: true };
  }

  @Get('billing-policy')
  async billingPolicy(@Req() request: PosRequest) {
    return { success: true, data: await this.pos.billingPolicy(request.organizationId!) };
  }

  @Get('settings')
  async settings(@Req() request: PosRequest) {
    return { success: true, data: await this.pos.organizationSettings(request.organizationId!) };
  }

  @Put('settings')
  async updateSettings(@Req() request: PosRequest, @Body() body: unknown) {
    this.requireOwner(request);
    return { success: true, data: await this.pos.updateOrganizationSettings(request.organizationId!, body) };
  }

  @Get('invoices')
  async invoices(@Req() request: PosRequest, @Query('due') due = 'false', @Query('q') query = '', @Query('limit') limit = '200') {
    return { success: true, data: await this.pos.listInvoices(request.organizationId!, { dueOnly: due === 'true', query, limit: Number(limit) }) };
  }

  @Get('returns/invoices')
  async returnInvoices(@Req() request: PosRequest) {
    this.requireOwner(request);
    return { success: true, data: await this.pos.eligibleReturnInvoices(request.organizationId!) };
  }

  @Get('returns/invoices/:id/items')
  async returnItems(@Req() request: PosRequest, @Param('id') id: string) {
    this.requireOwner(request);
    return { success: true, data: await this.pos.returnableInvoiceItems(request.organizationId!, id) };
  }

  @Post('invoices/:id/credit-notes')
  async issueCreditNote(@Req() request: PosRequest, @Param('id') id: string, @Body() body: unknown) {
    this.requireOwner(request);
    return { success: true, data: await this.pos.issueCreditNote(request.organizationId!, request.ownerUserId!, id, body) };
  }

  @Post('invoices')
  async createInvoice(@Req() request: PosRequest, @Body() body: unknown) {
    const result = await this.pos.createInvoice(request.organizationId!, request.ownerUserId!, request.ownerRole!, body);
    return { success: true, data: result };
  }

  @Get('invoices/by-client/:clientId')
  async invoiceByClient(@Req() request:PosRequest,@Param('clientId') clientId:string){
    if(!/^[0-9a-f-]{36}$/i.test(clientId))throw new BadRequestException('Invalid client invoice ID');
    const result=await this.database.execute('SELECT id,invoice_number,grand_total FROM invoices WHERE organization_id = ? AND client_invoice_id = ? LIMIT 1',[request.organizationId!,clientId]);
    return {success:true,data:result.rows[0]??null};
  }

  @Get('invoices/:id')
  async invoiceDetail(@Req() request: PosRequest, @Param('id') id: string) {
    return { success: true, data: await this.pos.invoiceDetail(request.organizationId!, id) };
  }

  @Post('invoices/:id/payments')
  async collectPayment(@Req() request: PosRequest, @Param('id') id: string, @Body() body: unknown) {
    this.requireOwner(request);
    return { success: true, data: await this.pos.issuePayment(request.organizationId!, request.ownerUserId!, id, body) };
  }

  @Post('invoices/:id/cancel')
  async cancelInvoice(@Req() request: PosRequest, @Param('id') id: string, @Body() body: unknown) {
    this.requireOwner(request);
    return { success: true, data: await this.pos.cancelInvoice(request.organizationId!, request.ownerUserId!, id, body) };
  }

  @Post('products/:id/adjust-stock')
  async adjustStock(@Req() request: PosRequest, @Param('id') id: string, @Body() body: unknown) {
    this.requireOwner(request);
    return { success: true, data: await this.pos.adjustStock(request.organizationId!, request.ownerUserId!, id, body) };
  }

  @Get('inventory/movements')
  async movements(@Req() request: PosRequest) {
    this.requireOwner(request);
    return { success: true, data: await this.pos.inventoryMovements(request.organizationId!) };
  }

  @Get('customers/:id/ledger')
  async customerLedger(@Req() request: PosRequest, @Param('id') id: string) {
    this.requireOwner(request);
    return { success: true, data: await this.pos.customerLedger(request.organizationId!, id) };
  }

  @Get('reports/summary')
  async reportSummary(@Req() request: PosRequest, @Query('from') from = '', @Query('to') to = '') {
    this.requireOwner(request);
    const range = this.dateRange(from, to);
    return { success: true, data: await this.pos.reportSummary(request.organizationId!, range.from, range.to) };
  }

  @Get('dashboard')
  async dashboard(@Req() request: PosRequest, @Query('todayStart') todayStart = '') {
    this.requireOwner(request);
    const start = todayStart || new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    if (!Number.isFinite(Date.parse(start))) throw new BadRequestException('A valid start date is required');
    return { success: true, data: await this.pos.dashboardSummary(request.organizationId!, start) };
  }

  @Get('reports/gst-summary')
  async gstSummary(@Req() request: PosRequest, @Query('from') from = '', @Query('to') to = '') {
    this.requireOwner(request);
    const range = this.dateRange(from, to);
    return { success: true, data: await this.pos.gstReport(request.organizationId!, range.from, range.to) };
  }

  private requireOwner(request: PosRequest) {
    if (request.ownerRole !== 'OWNER') throw new ForbiddenException('Owner access is required for this operation');
  }

  private dateRange(from: string, to: string) {
    const start = from || new Date(Date.now() - 30 * 86400000).toISOString();
    const end = to || new Date().toISOString();
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) > Date.parse(end)) {
      throw new BadRequestException('A valid report date range is required');
    }
    return { from: start, to: end };
  }
}
