export type MaintenanceMode = 'off' | 'warning' | 'blocking';

function requireEnv(name: string): string {
  const value = (process.env[name] ?? '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalUrl(name: string): string | undefined {
  const value = (process.env[name] ?? '').trim();
  if (!value) return undefined;
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

function positiveInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

export interface RuntimeConfig {
  appEnv: 'development' | 'staging' | 'production';
  appVersion: string;
  releaseSha?: string;
  port: number;
  webOrigins: string[];
  publicApiUrl?: string;
  cashfreeConfigured: boolean;
  cashfreeEnv: 'sandbox' | 'production';
  android: {
    minVersionCode: number;
    recommendedVersionCode: number;
    latestVersionName: string;
    updateUrl?: string;
  };
  maintenance: {
    mode: MaintenanceMode;
    message: string;
  };
}

let cached: RuntimeConfig | null = null;

export function getRuntimeConfig(): RuntimeConfig {
  if (cached) return cached;

  requireEnv('SUPABASE_URL');
  requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const rawEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development').toLowerCase();
  const appEnv: RuntimeConfig['appEnv'] = rawEnv === 'production' ? 'production' : rawEnv === 'staging' ? 'staging' : 'development';
  const webOrigins = (process.env.WEB_URL ?? process.env.CLIENT_URL ?? 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (webOrigins.length === 0) throw new Error('WEB_URL or CLIENT_URL must contain at least one allowed origin');

  const publicApiUrl = optionalUrl('API_PUBLIC_URL');
  const clientId = (process.env.CASHFREE_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.CASHFREE_CLIENT_SECRET ?? '').trim();
  if ((clientId && !clientSecret) || (!clientId && clientSecret)) {
    throw new Error('CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET must be configured together');
  }
  const cashfreeConfigured = Boolean(clientId && clientSecret);
  const cashfreeEnv = process.env.CASHFREE_ENV?.toLowerCase() === 'production' ? 'production' : 'sandbox';

  const minVersionCode = positiveInt('ANDROID_MIN_VERSION_CODE', 4);
  const recommendedVersionCode = positiveInt('ANDROID_RECOMMENDED_VERSION_CODE', minVersionCode);
  if (recommendedVersionCode < minVersionCode) {
    throw new Error('ANDROID_RECOMMENDED_VERSION_CODE cannot be lower than ANDROID_MIN_VERSION_CODE');
  }

  const maintenanceRaw = (process.env.APP_MAINTENANCE_MODE ?? 'off').toLowerCase();
  const maintenance: MaintenanceMode = maintenanceRaw === 'blocking' ? 'blocking' : maintenanceRaw === 'warning' ? 'warning' : 'off';

  // Staging and production are both public environments: no localhost or plain HTTP.
  if (appEnv !== 'development') {
    for (const origin of webOrigins) {
      if (!origin.startsWith('https://') || /localhost|127\.0\.0\.1|10\.0\.2\.2/i.test(origin)) {
        throw new Error(`${appEnv} WEB_URL/CLIENT_URL must use HTTPS and cannot be local: ${origin}`);
      }
    }
    if (!publicApiUrl) throw new Error(`${appEnv} API_PUBLIC_URL is required`);
    if (!publicApiUrl.startsWith('https://') || /localhost|127\.0\.0\.1|10\.0\.2\.2/i.test(publicApiUrl)) {
      throw new Error(`${appEnv} API_PUBLIC_URL must use public HTTPS`);
    }

    const returnUrl = optionalUrl('CASHFREE_RETURN_URL');
    if (cashfreeConfigured && returnUrl && !returnUrl.startsWith('https://')) {
      throw new Error(`${appEnv} CASHFREE_RETURN_URL must use HTTPS`);
    }
  }

  if (appEnv === 'production' && cashfreeConfigured && cashfreeEnv !== 'production') {
    console.warn('[startup] Cashfree is configured but CASHFREE_ENV is sandbox in production. Payments will remain sandboxed.');
  }

  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

  cached = {
    appEnv,
    appVersion: (process.env.APP_VERSION ?? '0.22.0-dev').trim(),
    releaseSha: (process.env.APP_RELEASE_SHA ?? '').trim() || undefined,
    port,
    webOrigins,
    publicApiUrl,
    cashfreeConfigured,
    cashfreeEnv,
    android: {
      minVersionCode,
      recommendedVersionCode,
      latestVersionName: (process.env.ANDROID_LATEST_VERSION_NAME ?? '0.4.0').trim(),
      updateUrl: optionalUrl('ANDROID_UPDATE_URL')
    },
    maintenance: {
      mode: maintenance,
      message: (process.env.APP_MAINTENANCE_MESSAGE ?? 'Brandspire POS cloud services are undergoing maintenance. Offline billing remains available where supported.').trim()
    }
  };

  return cached;
}
