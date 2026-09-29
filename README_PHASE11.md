# Brandspire POS — Phase 11 Android Operations

This patch extends the Android app from a billing foundation into the core Staff/Owner operational workspace.

## Included
- Android Customers screen: cached search + online Add Customer.
- Android Products screen: cached search + online Add Product.
- Android Bills screen: latest synchronized bills + pending-sync count.
- Home quick actions now open real Customers, Products and Bills screens.
- English / Hinglish / Hindi labels expanded across the new Android screens.
- Printer Setup and Brandspire Assist now follow the selected workspace language.
- Existing Create Bill, offline invoice queue, idempotent sync, secure session and printer adapters remain intact.

## Security
Staff can add/search Customers, add/search Products and create Bills. The new Android screens do not expose edit/delete or Owner-management actions. Supabase RLS remains the server-side authorization boundary.

## Offline behavior
- Cached Customer/Product search: works offline.
- Create Bill from cached data: works offline and queues safely.
- Add new Customer/Product: currently requires internet because these records are written immediately through authenticated Supabase RLS. Offline create queues for these entities are intentionally not claimed yet.
- Bill history: synchronized server history requires internet; pending bill count remains local.

## Install
Copy everything in this patch into the existing `brandspire-pos-starter` root and replace matching files.

No new Supabase migration, npm package or Gradle dependency is required.

Important: this patch deliberately does not include `apps/android/app/build.gradle.kts`, so your local JVM 17 fix remains untouched.

## Rebuild APK
Android Studio -> Build -> Build Bundle(s) / APK(s) -> Build APK(s)

Install the new debug APK over the existing app.

## Test order
1. Login as Owner.
2. Open Customers -> add a test customer -> confirm it appears in cached list.
3. Open Products -> add a test product -> confirm stock/price/GST display.
4. Open Create Bill -> use the newly added customer/product -> save bill.
5. Open Bills -> confirm synced invoice appears when online.
6. Turn internet off -> Customers/Products cached search and Create Bill should still work.
7. Confirm Staff can use Customers/Products/Create Bill but has no delete/edit/Owner controls.
8. Open Printer Setup and Brandspire Assist in English/Hinglish/Hindi and verify labels follow the selected language.
