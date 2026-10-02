# Orderly — Bugs & Problems Checklist

> Full-project inspection of the Orderly codebase (React 18 + TypeScript + Vite + Supabase).
> Every item below is grounded in actual source. Line numbers are approximate (1-indexed).
> **Payment code is out of scope** — payment items are noted only where they interact with other fixes.
>
> **Status legend:** `[ ]` open · `[x]` fixed · `[~]` partially addressed
> **Severity:** 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## Summary counts

| Severity | Count |
|---|---|
| 🔴 Critical | 3 |
| 🟠 High | 6 |
| 🟡 Medium | 10 |
| 🟢 Low | 9 |

Top priorities: anon-readable `orders` RLS + guessable order-number tracking, hardcoded DB password, non-realtime customer menu, 200-order OrdersPage load.

---

## 1. Security

- [ ] 🔴 **Hardcoded DB password in `_dbprobe/probe.mjs`** (lines 3–4) and `_dbprobe/seed.mjs` / `_dbprobe/apply.mjs`. Live Postgres password + project ref in plaintext. Gitignored, but on disk and reused across scripts. **Action:** rotate the DB password + service key; move all `_dbprobe` secrets to env vars; confirm never committed (`git log -- _dbprobe`). **STILL OPEN.**
- [ ] 🔴 **Service secret key in `.env.local`** (`SUPABASE_SECRET_KEY=sb_secret_…`). Correctly not `VITE_`-prefixed (not bundled) and gitignored, but rotate if the folder was ever shared. **STILL OPEN.**
- [ ] 🔴 **Secrets exposed during this session.** Both the service key and DB password were read while debugging. Rotate both in the Supabase dashboard. **STILL OPEN.**
- [x] 🟠 **Anon could read the entire `orders` table.** FIXED: migration 0006 reworked — blanket `orders_anon_read_min using(true)` removed; orders/order_items/payments are owner-only. Customer flow routed through SECURITY DEFINER RPCs (`place_order_dev`, `get_order_tracking`, `get_order_confirmation`). **Verified live: anon reads now return 0 rows.**
- [x] 🟠 **Guessable order tracking by sequential number.** FIXED: tracking now uses the non-guessable `track_token` via RPC; `OrderTracker` prefers the token path. The number route still exists but no longer exposes data (orders table is owner-only; `getOrderByNumber` only works for the owner).
- [x] 🟡 **Image upload had no validation.** FIXED: `validateMenuImage` (type JPG/PNG/WebP/GIF + 5 MB cap), extension derived from verified MIME, `contentType` set; `ItemEditorPage` validates before upload.

## 2. React correctness

- [ ] 🟠 **Customer menu is not realtime.** `MenuPage.tsx` (~30–47): `getMenu` runs once with dep `[slug]`, no subscription to `items`/`categories`. A customer browsing never sees sold-out/price/new-item changes until reload (plan §6 requires live updates). `revalidateCart` only catches it at checkout. **Action:** subscribe to `items`/`categories` for the business and merge updates.
- [ ] 🟡 **Dashboard refetches on `orders.length`.** `DashboardPage.tsx` (~44–50) dep `[business, rangeIdx, orders.length]`. `.length` misses in-place status/payment updates and double-fires on inserts. **Action:** use a stable change signal or debounce.
- [ ] 🟡 **New-order chime can be missed on reconnect.** `useRealtimeOrders.ts` (~150–200): the chime fires only in the INSERT branch; an order first seen via the reconnect `refresh()` (missed INSERT) is added silently with no chime. **Action:** detect new ids in `refresh()` and chime for them too.
- [ ] 🟢 **`spokenRef` grows unbounded.** `OrdersPage.tsx` (~35) `useState(() => new Set())[0]` is never cleared; across a long shift it leaks memory slowly. **Action:** prune or reset on session change; prefer `useRef`.

## 3. Data / consistency

- [ ] 🟠 **UI/RPC assume later migrations are applied.** `OrdersPage` CompletedTable (~360) reads `cancelled_at`/`confirmed_at`; `OrderDrawer` (~68) reads `cancel_reason` (all from migration 0005). `cancelOrder` RPC hard-fails if 0005 isn't applied. `track_token` (0006) and `public_code` (0007) are handled defensively, but these aren't. **Action:** ensure migrations 0005–0007 are applied; guard the cancel path.
- [ ] 🟡 **Inconsistent "start" handling for legacy statuses.** `orderUi.vendorNextStatus` (~11–19): `NEW → PREPARING` but `ACCEPTED → COMPLETED`. A legacy ACCEPTED order completes in one click while NEW takes two. **Action:** map `ACCEPTED → PREPARING` for consistency, or document intent.
- [ ] 🟢 **Non-numeric tracking order param shows "Loading…" forever.** `TrackingPage.tsx` (~22): `Number(orderNo)` + `Number.isNaN` guard renders a loading state, not a "not found" error. **Action:** show an error/empty state.
- [ ] 🟢 **Fragile closure-in-memo.** `OrdersPage` `grouped`/`completedAll` useMemos close over `bySource` (which reads `sourceFilter`); correct today but brittle. **Action:** inline the source check or add to deps explicitly.

## 4. Vendor flow scalability / correctness

