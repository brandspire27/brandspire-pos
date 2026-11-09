# Brandspire POS — Production Environment Checklist

Production secrets must be supplied by the deployment platform/secret manager. Do not commit or package them.

## API

Required:
- `NODE_ENV=production`
- `APP_ENV=production`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON` or workload/application-default credentials
- `R2_ACCOUNT_ID`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `WEB_URL=https://app.brandspire.tech`
- `API_PUBLIC_URL=https://api.brandspire.tech`
- `CASHFREE_ENV=production` when production payments are enabled
- `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, and `CASHFREE_WEBHOOK_SECRET` when payments are enabled

Optional:
- `AI_PROVIDER`, `AI_PROVIDER_KEY`, `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_MODEL`
- `ANDROID_*` version/update variables
- `APP_MAINTENANCE_MODE`, `APP_MAINTENANCE_MESSAGE`

## Web

Browser-safe values only:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_API_URL=https://api.brandspire.tech`

Never put Firebase service-account credentials, Turso tokens, R2 credentials, Cashfree secrets, or AI provider secrets in web variables.

## Android

Configure client values in Gradle properties:
- `BRANDSPIRE_FIREBASE_API_KEY`
- `BRANDSPIRE_API_BASE_URL=https://api.brandspire.tech`

`apps/android/local.properties` is machine-specific and must never be committed. Do not put server credentials in Android configuration.
