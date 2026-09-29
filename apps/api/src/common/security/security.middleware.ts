type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) buckets.delete(key);
  }
}

function routeKey(path: string) {
  if (path.includes('/payments/cashfree/webhook')) return 'cashfree-webhook';
  if (path.includes('/subscription/checkout')) return 'subscription-checkout';
  if (path.startsWith('/api/admin')) return 'admin';
  if (path.startsWith('/api/owner')) return 'owner';
  return 'general';
}

function routeLimit(path: string, method: string) {
  if (path.includes('/payments/cashfree/webhook')) return { max: 240, windowMs: 60_000 };
  if (path.includes('/subscription/checkout')) return { max: 24, windowMs: 60_000 };
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && (path.startsWith('/api/admin') || path.startsWith('/api/owner'))) {
    return { max: 90, windowMs: 60_000 };
  }
  return { max: 300, windowMs: 60_000 };
}

function clientIdentity(req: any) {
  const authorization = String(req?.headers?.authorization ?? '');
  if (authorization.startsWith('Bearer ') && authorization.length > 24) {
    // Never store/log a full bearer token. A short tail is enough to separate active sessions for rate buckets.
    return `auth:${authorization.slice(-18)}`;
  }
  return `ip:${String(req?.ip ?? req?.socket?.remoteAddress ?? 'unknown').slice(0, 80)}`;
}

export function createSecurityMiddleware(appEnv: string) {
  const productionLike = appEnv === 'production' || appEnv === 'staging';

  return (req: any, res: any, next: any) => {
    const path = String(req?.originalUrl ?? req?.url ?? '/');
    const method = String(req?.method ?? 'GET').toUpperCase();

    // Baseline API hardening. These headers are intentionally framework-independent.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (productionLike) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Authenticated SaaS and payment responses must not be stored in shared browser/proxy caches.
    if (path.startsWith('/api/admin') || path.startsWith('/api/owner') || path.startsWith('/api/payments')) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
    }

    if (method === 'OPTIONS') return next();

    const now = Date.now();
    sweep(now);
    const limit = routeLimit(path, method);
    const key = `${routeKey(path)}:${clientIdentity(req)}`;
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + limit.windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };
    buckets.set(key, bucket);

    const remaining = Math.max(0, limit.max - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(limit.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > limit.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        statusCode: 429,
        message: 'Too many requests. Please wait a moment and try again.',
        requestId: String(req?.requestId ?? 'unknown'),
        retryAfterSeconds: retryAfter
      });
    }

    return next();
  };
}
