# Deploying Buildora

The app is production-ready for **Vercel** with a **Neon Postgres** database.
A Neon database has already been provisioned and seeded for you.

## 1. Database (already done)

A Neon project named `construction-scheduler` exists with the schema pushed and
the "Meridian Heights" demo project seeded. You only need the two connection
strings below as environment variables.

> Treat these as secrets. They are not committed (`.env` is gitignored).

| Variable | Value (Neon) |
|---|---|
| `DATABASE_URL` | pooled URL — `...-pooler...neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | direct URL — `...neon.tech/neondb?sslmode=require` (no `-pooler`) |
| `NEXT_PUBLIC_DISABLE_AUTH` | `true` (browsable demo) |

The exact values are in your local `.env`. You can also copy them any time from
the [Neon console](https://console.neon.tech) → project `construction-scheduler`.

## 2. Push the repo to GitHub (optional but recommended)

```bash
# from the project root
gh repo create construction-scheduler --private --source=. --push   # if you have gh
# — or — add a remote manually and push:
git remote add origin https://github.com/<you>/construction-scheduler.git
git push -u origin main
```

## 3. Deploy to Vercel

### Option A — Vercel dashboard (easiest)
1. Go to https://vercel.com/new and import the repo.
2. Framework preset: **Next.js** (auto-detected).
3. Add Environment Variables (Production + Preview):
   - `DATABASE_URL`  → the pooled Neon URL
   - `DIRECT_URL`    → the direct Neon URL
   - `NEXT_PUBLIC_DISABLE_AUTH` → `true`
4. Deploy. The build runs `prisma generate && next build` automatically.

### Option B — Vercel CLI
```bash
npm i -g vercel
vercel link
vercel env add DATABASE_URL production
vercel env add DIRECT_URL production
vercel env add NEXT_PUBLIC_DISABLE_AUTH production   # value: true
vercel --prod
```

## 4. Enabling real auth (optional)

To require sign-in on `/app/*`:
1. Create a Supabase project, then set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. Set `NEXT_PUBLIC_DISABLE_AUTH=false`.
The included middleware (`src/middleware.ts`) will then protect app routes.

## 5. Schema changes after deploy

Runtime never mutates the schema. To apply schema changes:
```bash
# locally, against DIRECT_URL
npm run prisma:push        # or: npx prisma migrate deploy for migrations
```

## Notes
- `DATABASE_URL` uses the Neon **pooled** endpoint with `pgbouncer=true` so it
  behaves well on Vercel's serverless functions.
- The Prisma client is a singleton (`src/lib/prisma.ts`) to avoid exhausting
  connections across hot reloads / lambda invocations.
