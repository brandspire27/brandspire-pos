# Billing fixes and assisted entry

Implemented for the web owner product page and owner/staff billing workspace.

## Corrections

## Limited offline queue (web)

An already-loaded, authenticated billing page can save one cash/credit bill to IndexedDB when `navigator.onLine` is false. The record is scoped to the Firebase user and organization, retains its client invoice UUID and item price/tax snapshot, and is clearly pending rather than a confirmed invoice. The pending panel offers manual sync after reconnect. Existing server membership, stock, customer and discount checks still apply. Changed price/tax rejects the request; an already-created invoice returns its original result before those checks, so lost responses can be retried safely.

Limits: no service worker/cold offline launch, no automatic sync or multi-bill queue, no offline AI/new product/customer creation, and no gateway payment verification. A network error while the browser reports online retains the recoverable cart instead of automatically queuing a sale. Conflict resolution needs operator review and is not yet provided in the pending panel. Browser IndexedDB/reconnect/restart acceptance testing remains required. Keep a single billing tab per account during this initial rollout. This is not full offline billing readiness.

- Wait for Firebase authentication restoration before requesting an ID token.
- Load owner and staff workspaces through the shared POS endpoint.
- Include GST for tax-exclusive catalog products.
- Retain the invoice request ID for retries of the same submission and prevent simultaneous submissions.
- Keep a saved invoice visible if catalog refresh fails.
- Enforce staff discount rules on the API, and close database transactions after completion.
- Display workspace-loading errors with a retry action on the billing page.

## Assisted entry

### Quick confirmation flow

Voice now automatically prepares a preview after transcription. Typed input uses Preview. Products can be saved directly from the editable preview (name, per-unit price, stock, unit, tax); omitted stock/tax default visibly to zero. Billing can confirm and save directly using the current customer, payment and discount settings, merging with existing cart items. The usual invoice idempotency key and server validation remain in use. More details/Edit in cart remains available. Ambiguous cloud bill items must be returned in `unresolved` and block confirmation. Browser acceptance testing is still required; this does not guarantee instantaneous cloud latency.

The quick flow supports one new product per request, and bills from existing products. Creating multiple new products/customers and an invoice from one utterance is not implemented. Payment/customer/discount commands require manual selection and are requested as clarifications. Product creation still uses the existing non-idempotent product endpoint; after an uncertain network failure, check the catalog before retrying.

### Key-free basic drafts

Without any cloud AI key, product entry accepts an explicit price: `Milk @ 60`, `Milk 60 rupees`, or `दूध ६० रुपये`. Bill entry accepts `2 Milk, 1 Bread` or `Milk x 2`; fractional quantities are supported. Browser speech can populate the same text, but spoken number words and arbitrary natural language are not parsed locally. This is a constrained parser, not a local AI model.

Basic bill entry searches exact names, SKUs and barcodes across the tenant's active catalog. It rejects ambiguous or unmatched lines as a whole, aggregates repeated products, and checks stock. No stock is changed until the normal invoice save. Cloud-based bill drafts retain the 500-product limit described below.

Drafts now appear in a preview before the user applies them to the product form or cart. Applying consumes the preview and clears the source input to prevent accidental repeated application. Browser speech may require an external speech service; this is not offline speech recognition. Photo extraction and free-form requests still need a configured cloud provider. No cloud account, quota or availability is implied by this feature.

The product assistant extracts a name and explicit INR price from typed text, browser speech transcription, or a JPEG/PNG/WebP photo. It fills the existing form; missing prices remain blank. Stock and tax are reviewed in that form. Photos are processed for extraction and are not attached to the product.

The billing assistant adds matched items to the current cart as a reviewable draft matched against up to the first 500 active catalog products. It validates product IDs and stock against that catalog. Unknown or ambiguous items can be omitted, so compare the entire draft with the request. Existing catalog prices, discounts, invoice validation and payment workflows remain authoritative. No invoice is issued by the assistant.

Configure the API's existing environment settings:

For Groq, `AI_PROVIDER=groq` plus `GROQ_API_KEY` (or `AI_PROVIDER_KEY`) is supported. Explicit Groq selection uses `https://api.groq.com/openai/v1` and defaults to `qwen/qwen3.8-27b`; `AI_PROVIDER_MODEL` can override the model. Missing settings are identified by name without exposing values. Provider authentication, access, quota and model errors are distinguished. Save environment changes and deploy the API before retrying. The legacy OpenAI-compatible configuration below remains supported.

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
node apps/api/scripts/pos-assist-smoke.mjs
```

The billing smoke test uses an isolated in-memory migrated database and checks inclusive/exclusive GST, duplicate retries, stock updates, transaction rollback and staff discount policy.

Live Firebase login, remote Turso connectivity, microphone/photo UX and provider output still require a configured deployment and browser acceptance testing. Android assisted entry is not implemented by this change. Existing business-insights assistance remains separate; general automatic troubleshooting is not implemented.
