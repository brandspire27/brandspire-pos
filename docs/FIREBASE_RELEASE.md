# Firebase frontend release

Target: existing Firebase project `bsp-pos`; backend remains on Render.

## App Hosting setup

- App Hosting requires a linked Blaze billing account. Do not upgrade billing without the owner's approval.
- Repository: `brandspire27/brandspire-pos`; branch: `main`; app root: `apps/web`.
- Keep the repository-root pnpm lockfile/workspace. Use Node 24 (matching local build runtime); default Next framework build, no static export.
- `apps/web/apphosting.yaml` sets Render API URL and scale-to-zero with a two-instance maximum. This is not a spending cap.
- Set these browser configuration variables in App Hosting, available during BUILD (and RUNTIME), from the existing Firebase web app configuration:
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID=bsp-pos` is in YAML. Confirm the selected web app belongs to that project.
- No Firebase service-account private key, Groq key, Turso token, R2 credential or payment secret belongs in the frontend environment.

## Connect after the frontend URL exists

1. Set Render `WEB_URL` to the exact HTTPS frontend origin (comma-separated existing approved origins may be retained). Redeploy API. Do not use a wildcard.
2. Add the frontend hostname to Firebase Authentication authorized domains when required by the auth flow.
3. Verify live login, role isolation, catalog, voice preview, invoice detail routing and a designated test-shop sale/retry.
4. Verify `/pos-sw.js` returns JavaScript with no-cache headers and test prepared offline reopening on Windows and Android.

## Current release limits

This is an initial pilot release, not verified readiness for every shop. Physical printer/microphone tests, full offline acceptance, payment gateway reconciliation and transactional draft recovery remain outstanding. The existing test shop's expired trial must be addressed explicitly rather than bypassed.

Official docs: https://firebase.google.com/docs/app-hosting/get-started
Configuration: https://firebase.google.com/docs/app-hosting/configure
Monorepos: https://firebase.google.com/docs/app-hosting/monorepos
