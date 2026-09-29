import 'dotenv/config';
import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { getRuntimeConfig } from './config/runtime-config';
import { createSecurityMiddleware } from './common/security/security.middleware';

async function bootstrap() {
  // rawBody keeps Cashfree webhook signature verification bound to the exact bytes received.
  const config = getRuntimeConfig();
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const httpInstance = app.getHttpAdapter().getInstance();
  if (typeof httpInstance?.disable === 'function') httpInstance.disable('x-powered-by');

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.webOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });

  app.use((req: any, res: any, next: any) => {
    const incoming = req.headers?.['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.trim() ? incoming.trim().slice(0, 128) : randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });

  app.use(createSecurityMiddleware(config.appEnv));

  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(config.port, '0.0.0.0');
  console.log(`Brandspire POS API ${config.appVersion} (${config.appEnv}) running on port ${config.port}`);
}

bootstrap().catch((error) => {
  console.error('[startup] Brandspire POS API failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
