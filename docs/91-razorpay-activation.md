# Activating Razorpay Payments

Payments are built and ready. In dev (no keys) orders auto-confirm so the whole flow works. To take **real payments**, do the steps below — no code changes needed.

## What you provide
From the Razorpay dashboard (start in **Test mode**):
- **Key ID** (`rzp_test_...`)
- **Key Secret** (shown once when you generate the key)
- **Webhook Secret** (you choose it when adding the webhook)

## 1. Set the frontend key
Add to `.env.local` (this flips the app from dev auto-confirm to real Razorpay):
```
VITE_RAZORPAY_KEY_ID=rzp_test_xxxxx
```

## 2. Set the Edge Function secrets
These stay server-side only (never in the browser):
```
supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxxxx
supabase secrets set RAZORPAY_KEY_SECRET=xxxxx
supabase secrets set RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```
(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

## 3. Deploy the two functions
```
supabase functions deploy create-payment --no-verify-jwt
supabase functions deploy razorpay-webhook --no-verify-jwt
```

## 4. Register the webhook in Razorpay
- URL: `https://<project-ref>.functions.supabase.co/razorpay-webhook`
  (your ref is `vraxwwylcduogizynaws`)
- Secret: the same `RAZORPAY_WEBHOOK_SECRET` from step 2
- Events: `payment.captured`, `payment.failed`, `order.paid`

## How it works
1. Customer taps **Pay** → `create-payment` recomputes the amount from DB prices and creates a Razorpay order (order is `PENDING`, not confirmed).
2. Razorpay Checkout opens in the browser.
3. On success Razorpay calls `razorpay-webhook`, which **verifies the signature**, is **idempotent** (duplicate webhooks ignored), marks the payment `SUCCESS`, and calls `assign_order_number` to confirm the order + mint its number.
4. The client polls the order and shows the confirmation + live tracker.

Security held throughout: the browser never sets the price, the browser redirect alone never confirms an order, and only a signature-verified webhook can mark payment success.

## Going live
Swap test keys for live keys (`rzp_live_...`), update the three secrets + `VITE_RAZORPAY_KEY_ID`, redeploy, and update the webhook to the live secret.
