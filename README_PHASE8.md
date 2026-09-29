# Brandspire POS — Phase 8

This patch adds:

- Owner Customer Ledger
- Owner-only paid invoice Returns / Refunds / Credit Notes
- Transactional returned-stock restoration
- Credit-note audit logging
- Refund payment records
- Owner-only Online Business Insights through a controlled provider adapter
- Offline Brandspire Assist remains available for Owner and Staff
- Hydration-safe workspace loader
- Android offline queue / printer setup UI foundation

## Install

1. Copy the Phase 8 patch into the existing Brandspire POS project and replace matching files.
2. In Supabase SQL Editor run:
   `supabase/migrations/0008_customer_ledger_credit_notes_ai.sql`
3. Restart:
   `npx pnpm@11.24.0 dev`

No new npm package is required.

## Test Customer Ledger

Owner → Customer Ledger → select a customer.

Expected events can include invoice, payment, credit note and refund entries. The original invoice is never rewritten or hard-deleted.

## Test Returns & Refunds

Use a fully-paid invoice. Owner → Returns & Refunds → choose invoice → enter return quantity → choose refund method → enter reason → Issue Credit Note & Refund.

Expected:
- credit note created
- refund recorded
- returned product stock restored
- inventory RETURN movement created
- audit log created
- original invoice retained

For Phase 8, refunds are intentionally limited to fully-paid invoices. Unpaid invoices continue to use the safe cancellation flow. This avoids mixing refund accounting with unresolved customer dues.

## Online Brandspire Assist

Online Business Insights are optional and are not faked when no provider is configured.

Add these only to `apps/api/.env` if/when you want to enable an OpenAI-compatible provider:

```env
AI_PROVIDER=openai-compatible
AI_PROVIDER_KEY=your_server_side_key
AI_PROVIDER_BASE_URL=https://api.openai.com/v1
AI_PROVIDER_MODEL=your_model_name
```

Never put the AI key in `apps/web/.env.local`.

The AI endpoint receives only a controlled 30-day snapshot produced by server-side tools (sales totals, top products, low stock and outstanding customers). It never receives arbitrary SQL or unrestricted database access.

If AI is not configured, the UI clearly says so and Offline Brandspire Assist continues working.

## Android

The Android project now includes a durable local queue foundation using a client-generated invoice UUID plus explicit ONLINE / OFFLINE / SYNCING / SYNC_FAILED state models. This is still a foundation; do not claim full offline billing until sync APIs and device tests are complete.
