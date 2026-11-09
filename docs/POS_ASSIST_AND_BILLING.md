# Billing fixes and assisted entry

Implemented for the web owner product page and owner/staff billing workspace.

## Corrections

- Wait for Firebase authentication restoration before requesting an ID token.
- Load owner and staff workspaces through the shared POS endpoint.
- Include GST for tax-exclusive catalog products.
- Retain the invoice request ID for retries of the same submission and prevent simultaneous submissions.
- Keep a saved invoice visible if catalog refresh fails.
- Enforce staff discount rules on the API, and close database transactions after completion.
- Display workspace-loading errors with a retry action on the billing page.

## Assisted entry

The product assistant extracts a name and explicit INR price from typed text, browser speech transcription, or a JPEG/PNG/WebP photo. It fills the existing form; missing prices remain blank. Stock and tax are reviewed in that form. Photos are processed for extraction and are not attached to the product.

The billing assistant adds matched items to the current cart as a reviewable draft matched against up to the first 500 active catalog products. It validates product IDs and stock against that catalog. Unknown or ambiguous items can be omitted, so compare the entire draft with the request. Existing catalog prices, discounts, invoice validation and payment workflows remain authoritative. No invoice is issued by the assistant.

Configure the API's existing environment settings:

```dotenv
AI_PROVIDER=openai-compatible
AI_PROVIDER_BASE_URL=https://api.openai.com/v1
AI_PROVIDER_KEY=<server-side-secret>
AI_PROVIDER_MODEL=<vision-capable-model>
```

The provider must support chat completions, JSON object responses and image content. Inputs are sent to that provider only when preparing a draft. Browser speech support varies; microphone access requires permission and a secure context. Voice supports selectable Hindi/Hinglish and English (India). Typed entry is always available. Photos are limited to 2 MB; JSON bodies to 4 MB. AI requests have a 30-second timeout and a dedicated rate limit.

## Verification

From the repository root:

```powershell
node apps/api/node_modules/typescript/bin/tsc -p apps/api/tsconfig.json
node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
node apps/api/scripts/db-migrate-smoke.mjs
node apps/api/scripts/pos-billing-smoke.mjs
```

The billing smoke test uses an isolated in-memory migrated database and checks inclusive/exclusive GST, duplicate retries, stock updates, transaction rollback and staff discount policy.

Live Firebase login, remote Turso connectivity, microphone/photo UX and provider output still require a configured deployment and browser acceptance testing. Android assisted entry is not implemented by this change. Existing business-insights assistance remains separate; general automatic troubleshooting is not implemented.
