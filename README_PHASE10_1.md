# Brandspire POS Android Phase 10.1 — UI + Navigation Hotfix

This patch fixes the two issues reported during Android testing:

1. The Home screen looked like a plain technical prototype.
2. Several generic `Open` buttons were confusing; Create Bill and Owner Controls were placeholders.

## What changes

- New polished Android home screen with Brandspire visual hierarchy.
- Removes generic `Open` labels and uses action-specific buttons (`Start Billing`, `Sync Now`, `Setup Printer`, `Ask Assist`).
- Create Bill now opens a real Android billing screen.
- Android Create Bill uses cached products/customers, quantity controls and payment method selection.
- Bills are saved to the existing offline queue with a unique client invoice ID.
- When online, a sync worker is triggered immediately.
- When offline, the bill remains pending and will sync later without duplicate invoice creation.
- Product/customer sync remains functional.
- Printer Setup and Brandspire Assist remain functional.
- Placeholder Owner Controls button was removed and replaced with an informational card.

## Install

Copy the contents of this patch into the root `brandspire-pos-starter` folder and replace matching files.

No Supabase migration and no new Gradle dependency are required.

Rebuild the Android APK after copying the files.

## First test

1. Login as Owner.
2. Tap `Sync Now` on Products & Customers once.
3. Tap `Start Billing`.
4. Add a cached product.
5. Choose Cash/UPI/Card/Credit.
6. Tap `Bill Save Karo` / `Save Bill`.
7. Return home and verify Pending count changes briefly/offline.
8. With internet online, use `Sync Pending Bills` and verify the invoice appears in the web Bills page.
