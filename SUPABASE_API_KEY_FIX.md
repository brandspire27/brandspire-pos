# Brandspire POS — Supabase API-key fix

## Root cause

The Forgot Password page calls Supabase Auth directly in the browser:

`supabase.auth.resetPasswordForEmail(...)`

So the screenshot's **Invalid API key** is a Supabase browser-key problem, not a NestJS backend problem.

The web client has been patched to accept the current Supabase `publishable` browser key and retain the legacy `anon` key as a fallback.

## Web deployment

Set these Production environment variables on your web host:

- `NEXT_PUBLIC_SUPABASE_URL` = your current Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the current publishable key from Supabase
- `NEXT_PUBLIC_API_URL=https://api.brandspire.tech`

Then redeploy. `NEXT_PUBLIC_*` values are embedded at build time.

Do NOT put a service-role/secret key in the web app.

## Supabase Auth

In Supabase Auth URL configuration:

- Site URL: `https://app.brandspire.tech`
- Redirect URL: `https://app.brandspire.tech/auth/reset-password`

Use your actual production domain if different.

## Backend deployment

Set:

- `NODE_ENV=production`
- `APP_ENV=production`
- `PORT=3001`
- `WEB_URL=https://app.brandspire.tech`
- `API_PUBLIC_URL=https://api.brandspire.tech`
- `SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co`
- `SUPABASE_SECRET_KEY=<current server secret key>`

The backend also accepts the legacy `SUPABASE_SERVICE_ROLE_KEY`.

Health endpoints:

- `/api/health`
- `/api/health/ready`
- `/api/health/release`

## Security

The uploaded ZIP contained server credentials in environment files. Treat those credentials as compromised and rotate/reissue the Supabase server key, Cashfree secret, and AI provider key before production deployment.

A source-code change cannot manufacture a valid Supabase API key. The current key must come from your Supabase project settings.
