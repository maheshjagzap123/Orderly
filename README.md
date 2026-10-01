# Orderly

Street-food self-service ordering + vendor POS. **React (Vite + TypeScript)** frontend, **Supabase** backend (Postgres, Auth, Realtime, Storage).

Product docs live in [`docs/`](./docs): overview, customer pages, vendor pages, UI reference, and Supabase setup.

## Prerequisites
- Node 18+ (built with Node 24)
- A Supabase project (URL + publishable/anon key in `.env.local`)

## Setup
```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev                  # http://localhost:5173
```

The dev landing page (`/`) runs a Supabase connectivity health check.

## Scripts
- `npm run dev` — start the Vite dev server
- `npm run build` — type-check + production build
- `npm run preview` — preview the production build
- `npm run lint` — type-check only

## Environment
`.env.local` (gitignored):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — public, used by the browser (RLS protects data).
- `SUPABASE_SECRET_KEY` — server-side only (Edge Functions / admin scripts). Never prefixed with `VITE_`.

## Database
Migrations are in [`supabase/migrations/`](./supabase/migrations):
- `0001_schema.sql` — tables, enums, order-number function, triggers
- `0002_rls_realtime.sql` — RLS policies + realtime publication
- `0003_storage.sql` — storage policies for the `menu-images` bucket
- `0004_profiles.sql` — `profiles` table (1 row per auth user), auto-created on signup, self-only RLS

These have already been applied to the live project. To re-apply or run on a fresh project, use the Supabase **SQL Editor** (paste each file) or the Supabase CLI.

## Routes
- Public customer: `/order/:slug` (menu, item, cart, checkout, pay, confirmation, track)
- Kiosk: `/kiosk/:slug`
- Vendor (auth): `/vendor/login`, `/vendor/onboarding`, `/vendor`, `/vendor/orders`, `/vendor/menu`, `/vendor/qr`, `/vendor/reports`, `/vendor/settings`

Screens are currently scaffolded placeholders; they will be implemented against the specs in `docs/`.

## Security notes
- Rotate the Supabase DB password and secret key before going to production (they were used during initial setup).
- Payment gateway (Razorpay) and its webhook Edge Function are a later phase.
