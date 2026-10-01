# Vendor Pages

The vendor experience is a **desktop/tablet-friendly SaaS/POS dashboard**: dark side navigation, KPI cards, sales charts, order queue, menu management, QR panel, and a one-tap launch for the customer kiosk. See `30-ui-reference.md` for the exact look from the provided dashboard mockup.

**Global chrome (all vendor pages):**
- **Dark left sidebar** (fixed): brand logo + name, then nav — Dashboard, Orders (with red unread-count badge), Menu Management, Categories, Reports, Customer POS, QR Code, Business Settings, Location & Hours, Payment Settings, Profile & Team; footer: Logout + a "Need Help? / Contact Support" card. Active item highlighted red.
- **Top bar:** collapse/hamburger (left); right side has an **`Online ▾` status dropdown** (green dot), a **notifications bell with unread badge**, and the vendor avatar + "Business Name / Owner ▾".

All vendor routes require a **Supabase Auth session**. Every data read/write is scoped to the vendor's own business via **RLS** — Vendor A can never see Vendor B's data.

Legend: `[Button]` = action. "Primary" = main accent button.

---

## Vendor flow at a glance

```
Login --> (onboarding complete?) --no--> Onboarding Wizard --> Dashboard
                                 --yes-> Dashboard
Dashboard --> Orders / Menu / QR / Reports / Settings / Launch Kiosk
```

---

## 1. Login  (`/vendor/login`)

**Purpose:** authenticate the vendor.

**Layout:** logo, "Vendor Login", phone number field, OTP step (Supabase phone OTP; email magic link as dev fallback).

**Buttons:**
| Button | Where | Action |
|--------|-------|--------|
| `[Send OTP]` | Primary | Request OTP for the phone number |
| `[Verify & Continue]` | Primary (step 2) | Verify OTP, create session |
| `[Resend OTP]` | Secondary | Re-send code |

**Rules:** after login, check if onboarding is complete → route to Onboarding or Dashboard. Handle session expiry/logout securely.

---

## 2. Onboarding Wizard  (`/vendor/onboarding`)

**Purpose:** one-time setup to get the stall live. Multi-step; each step saves progress.

**Steps & key fields:**
1. **Owner & Business** — owner name*, business/stall name*, business category* (default: street food), logo/image (optional).
2. **Address & Location** — address*, pincode (recommended), latitude/longitude (recommended, via browser geolocation with permission).
3. **Operating Hours** — open/close times*, preparation time (e.g. 10–15 min).
4. **Menu** — create first categories; add items (name*, price*, image/description optional, availability).
5. **Payment** — connect/configure the payment gateway (required before paid ordering).
6. **Finish** — system creates the **permanent public slug + ordering URL** and generates the **QR**.

**Buttons:**
| Button | Where | Action |
|--------|-------|--------|
| `[Use my location]` | Step 2 | Capture lat/long via geolocation |
| `[Add Category]` / `[Add Item]` | Step 4 | Create menu entries |
| `[Back]` / `[Next]` | Each step | Navigate wizard |
| `[Finish Setup]` | Final step, primary | Generate slug + QR, go to Dashboard |

**Rules:** required fields block only their own step; location capture is one-time (no continuous tracking).

---

## 3. Dashboard  (`/vendor`)

**Purpose:** the operational home — today's performance + live order queue + quick actions.

**Layout (matches the dashboard mockup):**
- **Greeting:** "Good Morning, {Owner}! 👋" + subtitle "Here's what's happening at your business today."
- **4 KPI cards (top row)**, each with icon, label, big value, and **trend vs yesterday** (green up / red down): Total Orders, Total Revenue (₹), Items Sold, Avg. Order Value (₹).
- **Sales Overview** card: combo chart — bars = Orders, line = Revenue — with a `Last 7 Days ▾` range selector and Orders/Revenue legend.
- **Quick Actions** card (see table below).
- **Top Selling Items** card: ranked 1–5 with thumbnail, name, "X sold", revenue, % bar; `Last 30 Days ▾`.
- **Sales Reports** mini-stats card: Total Orders, Total Revenue, Items Sold, Completed (count + %), Cancelled (count + %), Failed Payments (count + %); `Last 7 Days ▾`.
- **Peak Hours** card: hourly bar chart (8 AM–10 PM) with peak tooltip; `Last 7 Days ▾`.

