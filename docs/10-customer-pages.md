# Customer & Kiosk Pages

The customer experience is **mobile-first** and used in two modes with the **same screens**:
- **QR mode** — opened by scanning the permanent QR, URL `/order/:slug`
- **Kiosk mode** — same UI full-screen on the vendor's tablet, URL `/kiosk/:slug`, with auto-reset after each order

Design direction: food-first layout, strong imagery, simple category navigation, **red primary action buttons**, a **persistent cart** always within reach. See `30-ui-reference.md` for the exact look derived from the provided mockups (red primary / green positive, circular +/- steppers, status pill colors, Rupee amounts).

**Responsive note:** on desktop/kiosk the cart sits as a **persistent right-side panel** next to the menu (as in the customer mockup). On phones it collapses to a **sticky bottom bar / drawer**. Same screen, two breakpoints.

Legend: `[Button]` = tappable action. "Primary" = the big red button. "Secondary" = outlined/ghost.

---

## Customer flow at a glance

```
Public Menu --> (tap item) Item --> Cart --> Checkout --> Payment Pending
   |                                                           |
   |                                              success ------+------ failure
   |                                                 |                    |
   v                                                 v                    v
Closed/Paused (if store off)                   Confirmation --> Tracking   Payment Failed --> (retry)
```

---

## 1. Public Menu  (`/order/:slug`, `/kiosk/:slug`)

**Purpose:** the landing screen. Show the stall, its status, and the full menu so the customer can start adding food.

**Layout (matches the customer mockup):**
- **Hero header** (food-photo background, dark overlay) — round logo, business name, tagline (e.g. "Fresh • Tasty • Desi Flavour"), meta row: 📍 location, ⭐ rating "4.6 (320+)" *(display-only/optional at MVP)*, 🕐 `Open Now` + today's hours. Top-right **"Scan to Order" QR chip** ("Order from your phone").
- **Status strip / banner** — if paused: "Not accepting orders right now"; if closed: `Closed` + hours.
- **Category tab bar** — **icons + labels**, active tab underlined red: `All Items` + each vendor category (e.g. Paratha, Combo, Beverages, Sides).
- **Menu grid** — "Our Menu" heading; item cards (3-across on desktop): image, optional badge top-right (green `Popular` / red `Bestseller` / `New`), name, short description, red price, circular `–  0  +` stepper (red +/-).
  - Sold-out items show a `Sold Out` label and disabled add.
