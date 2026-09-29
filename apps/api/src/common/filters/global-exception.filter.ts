import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<any>();
    const request = ctx.getRequest<any>();
    const requestId = String(request?.requestId ?? request?.headers?.['x-request-id'] ?? 'unknown');

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = isHttp ? exception.getResponse() : null;

    let message = 'Internal server error';
    if (status < 500) {
      if (typeof payload === 'string') message = payload;
      else if (payload && typeof payload === 'object') {
        const candidate = (payload as any).message;
        message = Array.isArray(candidate)
          ? candidate.join(', ')
          : String(candidate ?? (exception instanceof Error ? exception.message : 'Request failed'));
      } else if (exception instanceof Error) {
        message = exception.message;
      }
    }

    const log = {
      level: status >= 500 ? 'error' : 'warn',
      requestId,
      method: request?.method,
      path: request?.originalUrl ?? request?.url,
      status,
      error: exception instanceof Error ? exception.name : 'UnknownError'
    };
    if (status >= 500) console.error('[request]', log, exception instanceof Error ? exception.stack : exception);
    else console.warn('[request]', log);

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      requestId,
      timestamp: new Date().toISOString()
    });
  }
}
