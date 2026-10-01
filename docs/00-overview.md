# Orderly — Product Overview & Build Plan

Street-Food Ordering + POS Platform
Stack for this stage: **React (frontend)** + **Supabase (backend, DB, auth, realtime, storage)**

---

## 1. What we are building (in one paragraph)

A simple self-service ordering platform for street-food stalls. A customer scans a **permanent QR code** (or uses a **touchscreen kiosk**), browses the stall's menu, adds food to a cart, pays online, gets an **order number** (like `#103`), and tracks the order live — all **without creating an account**. The vendor signs up once, sets up their stall/menu, and uses an authenticated dashboard to receive orders in real time, change order status, manage the QR, launch the kiosk, and see sales reports.

The core loop we must prove first:

```
VENDOR ACCOUNT -> BUSINESS SETUP -> MENU -> PERMANENT QR
CUSTOMER QR / KIOSK -> MENU -> CART -> PAYMENT -> ORDER #
PAYMENT WEBHOOK -> ORDER CONFIRMED -> REALTIME -> VENDOR QUEUE
ACCEPTED -> PREPARING -> READY -> COMPLETED
```

---

## 2. Who uses it

| Actor | Needs an account? | What they do |
|-------|-------------------|--------------|
| **Customer / Guest** | No | Browse menu, add to cart, pay, get order number, track order |
| **Vendor / Stall Owner** | Yes (required) | Set up stall, menu, hours; receive & progress orders; manage QR; launch kiosk; view reports |
| Platform Admin | Future | Platform operations, vendor support |
| Vendor Staff | Future | Handle orders/menu with limited permissions |

Two guiding rules:
- **Customer simplicity first** — never force registration, no phone/email/address required at MVP.
- **Vendor auth is mandatory** — a vendor can never see another vendor's data.

---

## 3. Core principles (must hold throughout)

1. **Database is the source of truth.** Realtime is only a delivery mechanism, never storage.
2. **Never trust the browser for money.** The server (Supabase) recalculates the cart total and only confirms an order after a **verified payment webhook**.
3. **One customer UI, two entry modes** — the exact same ordering screens power both QR ordering and kiosk mode.
4. **Permanent QR encodes a URL, not the menu.** Print once, use forever.
5. **Mobile-first** customer UI, **touch-first** kiosk UI, **desktop/tablet-friendly** vendor UI.
6. Keep the MVP intentionally small. Do not build a restaurant ERP before the street-food loop is validated.

---

## 4. Stack mapping — PRD concepts → React + Supabase

The original PRD leaned on ASP.NET / MSSQL / SignalR. Here is how each responsibility maps onto our chosen stack.

| PRD concept | Our implementation |
|-------------|--------------------|
| Vendor authenticated dashboard | React app, routes guarded by **Supabase Auth** session |
| Vendor auth (mobile OTP) | **Supabase Auth** — phone OTP (or email magic link to start) |
| Customer: no account | Public React routes, no auth; access controlled by **RLS** (public read of active menus only) |
| Database (MSSQL) | **Supabase Postgres** |
| Data isolation between vendors | **Row Level Security (RLS)** policies keyed to `vendor_id = auth.uid()`-owned business |
| Real-time new orders / status | **Supabase Realtime** (Postgres changes / broadcast channels) |
| Image storage (logo, item photos) | **Supabase Storage** bucket (public read, authenticated write) |
| Payment webhook verification | **Supabase Edge Function** receiving the gateway webhook, verifying signature server-side |
| Server-side price calculation | **Supabase Edge Function** / Postgres RPC that recomputes cart from current prices |
| Order numbering | Postgres sequence / RPC scoped per business |
| Permanent QR URL | Public route `/order/:slug`, QR generated client-side from that URL |
| Reports / analytics | Postgres views / RPC aggregations queried from the vendor dashboard |

---

## 5. High-level architecture

