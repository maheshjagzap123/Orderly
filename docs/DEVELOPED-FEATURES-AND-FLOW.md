# Orderly — What's Built & How It Flows

Street-food ordering + POS platform. **React + Vite** frontend, **Supabase** backend (Postgres, Auth, Realtime, Storage, Edge Functions).

This document describes what is **actually implemented in the code today** (not the spec wish-list). It is grounded in the real source files so you can see the end-to-end flow before deciding the next feature.

Status: project **type-checks and builds clean** (`npm run build` → exit 0).

---

## 1. Tech stack & how it maps

| Concern | Implementation |
|--------|----------------|
| Frontend | React 18 + Vite 6 + TypeScript, `react-router-dom` v6 |
| Routing | `src/app/router.tsx` — public customer routes + auth-guarded vendor routes |
| Auth guard | `src/app/RequireAuth.tsx` wraps every `/vendor/*` route |
| Backend | Supabase Postgres (`supabase/migrations/*.sql`) |
| Data isolation | Row Level Security (RLS) keyed to `owner_id = auth.uid()` |
| Realtime | Supabase Postgres-changes channels (`useRealtimeOrders`, order tracker) |
| Storage | `menu-images` bucket (item/logo images) |
| Payments | Dev auto-confirm **or** Razorpay via two Edge Functions |
| Order numbers | Postgres RPC `assign_order_number()` — continuous per business, starts at 100 |

---

## 2. Route map (as coded in `router.tsx`)

**Public (no auth):**
- `/` → `HealthCheck` (dev smoke test, Supabase connectivity)
- `/order/:slug` → `MenuPage` in **QR** mode
- `/kiosk/:slug` → `MenuPage` in **KIOSK** mode (same component, `mode` prop)
- `/order/:slug/track/:orderNo` → `TrackingPage`

**Vendor (auth required, lazy-loaded):**
- `/vendor/login` → `LoginPage`
- `/vendor/onboarding` → `OnboardingWizard`
- `/vendor` → `DashboardPage`
- `/vendor/orders` → `OrdersPage`
- `/vendor/orders/:id` → `OrderDetailPage`
- `/vendor/menu` → `MenuManagementPage` (categories + items tabs)
- `/vendor/menu/item/new` and `/vendor/menu/item/:id` → `ItemEditorPage`
- `/vendor/qr` → `QrPage`
- `/vendor/reports` → `ReportsPage`
- `/vendor/settings` → `BusinessSettingsPage`
- `/vendor/settings/payment` → `PaymentSettingsPage`
- `/vendor/settings/location` → `LocationPage`
- `/vendor/settings/profile` → `ProfilePage`
- `*` → redirect to `/`

---

## 3. Database schema (what exists)

From `supabase/migrations/0001_schema.sql` (+ `0002` RLS/realtime, `0003` storage, `0004` profiles).

**Enums:** `order_status` (NEW, ACCEPTED, PREPARING, READY, COMPLETED, CANCELLED), `payment_status` (INITIATED, PENDING, SUCCESS, FAILED, CANCELLED, REFUNDED), `order_source` (QR, KIOSK), `item_badge` (POPULAR, BESTSELLER, NEW).

**Tables:**
- `businesses` — one per stall. owner_id → auth.users. Holds name, slug (unique, public), description, category, logo, address/pincode/lat-long, open/close times, prep time range, `is_open` (manual override), `accepting_orders` (pause toggle), `tax_percent`, `onboarding_complete`, and `order_seq` (the per-business order counter, default 100).
- `categories` — per business, with `display_order` + `is_active`.
- `items` — per business, optional category, `price`, `image_url`, `is_available` (sold-out toggle), `display_order`, optional `badge`.
- `orders` — `order_number` (set on confirm), `customer_name`, `source`, `status`, `subtotal/tax_amount/total`, `payment_status`, `placed_at`, `confirmed_at`.
- `order_items` — **price snapshots** (`item_name`, `unit_price`, `quantity`, `line_total`) so historical orders are immutable.
- `payments` — `status`, `amount`, `gateway`, `gateway_ref`, `gateway_event_id` (unique → webhook idempotency).
- `profiles` — owner profile.

**Key RPC — `assign_order_number(order_id)`:** atomically increments `businesses.order_seq`, stamps the order's `order_number`, sets status `NEW`, payment `SUCCESS`, and `confirmed_at`. This is the single point where an order becomes "confirmed + paid".

---

## 4. Customer / Kiosk flow (end to end)

Same screens power both QR and kiosk; only the `mode` prop differs.