**Right column (matches mockup):**
- **Store Hours** card: hours + **Accepting Orders** green toggle.
- **Your Ordering QR Code** card: QR, ordering URL + copy icon, buttons `[Download QR]` (red), `[Print QR]`, `[Share]`.
- **Open Customer POS** card (green): "Launch the customer ordering screen on this device (Kiosk Mode)" + `[Open POS →]`.
- **Recent Orders** card: `View All` link; rows with order no, time, items summary, amount, status pill, chevron.
- **Today's Summary** card: orders + revenue line, plus Best Selling Item, Busiest Hour, Avg Preparation.

**Store controls** also live in the top bar (`Online ▾` status) and the Store Hours card (`Accepting Orders` toggle).

**Quick Action buttons:**
| Button | Action |
|--------|--------|
| `[Add New Item]` | Open Add/Edit Item |
| `[Manage Menu]` | Open Menu Items |
| `[View Orders]` | Open Orders queue |
| `[View Reports]` | Open Reports |
| `[Business Settings]` | Open Settings |
| `[Open Customer POS]` | Launch kiosk (`/kiosk/:slug` full-screen) |
| `[Download QR]` | Download permanent QR image |
| `[Print QR]` | Open print-friendly QR |
| `[Share]` | Copy/share public ordering URL |

**Store control buttons:**
| Button | Action |
|--------|--------|
| `[Open/Closed]` toggle | Set store open state (overrides schedule) |
| `[Accepting Orders ON/OFF]` | Block/allow new checkouts (distinct from closing) |

**Rules:** connect to Supabase Realtime on load; `OrderCreated` events add to the queue with a visual badge/counter and optional sound. On reconnect, re-fetch authoritative open orders from the DB.

---

## 4. Orders Queue  (`/vendor/orders`)

**Purpose:** work through live and past orders.

**Layout:**
- Filters: status (New/Accepted/Preparing/Ready/Completed/Cancelled), date, source (QR/Kiosk).
- **Order cards**, each showing: order number, order time, source, items + quantities, total, optional customer name, payment status, current status, action button.

**Action buttons (depend on status):**
| Current status | Button | Moves to |
|----------------|--------|----------|
| NEW | `[Accept]` | ACCEPTED |
| ACCEPTED | `[Start Preparing]` | PREPARING |
| PREPARING | `[Mark Ready]` | READY |
| READY | `[Complete]` | COMPLETED |
| (any active) | `[Cancel]` | CANCELLED (refund workflow if applicable) |
| (card) | `[View Detail]` | Order Detail |

**Rules:** status transitions are controlled (only valid next states). Changes publish `OrderStatusChanged` to the customer and sync other vendor screens.

---

## 5. Order Detail  (`/vendor/orders/:id`)

**Purpose:** full view of a single order.

**Layout:** items with name/price **snapshots**, payment info + gateway reference, timestamps, status history timeline.

**Buttons:** same lifecycle action(s) as the queue (`[Accept]`/`[Start Preparing]`/`[Mark Ready]`/`[Complete]`/`[Cancel]`).

---

## 6. Categories  (`/vendor/menu` → Categories tab)

**Purpose:** organize the menu.

**Buttons:**
| Button | Action |
|--------|--------|
| `[Add Category]` | Create a category |
| `[Edit]` | Rename a category |
| `[Enable/Disable]` toggle | Show/hide to customers |
| `[Reorder]` (drag) | Change display order |
| `[Delete]` | Delete when safe (no blocking items) |

**Rules:** only active categories show to customers.

---

## 7. Menu Items  (`/vendor/menu` → Items tab)

**Purpose:** manage all food items.

**Layout:** search bar + item list (image, name, category, price, availability, badge, display order).

**Buttons:**
| Button | Action |
|--------|--------|
| `[Add Item]` | Open Add/Edit Item |
| `[Edit]` | Open Add/Edit Item |
| `[Sold Out / Available]` toggle | One-click availability |
| `[Delete]` | Remove item (confirm) |

**Rules:** unavailable items can't be newly added by customers; existing confirmed orders are unaffected.

---

## 8. Add / Edit Item  (`/vendor/menu/item/new`, `/vendor/menu/item/:id`)

