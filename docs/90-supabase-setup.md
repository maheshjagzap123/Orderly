# Supabase Setup — What I Need From You

This is the exact list of things to hand over so I can wire the backend. Grouped by **when** I need it. For each item I note **where it lives** and **how sensitive** it is.

> Security note: anything marked **SECRET** must never go into the React app or into git. I'll put secrets only in Supabase project settings / Edge Function environment variables. The React app only ever uses the **anon** public key.

---

## A. To start right now (Phase 1 — core app)

From **Supabase Dashboard → Project Settings → API** and **General**:

| # | What | Where to find it | Sensitivity | Used for |
|---|------|------------------|-------------|----------|
| 1 | **Project URL** (e.g. `https://xxxx.supabase.co`) | Settings → API → Project URL | Public | React client + Edge Functions |
| 2 | **anon public key** | Settings → API → Project API keys → `anon` `public` | Public (safe in frontend) | React client auth + RLS-protected reads/writes |
| 3 | **Project Ref / Project ID** | Settings → General → Reference ID | Low | CLI linking, Edge Function deploys |

That's genuinely all I need for the frontend + database to come alive. With these three I can:
- initialize the React Supabase client,
- create the database schema (tables, RLS policies),
- set up auth, realtime, and the storage bucket.

---

## B. For admin / schema automation (recommended, optional)

Only needed if you want me to run migrations and deploy Edge Functions from the CLI rather than you pasting SQL in the dashboard.

| # | What | Where to find it | Sensitivity | Used for |
|---|------|------------------|-------------|----------|
| 4 | **service_role key** | Settings → API → Project API keys → `service_role` | **SECRET** | Server-side only — admin scripts, seeding, Edge Functions that bypass RLS |
| 5 | **Personal Access Token** | Account → Access Tokens → Generate new token | **SECRET** | Supabase CLI (`supabase login`) to push migrations/functions |
| 6 | **DB password** | Set during project creation (Settings → Database) | **SECRET** | Direct `psql` / migration connection string |

If you'd rather not share the service_role key or access token, that's fine — I'll give you the SQL and CLI commands to run yourself, and you only share the Phase A values.

---

## C. For payments (Phase 1 payment step — can come a bit later)

We need a **UPI/India-capable** gateway. My default recommendation is **Razorpay** (good webhooks, UPI support). Tell me which you prefer and I'll adapt.

If Razorpay:

| # | What | Where to find it | Sensitivity | Used for |
|---|------|------------------|-------------|----------|
| 7 | **Key ID** (`rzp_test_...` / `rzp_live_...`) | Razorpay Dashboard → Account & Settings → API Keys | Public-ish (frontend uses Key ID) | Launching checkout |
| 8 | **Key Secret** | Shown once when you generate the key | **SECRET** | Edge Function: create order, verify payment |
| 9 | **Webhook Secret** | Razorpay → Settings → Webhooks (you set this when adding the webhook) | **SECRET** | Edge Function: verify webhook signature |

Start with **test mode** keys. We go to live keys only after the flow is verified.

---

## D. Decisions I need you to confirm (no credentials, just answers)

These were "open decisions" in the PRD. I'll use the bracketed default if you don't have a preference.

1. **Vendor login method** — phone OTP needs an SMS provider configured in Supabase (Twilio/MessageBird). For dev I can start with **[email magic link]** (zero extra setup) and switch to phone OTP once you add an SMS provider. OK?
2. **Payment gateway** — **[Razorpay]** or something else?
3. **Order numbering** — **[continuous per stall]** or reset daily?
4. **Public slug** — auto-generate from business name, **[editable once]**?
5. **Tax** — leave **[off]** at MVP, add per-vendor tax later?
6. **Hosting for the React app** — **[Vercel]** / Netlify / other? (Supabase hosts the backend; the frontend is deployed separately.)

---

## E. How to send me the secrets safely

- **Do NOT paste SECRET values directly in chat if you can avoid it.**
- Preferred: create a local file `.env.local` in the project (I'll add it to `.gitignore`) and fill in the values. Format I'll use:

```bash
# Public — safe in frontend build
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Public-ish — payment key id for checkout
VITE_RAZORPAY_KEY_ID=

# SECRET — server-side only (Supabase Edge Function env, NOT the frontend)
SUPABASE_SERVICE_ROLE_KEY=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

- The three **Phase A** values are enough to begin. You can send the payment + secret values when we reach that step.

---

## F. What I'll set up once I have Phase A

1. Initialize the React project (Vite + React) and the Supabase client.
2. Create the database schema: `vendors`, `businesses`, `categories`, `items`, `orders`, `order_items`, `payments`.
3. Add **RLS policies**: public read of active menus; vendor-only access to their own rows.
4. Enable **Realtime** on `orders` for the live queue.
5. Create a **Storage bucket** for logos/item images (public read, authenticated write).
6. Scaffold the routes and screens from `10-customer-pages.md` and `20-vendor-pages.md`.
7. Add Edge Functions for payment intent + webhook verification (when Phase C arrives).

Just drop the **Project URL**, **anon key**, and **Project Ref** and I'll get moving.