- [x] 🟠 **OrdersPage loaded 200 orders in one realtime query.** FIXED: live queue limited to 50 (active); completed history via `getCompletedOrders` (server-paginated, since/search/source). Items fetched for union of active + current completed page and merged, not refetched wholesale each tick.
- [x] 🟡 **Drag-reorder race / lost updates.** FIXED: `reorderItems`/`reorderCategories` write sequentially and throw on error (caller reverts); category `onReorder` guards the mapping (no non-null assertion, no dropped ids).
- [x] 🟡 **No session-expiry handling.** FIXED: `useSession` flags `orderly.sessionExpired` on sign-out/token loss; `LoginPage` shows "Your session has expired. Please sign in again."
- [ ] 🟢 **Hard delete vs deactivate.** `MenuManagementPage.onDeleteItem` (~60) hard-deletes via `deleteItem`. Snapshots in `order_items` preserve history and `item_id` is `on delete set null`, so it's safe-ish, but it's destructive behind a native `confirm()` (plan §40 prefers deactivate). **Action:** prefer soft-deactivate; keep delete as a clearly-confirmed secondary action.
- [ ] 🟢 **Category rename can be lost on reorder.** `MenuManagementPage` CategoriesTab (~180) uses uncontrolled `defaultValue` + onBlur; a reorder re-render can drop an edited-but-unblurred name. **Action:** make the input controlled.

## 5. Routing / auth

- [ ] 🟡 **Redundant overlapping auth/business fetches on first vendor load.** `RequireAuth` (`useSession`→`getSession`), `VendorBusinessProvider` (`getMyBusiness`→`getUser`), plus `LoginPage`/`OnboardingWizard` each call `getMyBusiness`/`getSession` on mount. Not broken, but extra round-trips and possible flashes. **Action:** centralize session/business bootstrap.
- [ ] 🟢 **Reset-password readiness race.** `ResetPasswordPage.tsx` (~24–30): if the recovery link is expired, user is stuck on the "open from email" message with no distinct error. **Action:** distinguish expired/invalid link.

## 6. Dead / unused code (plan §47)

- [x] 🟢 **`src/components/charts/BarChart.tsx`** — deleted (was never imported).
- [x] 🟢 **`src/components/Placeholder.tsx`** — deleted (was never imported).
- [ ] 🟢 **`_dbprobe/` scripts** — dev-only, contain secrets; keep gitignored or move out of the tree. **STILL OPEN** (also added `apicheck.mjs` for runtime checks).

## 7. Accessibility / UX

- [x] 🟡 **Raw backend error strings shown to users.** FIXED (mostly): new `lib/errors.ts friendlyError()` maps auth/DB/network errors; wired into `LoginPage`, `ResetPasswordPage`, `ItemEditorPage`, `OnboardingWizard`. A couple of minor spots may remain.
- [x] 🟡 **Native `confirm()` for destructive actions.** FIXED: new `components/ui/ConfirmDialog.tsx` (Escape/backdrop close) replaces `confirm()` for item/category delete in `MenuManagementPage`.
- [ ] 🟢 **No keyboard-accessible menu reorder.** `MenuManagementPage.DragRow` is mouse-only HTML5 DnD; handle `⠿` is `aria-hidden`. **Action:** add up/down buttons as a keyboard alternative.
- [ ] 🟢 **Labels not associated with inputs.** CheckoutModal (~131), ItemEditorPage, OnboardingWizard, Settings use styled `<label>`/spans not tied to inputs via `htmlFor`/`id`. Screen readers won't link them. **Action:** add `htmlFor`/`id` pairs.
- [ ] 🟢 **Large JS chunk warning.** Main bundle ~504 kB (>500 kB warning). **Action (plan §38):** code-split / manualChunks if it grows.

---

## ✅ Verified correct (do NOT re-report)

- Realtime channel cleanup — `useRealtimeOrders`, `OrderTracker`, `TokenTrackingPage` all remove channels/intervals on unmount.
- `ConnectionBanner` reconnect UX — tracks disconnect, shows reconnecting/connected, auto-hides, cleans its timeout.
- Kiosk idle-reset — `MenuPage.useIdleReset` clears all listeners/timers; `sessionKey` remount fully clears the cart.
- Server-side price recompute — `placeOrder` + create-payment Edge Function re-read DB prices; cart totals never trusted for money; `revalidateCart` is a pre-check only.
- Duplicate-submit guards — `CheckoutModal.inFlight` ref + `OrdersPage.busyId`.
- Status/payment pills cover all 6 enum values each (`StatusPill`, `orderUi.PaymentDot`).
- Secure token tracking RPCs (0006/0007) are SECURITY DEFINER, return only safe fields, no id exposure.
- `getBusinessBySlug` / `placeOrder` fall back gracefully when `public_code`/`track_token` columns are absent.
- Edge Functions use the service role server-side only (not bundled); RLS tightening doesn't affect them.
- `.gitignore` excludes `.env*.local` and `_dbprobe/`.

---

## Already fixed in this work session

- [x] Unified order state machine (removed conflicting 4-step helper; `orderUi` is authoritative).
- [x] Order detail page uses the unified machine + shared `OrderTimeline`.
- [x] Customer tracking reworked (3-stage, prep estimate, collect message, share/order-again/back).
- [x] Secure tracking token (`/track/:token`) + hardened RLS for `payments`/`order_items` (migration 0006).
- [x] Shared UI state components (`LoadingState`/`EmptyState`/`ErrorState`/`RetryButton`).
- [x] Vendor sign-up + forgot/reset-password flow + shared validation (`lib/validation.ts`).
- [x] Real landing page at `/`; HealthCheck moved to `/health`; removed hardcoded `mahesh-paratha` links.
- [x] Per-vendor dashboard launchers (Open Customer POS / View Menu / View QR / Manage Orders) using the vendor's own slug.
- [x] Unguessable public URL via `public_code` (`slug-code`) with migration 0007 + resilient lookup.
- [x] Onboarding no longer gets stuck (pushes new business into shared context); redesigned single-page with Back-to-login; `createBusiness` idempotent + slug-collision-safe.
- [x] OrdersPage functional sort toggle + completed date filter + daily total; menu/category drag reorder; item prep-time field; Reports CSV export.