- **Cart** — **desktop/kiosk:** persistent right-side panel (see Cart spec #3 for its contents). **Phone:** sticky bottom bar "X items • ₹Total → `[View Cart]`".

**Buttons & placement:**
| Button | Where | Action |
|--------|-------|--------|
| Category tab | Category bar (top) | Filter menu to that category |
| `[+]` / `[–]` | Circular stepper on each card | Adjust quantity before adding |
| Scan to Order chip | Top-right of hero | Show the QR (useful on kiosk/desktop) |
| `[Proceed to Checkout →]` | Side cart panel (desktop) | Go to Checkout |
| `[View Cart]` | Sticky bar (phone) | Open cart drawer / Cart page |
| (tap card body) | Card | Open Item detail/modal |

**Rules / edge cases:**
- Validate vendor + location is active on load; if not, redirect to **Closed/Paused**.
- If store is paused but vendor allows menu viewing, show menu but disable `Add` / `View Cart`.
- Realtime: if an item goes sold-out or store status changes while viewing, update live.

---

## 2. Item Detail  (modal or `/order/:slug/item/:id`)

**Purpose:** larger view of a single item before adding.

**Layout:** large image, name, full description, price, quantity stepper.

**Buttons:**
| Button | Where | Action |
|--------|-------|--------|
| `[– ] qty [ +]` | Below price | Set quantity |
| `[Add to Cart – ₹X]` | Bottom, primary | Add and close modal |
| `[X]` / back | Top-left/right | Close without adding |

**Rules:** prevent zero/negative quantity; disabled entirely if sold out.

---

## 3. Cart  (`/order/:slug/cart`)

**Purpose:** review and adjust the order before paying.

On desktop/kiosk this is the **persistent right-side panel** from the mockup; on phone it's a drawer/page. Contents are identical.

**Layout (matches the mockup cart panel):**
- Header: 🛒 "Your Cart (N)" + `[Clear All]` (red link).
- Line items: thumbnail, name, unit price, `–  qty  +` stepper (red), 🗑 delete.
- **Bill Summary:** Subtotal, **Taxes (5%)** (if configured), **Total** (bold, e.g. `₹262.50`).
- Red full-width `[Proceed to Checkout →]`.
- **"🛡 Secure Payment"** line + payment-method logos: GPay, PhonePe, Paytm, Cards, UPI.
- **Estimated Preparation Time** card (red clock): e.g. "10 – 15 minutes".
- Empty state: "Your cart is empty" + `[Back to Menu]`.

**Buttons:**
| Button | Where | Action |
|--------|-------|--------|
| `[+]` / `[–]` | Per line stepper | Change quantity |
| 🗑 delete | Per line | Remove line item |
| `[Clear All]` | Panel header (red link) | Empty the cart (confirm) |
| `[Back to Menu]` | Secondary (phone) | Return to menu |
| `[Proceed to Checkout →]` | Primary, full-width | Go to Checkout |

**Rules:**
- Revalidate availability + price with the server before moving on; if something changed, show a notice and update totals.
- The displayed Subtotal/Taxes/Total are for display only — the server recalculates the final amount at payment.
- Taxes line only shows when the vendor has tax configured; otherwise omit it.
- Payment-method logos reflect the chosen gateway (ties to the Razorpay/UPI decision in `90-supabase-setup.md`).

---

## 4. Checkout  (`/order/:slug/checkout`)

**Purpose:** final summary + start payment. Deliberately minimal — nothing here should block the customer.

**Layout:**
- **Order summary** (items, quantities, total — read-only).
- **Optional name field** — "Name (optional, helps us call you)".
- Order source is captured by the system (`QR` or `Kiosk`), not shown as input.

**Buttons:**
| Button | Where | Action |
|--------|-------|--------|
| `[Pay ₹Total]` | Primary, bottom | Create server-side payment intent, launch gateway |
| `[Back to Cart]` | Secondary | Return to cart |

**Rules:**
- Name is optional and must never block checkout.
- On `[Pay]`, the server recalculates the amount — the browser total is display-only.
- If store turned off / item sold out at this moment → block with a clear message and send back to menu/cart.

---

## 5. Payment Pending  (`/order/:slug/pay`)

**Purpose:** holding state while the gateway/webhook resolves.

**Layout:** spinner + "Processing your payment…", order summary, reassurance text ("Don't close this screen").

**Buttons:** none primary. Possibly `[Having trouble? Refresh status]` secondary.

**Rules:**
- Do **not** treat the browser redirect as success. Wait for the verified webhook to flip the order to confirmed.
- Poll or subscribe to the order's payment status; on `SUCCESS` → Confirmation, on `FAILED/CANCELLED` → Payment Failed.
- Handle "webhook arrives before browser returns" and "customer closes browser" gracefully (order still confirms server-side).

---

## 6. Payment Failed  (`/order/:slug/pay` failure state)

**Purpose:** recover from a failed/cancelled payment.

**Layout:** clear failure message, order summary preserved.

**Buttons:**
| Button | Where | Action |
|--------|-------|--------|
| `[Retry Payment]` | Primary | Re-initiate payment for the same cart |
| `[Back to Cart]` | Secondary | Edit the order |

**Rules:** retrying must not create a duplicate confirmed order; reuse/replace the pending intent.

---

## 7. Confirmation  (`/order/:slug/confirmation/:orderNo`)

**Purpose:** confirm success and surface the order number.

**Layout:**
- Big **order number** (e.g. `#103`).
- Items, quantities, total.
- Payment status = Paid.
- Current order status (starts at `Order Received`).
- Estimated prep time if configured.

**Buttons:**
| Button | Where | Action |
|--------|-------|--------|
| `[Track Order]` | Primary | Go to Tracking |
| `[Order Again]` | Secondary (QR mode) | Back to menu with empty cart |

**Rules:** refreshing this page must keep showing the same confirmed order (idempotent).

---

## 8. Tracking  (`/order/:slug/track/:orderNo`)

**Purpose:** live status until the food is collected.

**Layout:**
- **Status timeline:** `Order Received → Accepted → Preparing → Ready → Completed`.
- Items + total.
- Collection instruction shown when status = `Ready` ("Please collect at the counter").

**Buttons:**
| Button | Where | Action |
|--------|-------|--------|
| `[Refresh]` | Secondary (optional) | Re-fetch authoritative status |
| `[Order Again]` | Secondary | New order |

**Rules:** subscribe to realtime `OrderStatusChanged`; on reconnect, re-fetch authoritative status from the DB.

---

## 9. Closed / Paused  (state shown on `/order/:slug` when store is off)

**Purpose:** explain why ordering is unavailable.

**Layout:** business header + large status message: `Closed` with hours, or `Not accepting orders right now`.

**Buttons:**
| Button | Where | Action |
|--------|-------|--------|
| `[View Menu]` | Secondary (optional) | Browse-only, Add disabled |

**Rules:** no checkout possible; menu viewing optional per vendor preference.

---

## Kiosk-specific behavior (same screens, mode differences)

- Launched full-screen from the vendor dashboard at `/kiosk/:slug`.
- **Large touch targets**, no vendor credentials exposed anywhere in this mode.
- **Auto-clear** abandoned cart after a configurable idle timeout.
- After a successful or cancelled order, **auto-reset** to a clean menu for the next customer.
- Prevent accidental navigation into the vendor area (locked chrome / guarded routes).
- Uses the exact same payment + order lifecycle as QR mode.