```
Scan QR / open kiosk
   -> /order/:slug  (MenuPage, QR)   |   /kiosk/:slug  (MenuPage, KIOSK)
   -> load business by slug + active menu
   -> browse categories, adjust qty with steppers (cart held in React context)
   -> Cart panel (desktop right side) / sticky bar + drawer (phone)
   -> Proceed to Checkout  (CheckoutModal)
   -> enter optional name, tap "Pay ₹Total"
   -> payForCart()  ->  server recalculates price, creates order
   -> OrderTracker shows order #NNN + live status timeline
```

**File-by-file:**

- `features/customer/MenuPage.tsx` — loads the business via `getBusinessBySlug` and the active menu via `getMenu`. Renders hero header, status banner (closed/paused), category tabs, item grid with badges + sold-out tags, and the cart. `canOrder = is_open && accepting_orders` gates all add buttons. Responsive: desktop shows a persistent cart column; phone shows a sticky bar + bottom drawer.
- `features/customer/cart.tsx` — React context cart. Computes `subtotal`, `taxAmount` (from the business `tax_percent`), `total`, and `count`. Pure client-side display math.
- `features/customer/CartPanel.tsx` — the cart UI (line items, steppers, bill summary, checkout button).
- `features/customer/CheckoutModal.tsx` — three phases: `review` → `paying` → `done`. Collects optional customer name, calls `payForCart`, and on success swaps to `OrderTracker`. Shows "Dev mode: payment auto-confirmed" vs "Secure payment via Razorpay" depending on config.
- `features/customer/OrderTracker.tsx` — shows the big order number, the `NEW → ACCEPTED → PREPARING → READY → COMPLETED` timeline, a "collect at counter" banner at READY, and item list. **Subscribes to realtime** `UPDATE` on that order's row to advance the timeline live. Includes a copy-tracking-link button.
- `features/customer/TrackingPage.tsx` — standalone route (`/order/:slug/track/:orderNo`) for reopening tracking later.

**Server-side price safety (`lib/publicApi.ts → placeOrder`):** never trusts the browser. It re-reads the business (tax + open/accepting state) and the exact items from the DB, recomputes subtotal/tax/total, validates availability and quantity, inserts the order + `order_items` (price snapshots) + a `payments` row, then calls `assign_order_number` to confirm. In the Razorpay path this confirmation moves to the webhook instead.

---

## 5. Payment flow (two modes)

Controlled by `lib/payments.ts`. `razorpayEnabled` is true when `VITE_RAZORPAY_KEY_ID` is set.

**Dev mode (no Razorpay key):**
```
payForCart -> placeOrder()  (server recomputes + inserts)
            -> assign_order_number RPC  -> order confirmed + numbered immediately
```
Good for testing the whole loop without a live gateway.

**Production mode (Razorpay key present):**
```
payForCart -> payWithRazorpay()
   1. invoke Edge Function `create-payment`
        - recomputes amount server-side from DB prices
        - inserts order (payment_status PENDING) + order_items
        - creates a Razorpay order, inserts pending payment row w/ gateway_ref
   2. load Razorpay Checkout SDK, open the modal, customer pays
   3. Razorpay calls Edge Function `razorpay-webhook`
        - verifies HMAC-SHA256 signature
        - idempotent via gateway_event_id
        - on payment.captured/order.paid -> mark SUCCESS + assign_order_number
        - on payment.failed -> mark payment + order FAILED
   4. client polls the order row until order_number appears (waitForOrderNumber)
```

**Key principle enforced in code:** the browser total is display-only; the server (Edge Function) always recomputes the real amount, and the order is only confirmed by the **verified webhook** — never by the browser redirect.

Edge Functions live in `supabase/functions/create-payment/` and `supabase/functions/razorpay-webhook/`.

---

## 6. Vendor flow (end to end)

All vendor routes are wrapped by `RequireAuth` (redirects to `/vendor/login` without a session) and share `VendorLayout` (dark sidebar + top bar).

```
Login -> onboarding complete?
   no  -> OnboardingWizard -> creates business + slug -> Dashboard
   yes -> Dashboard
Dashboard -> Orders / Menu / QR / Reports / Settings / Launch Kiosk
```

**Pages:**

