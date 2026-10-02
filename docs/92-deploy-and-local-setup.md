# Deploy & Local Setup

How to run Orderly on a fresh machine and deploy it to Cloudflare Pages.

> Secrets are never committed. `.env.local` and the `_dbprobe/` helper folder are
> gitignored on purpose. After cloning, you recreate `.env.local` yourself.

---

## 1. Run locally on a new system

```bash
git clone <repo-url>
cd Orderly
npm install
cp .env.example .env.local   # then fill in real values (see below)
npm run dev
```

### `.env.local` values

| Variable | Sensitivity | Used by |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Public | React app (browser) |
| `VITE_SUPABASE_ANON_KEY` | Public (RLS protects data) | React app (browser) |
| `SUPABASE_SECRET_KEY` | **SECRET — never ships to browser** | Admin/DB scripts in `_dbprobe/` only |

Get the first two from Supabase → Project Settings → API. The app throws
"Missing Supabase env vars" until `.env.local` exists.

The app talks to the **hosted** Supabase project, so once env vars are set you see
the same data (vendors, items, orders) on any machine.

---

## 2. Database schema (migrations)

The full schema lives in `supabase/migrations/` (`0001`–`0009`) and **is** committed.
Apply it to a Supabase project either way:

- **SQL editor:** paste each migration in order, or
- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`.

> The Supabase REST API (service key) **cannot** run schema changes (DDL:
> `ALTER`/`CREATE`). Schema always goes through the SQL editor or the CLI.
> Data operations (INSERT/UPDATE/DELETE/SELECT) can use the service key — see below.

---

## 3. Admin / data operations (`_dbprobe/`)

The `_dbprobe/` folder is **gitignored** so admin scripts and the secret key never
enter the repo. Recreate `_dbprobe/db.mjs` on each machine where you need it (copy
the file over manually — do not commit it). It reads `SUPABASE_SECRET_KEY` from
`.env.local` and provides a reusable admin client.

```bash
node _dbprobe/db.mjs list-businesses     # list vendors + order counters
node _dbprobe/db.mjs reset-order-seq     # reset counters for vendors with no numbered orders
```

For ad-hoc work, import `{ admin }` from `_dbprobe/db.mjs` in your own throwaway script.

This covers data-only tasks (seeding a vendor, inserting menu items, resetting
counters). It cannot run migrations.

---

## 4. Order numbering

Order numbers start at **#1 per vendor**. Mechanism:

- `businesses.order_seq` defaults to `0`.
- `assign_order_number()` increments-then-returns, so the first order is `1`.
- Migration `0009_order_seq_start_from_zero.sql` sets this default and safely
  resets counters only for vendors that have no numbered orders yet (vendors
  already mid-sequence keep their numbers so they stay unique).

---

## 5. Deploy to Cloudflare Pages

Connect the GitHub repo in the Cloudflare Pages dashboard and use:

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 18 or 20 (`NODE_VERSION` env if needed) |

### Environment variables (Pages → Settings → Environment variables)

Set for **Production** and **Preview**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Do NOT** add `SUPABASE_SECRET_KEY` to Cloudflare — it is server/admin only and
must never be in the browser bundle.

### SPA routing

`public/_redirects` contains:

```
/*    /index.html   200
```

This is required so client-side routes (`/order/:slug`, `/kiosk/:slug`,
`/vendor/*`, `/track/:token`) don't 404 on direct load or refresh. Vite copies
`public/_redirects` into `dist/` automatically.

### After first deploy

In Supabase → Authentication → URL Configuration, add your Pages URL
(`https://<project>.pages.dev` and any custom domain) to **Site URL** and
**Redirect URLs**, so vendor login and password-reset redirects work from the
deployed domain.
