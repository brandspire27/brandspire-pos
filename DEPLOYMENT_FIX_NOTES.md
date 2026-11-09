# Fix summary

The password-recovery error is produced by Supabase Auth in the browser. The NestJS API is not involved in that request.

Changes made:
- browser Supabase client supports `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with legacy anon fallback
- backend supports `SUPABASE_SECRET_KEY` with legacy service-role fallback
- forgot-password page gives a targeted message for invalid browser API keys
- production/staging env templates contain placeholders only
- release preflight recognizes the current key names
- added `SUPABASE_API_KEY_FIX.md`

You must supply a current valid Supabase key in the deployment platform; code cannot restore a revoked key.
