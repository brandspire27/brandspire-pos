# Brandspire POS — Production Environment Checklist

Production secrets must be supplied by the deployment platform/secret manager. Do not commit or package them.

## API

Required:
- NODE_ENV=production
- APP_ENV=production
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- WEB_URL=https://app.brandspire.tech
- API_PUBLIC_URL=https://api.brandspire.tech
- CASHFREE_ENV=production (only when production payments are enabled)
- CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET / CASHFREE_WEBHOOK_SECRET (payments)

Optional:
- DATABASE_URL
- AI_PROVIDER / AI_PROVIDER_KEY / AI_PROVIDER_BASE_URL / AI_PROVIDER_MODEL
- ANDROID_* version/update variables
- APP_MAINTENANCE_MODE / APP_MAINTENANCE_MESSAGE

## Web

Only browser-safe variables:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_API_URL=https://api.brandspire.tech

Never put API service-role, Cashfree secret, webhook secret, or AI provider secret in Web variables.

## Android

Configure only non-secret client values in Gradle properties:
- BRANDSPIRE_SUPABASE_URL
- BRANDSPIRE_SUPABASE_ANON_KEY
- BRANDSPIRE_API_BASE_URL=https://api.brandspire.tech

`apps/android/local.properties` is machine-specific and must never be committed.
