import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { getRuntimeConfig } from '../config/runtime-config';

@Controller('health')
export class HealthController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  liveness() {
    const config = getRuntimeConfig();
    return {
      success: true,
      service: 'brandspire-pos-api',
      status: 'ok',
      version: config.appVersion,
      environment: config.appEnv,
      timestamp: new Date().toISOString()
    };
  }

  @Get('ready')
  async readiness() {
    const startedAt = Date.now();
    const { error } = await this.supabase.admin.from('plans').select('id').limit(1);

    if (error) throw new ServiceUnavailableException('Database readiness check failed');

    return {
      success: true,
      service: 'brandspire-pos-api',
      status: 'ready',
      database: 'ok',
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    };
  }

  @Get('release')
  releasePolicy() {
    const config = getRuntimeConfig();
    return {
      success: true,
      service: 'brandspire-pos-api',
      version: config.appVersion,
      releaseSha: config.releaseSha ?? null,
      environment: config.appEnv,
      maintenance: config.maintenance,
      android: {
        minVersionCode: config.android.minVersionCode,
        recommendedVersionCode: config.android.recommendedVersionCode,
        latestVersionName: config.android.latestVersionName,
        updateUrl: config.android.updateUrl ?? null
      },
      payments: {
        provider: 'CASHFREE',
        configured: config.cashfreeConfigured,
        environment: config.cashfreeEnv
      },
      timestamp: new Date().toISOString()
    };
  }
}