- `LoginPage.tsx` — **email + password** sign-in (dev auth), with magic-link capability in `lib/auth.ts`. (Note: spec's primary was phone OTP; current build uses email/password.)
- `OnboardingWizard.tsx` — multi-step: business details, address/location (with "Use my location" geolocation), hours/prep time, tax. On finish calls `createBusiness` which sets `onboarding_complete = true` and generates the slug.
- `DashboardPage.tsx` — KPI cards (orders, revenue, items sold, AOV) from `getTodayMetrics`; sales/analytics from `getDashboardAnalytics` (daily series, hourly histogram, top items, peak hour); recent orders live via `useRealtimeOrders`; QR card; "Open Customer POS" kiosk launch.
- `OrdersPage.tsx` — live order queue via `useRealtimeOrders`. Status actions follow `NEXT_STATUS` (`NEW→ACCEPTED→PREPARING→READY→COMPLETED`) through `updateOrderStatus`.
- `OrderDetailPage.tsx` — single order: items (snapshots), payment info, timestamps, lifecycle actions.
- `MenuManagementPage.tsx` — Categories tab (create/edit/enable/delete) + Items tab (search, add/edit, sold-out toggle, delete).
- `ItemEditorPage.tsx` — create/edit item: name, category, price, description, image upload (`uploadMenuImage` → Storage), availability, display order, badge.
- `QrPage.tsx` — renders the permanent QR from the public ordering URL (`qrcode` lib), with download/print/copy.
- `ReportsPage.tsx` — period filters; aggregates via `getReport` (revenue, orders, completed/cancelled, items sold, AOV, QR vs kiosk, best sellers).
- `settings/BusinessSettingsPage.tsx` — business data, hours, Accepting Orders toggle.
- `settings/LocationPage.tsx` — address + geolocation capture.
- `settings/PaymentSettingsPage.tsx` — gateway status; **"Connect Gateway" button is disabled ("coming soon")**.
- `settings/ProfilePage.tsx` — owner profile + logout.

---

## 7. Realtime (how live updates work)

- **Vendor side** — `hooks/useRealtimeOrders.ts` subscribes to all changes on `orders` filtered by `business_id`. On (re)connect it re-fetches authoritative rows (DB is source of truth; realtime is only transport). New orders prepend to the queue; status changes update in place.
- **Customer side** — `OrderTracker` subscribes to `UPDATE` on its single order row to advance the status timeline live.

---

## 8. Shared libs & components

- `lib/supabase.ts` — Supabase client (anon key).
- `lib/auth.ts` — sign-in (password + magic link) and sign-out.
- `lib/publicApi.ts` — anon-safe reads (business, menu, order lookup) + `placeOrder`.
- `lib/vendorApi.ts` — all authenticated vendor reads/writes, metrics, reports, analytics, image upload.
- `lib/payments.ts` — dev vs Razorpay payment orchestration.
- `lib/format.ts` — `formatINR`, `formatHours`.
- `lib/database.types.ts` — shared TypeScript row types.
- `components/` — `ui/Button`, `QtyStepper`, `StatusPill`, `charts/BarChart`, `charts/ComboChart`, `HealthCheck`, `Placeholder`.

---

## 9. What's done vs pending (quick view)

**Done**
- Public menu + cart + checkout (QR and kiosk, one component)
- Server-side price recalculation + price snapshots
- Order creation, numbering, lifecycle (NEW→…→COMPLETED)
- Live order tracking (customer) and live order queue (vendor)
- Vendor auth guard, onboarding, dashboard with KPIs/charts, orders, menu CRUD, image upload, QR, reports, settings pages
- Razorpay Edge Functions (create-payment + signature-verified, idempotent webhook)
- DB schema + RLS + realtime + storage migrations
- Clean type-check + production build

**Pending / differs from spec**
- Vendor login is **email/password**, spec's primary was phone OTP
- Payment Settings **"Connect Gateway" is a disabled placeholder** (Edge Functions exist, but no vendor-facing connect UI; Razorpay activates via env keys)
- Some customer sub-states (item detail, payment pending/failed, confirmation, closed) are handled **inline in modals/components** rather than as separate routes
- Reports/analytics aggregate **in the client** from order rows, not via Postgres views/RPC
- `_dbprobe/` is dev scaffolding, not product code

---

## 10. The core loop in one picture

```
VENDOR: login -> onboarding -> business + slug -> menu -> permanent QR
CUSTOMER: scan QR / kiosk -> menu -> cart -> checkout -> pay
  dev:        placeOrder (server recompute) -> assign_order_number -> confirmed
  razorpay:   create-payment -> Checkout -> webhook (verify) -> assign_order_number -> confirmed
REALTIME: new order -> vendor queue; status change -> customer tracker
LIFECYCLE: NEW -> ACCEPTED -> PREPARING -> READY -> COMPLETED
```
