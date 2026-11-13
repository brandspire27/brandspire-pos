# Free Firebase Hosting release — 13 November 2026

Target: Firebase project/site `bsp-pos`, Spark plan. Backend stays at `https://brandspire-pos-api.onrender.com`. No App Hosting, Cloud Run, Functions or billing upgrade is required for this static frontend deployment. `apphosting.yaml` is an unused alternative and is not read by this release command.

## Build and deploy

1. Keep the existing frontend Firebase browser configuration in `apps/web/.env.local`; never place backend secrets there.
2. From `apps/web`, run `node scripts/build-firebase.mjs` (or `pnpm build:firebase`).
3. From the repository root, run `npx firebase-tools login` and authorize the correct Google account.
4. Run `npx firebase-tools deploy --only hosting --project bsp-pos`.

`firebase.json` publishes only `apps/web/out`, serves security headers and no-cache headers for the offline service worker, and redirects legacy detail URLs. Invoice detail pages now use `/owner/invoice?id=...` and `/staff/invoice?id=...`; admin detail uses `/admin/organization?id=...`. Data remains fetched through authenticated API requests.

## Connect the backend

After confirming the actual hosting URLs, add `https://bsp-pos.web.app` and `https://bsp-pos.firebaseapp.com` to Render `WEB_URL` (comma-separated approved origins). Redeploy the API. Do not use a wildcard. Confirm the domain is authorized in Firebase Authentication when required by the auth flow.

## Release verification

Static export passed locally. Live deployment, CORS, login, roles, invoice navigation, voice, printer and offline restart must be verified on the deployed URL. Use a designated test shop; the prior shop trial was expired. Do not bypass subscription controls.

Free hosting is quota-limited, not unlimited. Check the Firebase console usage; no paid upgrade is authorized.

Docs: https://firebase.google.com/docs/hosting/usage-quotas-pricing