**Purpose:** create or edit a food item.

**Fields:** name*, category*, price* (positive), description (optional), image (Supabase Storage, optional), available* toggle, display order*, badge (Popular/Bestseller/New, optional), prep time (optional/future).

**Buttons:**
| Button | Action |
|--------|--------|
| `[Upload Image]` | Upload to Storage bucket |
| `[Save]` | Primary — create/update item |
| `[Cancel]` | Discard |

**Rules:** name + price required; handle image upload failure gracefully.

---

## 9. QR  (`/vendor/qr`)

**Purpose:** manage the permanent QR.

**Layout:** QR preview, the public ordering URL, slug display.

**Buttons:**
| Button | Action |
|--------|--------|
| `[Download QR]` | Download image (PNG/SVG) |
| `[Print QR]` | Print-friendly page |
| `[Copy URL]` | Copy public ordering URL |
| `[Share]` | Share sheet |
| `[Regenerate Image]` | New visual, **same URL** |

**Rules:** QR encodes the stable URL, not the menu. One permanent QR per vendor/location; regenerating the image does not change the public URL. Unlimited customers can scan the same QR.

---

## 10. Customer POS / Kiosk Launcher  (button → `/kiosk/:slug`)

**Purpose:** launch the customer ordering UI in full-screen touch mode on the vendor's own device.

**Buttons:**
| Button | Action |
|--------|--------|
| `[Open Customer POS]` | Open kiosk full-screen |
| `[Exit Kiosk]` | Return to dashboard (guarded, may require re-auth) |

**Rules:** no vendor credentials exposed in kiosk; same backend + order lifecycle as QR; auto-reset after each order.

---

## 11. Reports  (`/vendor/reports`)

**Purpose:** practical sales insight (not an enterprise ERP).

**Filters:** Today, Last 5 days, Last 7 days, Last 30 days, This month, Previous month, Custom range.

**Reports shown:** Revenue (+ period comparison), Orders (total/completed/cancelled/failed-payment), Items sold by item, Best sellers (by qty & revenue), Category sales, AOV, Peak hours, Payments (success/pending/failed/refunded), Source (QR vs Kiosk), Daily summary.

**Buttons:**
| Button | Action |
|--------|--------|
| Filter chips / date picker | Change reporting period |
| `[Export]` (CSV/Excel/PDF) | **Future** — show as disabled/"coming soon" at MVP |

**Rules (our stack):** live aggregation via Postgres views/RPC at MVP.

---

## 12. Business Settings  (`/vendor/settings`)

**Purpose:** core business configuration.

**Sections & controls:**
- **Business data:** name, description, logo, category.
- **Operating hours:** open/close times, manual override.
- **Accepting Orders:** ON/OFF toggle (blocks checkout with a clear message when OFF).

**Buttons:** `[Save]` per section; `[Accepting Orders ON/OFF]` toggle.

**Rules:** manual pause is distinct from scheduled closing.

---

## 13. Payment Settings  (`/vendor/settings/payment`)

**Purpose:** configure the gateway.

**Layout:** gateway connection status, configuration fields (keys stored securely, never in the browser bundle), tax configuration (optional).

**Buttons:** `[Connect Gateway]` / `[Update]`, `[Save]`.

**Rules:** gateway secrets live server-side (Supabase env / Edge Functions), never exposed to the client.

---

## 14. Location  (`/vendor/settings/location`)

**Purpose:** manage address + geolocation.

**Layout:** address fields, pincode, map/lat-long.

**Buttons:** `[Use my location]` (geolocation), `[Save]`.

**Rules:** one-time/explicit capture; no continuous tracking.

---

## 15. Profile / Team  (`/vendor/settings/profile`)

**Purpose:** owner profile now; team management later.

**Layout:** owner name, phone, logout.

**Buttons:** `[Save]`, `[Logout]`. (`[Invite Staff]` is future.)

---

## Realtime events the vendor UI reacts to

| Event | Effect on vendor UI |
|-------|---------------------|
| `OrderCreated` | New order appears in queue + badge/counter + optional sound |
| `OrderStatusChanged` | Sync status across any open vendor screens |

On reconnect, always re-fetch authoritative state from the database — realtime is transport, the DB is the source of truth.