```
+------------------+         +------------------+        +-------------------------+
|  Customer React  |  <--->  |     Supabase     | <----> |  Payment Gateway        |
|  (QR / Kiosk)    |         |  - Postgres+RLS  |        |  (UPI/India capable)    |
+------------------+         |  - Auth          |        +-------------------------+
                             |  - Realtime      |              ^   |
+------------------+  <--->  |  - Storage       |   webhook    |   | redirect/return
|  Vendor React    |         |  - Edge Functions| <------------+   v
|  (Dashboard/POS) |         +------------------+        +-------------------------+
+------------------+                                     | Edge Function:          |
                                                         | verify + confirm order  |
                                                         +-------------------------+
```

Key flow for payment (never shortcut this):
1. Customer taps **Pay**.
2. Edge Function recalculates cart from current menu prices → creates a `PENDING` payment + order intent.
3. Customer completes payment at the gateway.
4. Gateway calls our **webhook Edge Function**.
5. Edge Function verifies signature, checks amount/reference, is **idempotent** (duplicate webhooks ignored).
6. Only then: mark payment `SUCCESS`, confirm order, generate order number.
7. Realtime publishes the new order → vendor queue updates instantly.
8. Customer sees confirmation + live status.

---

## 6. Suggested React app structure

```
src/
  app/
    router.tsx              # route definitions (public + guarded)
    supabaseClient.ts       # Supabase client init (anon key)
  features/
    customer/               # public ordering + kiosk (shared screens)
      MenuPage, ItemModal, CartPage, CheckoutPage,
      PaymentPendingPage, PaymentFailedPage, ConfirmationPage, TrackingPage, ClosedPage
    vendor/
      LoginPage, OnboardingWizard, DashboardPage, OrdersPage, OrderDetailPage,
      CategoriesPage, MenuItemsPage, ItemEditorPage, QrPage, KioskLauncher,
      ReportsPage, BusinessSettingsPage, PaymentSettingsPage, LocationPage, ProfilePage
  components/               # shared UI (buttons, cards, modals, KPI cards)
  hooks/                    # useCart, useRealtimeOrders, useVendorSession, etc.
  lib/                      # formatting, qr, validation
```

Routing split:
- **Public (no auth):** `/order/:slug`, `/order/:slug/cart`, `/order/:slug/checkout`, `/order/:slug/pay`, `/order/:slug/track/:orderNo`, `/kiosk/:slug`
- **Vendor (auth required):** `/vendor/login`, `/vendor/onboarding`, `/vendor`, `/vendor/orders`, `/vendor/menu`, `/vendor/qr`, `/vendor/reports`, `/vendor/settings`

---

## 7. MVP scope (what we build now)

**In:** vendor auth + onboarding, business/location/hours, categories/items/availability, public menu, cart/checkout, payment + webhook verification, order creation + numbering, vendor order queue, order status lifecycle, realtime, permanent QR, basic dashboard, basic reports, kiosk mode (same UI).

**Explicitly out (for now):** customer accounts, loyalty, delivery, reservations, full inventory, payroll, suppliers, accounting/ERP, CRM, native mobile app, multi-branch, kitchen display.

---

## 8. Order lifecycle (shared contract)

```
NEW -> ACCEPTED -> PREPARING -> READY -> COMPLETED
                    (CANCELLED possible, refund workflow if applicable)
```

Payment states:
```
INITIATED -> PENDING -> SUCCESS | FAILED | CANCELLED | REFUNDED
```

---

## 9. Open decisions to confirm before/while coding

These are from the PRD — I'll default to the bracketed choice unless you say otherwise.

- Vendor auth method → **[Supabase phone OTP]** (email magic link as fallback for dev)
- Payment gateway → **[Razorpay]** (UPI-capable, good webhooks) — needs your confirmation
- Tax configuration → optional per vendor **[off by default]**
- Order numbering → **[continuous per business]** vs daily reset
- Cancellation / refund policy → **[manual refund at MVP]**
- Public slug → **[auto-generated, editable once]**
- Reports → **[live aggregation via Postgres views]** at MVP

---

## 10. The companion docs

- `10-customer-pages.md` — every customer/kiosk screen: purpose, layout, buttons, flow.
- `20-vendor-pages.md` — every vendor screen: purpose, layout, buttons, flow.
- `90-supabase-setup.md` — exactly what I need from your Supabase project to start wiring the backend.
