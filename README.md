# Car Shield Protection — Shop Management

Bilingual (Arabic / English) management system for a car protection shop: paint protection film, ceramic coating, window film and detailing.

## Features

- **Dashboard** — jobs in progress, today's appointments, money collected this month, outstanding balance, warranties expiring in 30 days.
- **Customers & vehicles** — search by name, phone or plate; full job history per customer.
- **Services catalog** — prices in KWD (3 decimals) and warranty length per service, with Arabic and English names.
- **Jobs (work orders)** — Scheduled → In progress → Quality check → Ready for pickup → Delivered (or Cancelled), with technician assignment, appointment time, discount and notes. Service names and prices are snapshotted on the job.
- **Invoices & payments** — one invoice per job, printable; partial payments by cash, KNET, card or transfer; overpayment is blocked.
- **Inventory** — materials with units (piece, roll, meter, m², ml, liter…), stock on hand, low-stock alert level and unit cost. Each service lists the materials it consumes; stock is deducted when a job starts, adjusted if services are added or removed mid-job, and returned if a started job is cancelled. Every change (job use, receipt, count correction) is logged per item.
- **Warranties** — issued automatically when a car is delivered, one per covered service (e.g. `CSP-2026-00012-1`); search by code, plate or phone.
- **Staff** — admin, front desk and technician roles; only admins manage staff and services.
- **Arabic + English** — locale in the URL (`/ar/...`, `/en/...`), full RTL layout, Latin digits in both languages so plates, phones and amounts read the same.

## Stack

- Next.js 16 (App Router, Cache Components, Server Actions, `proxy.ts`)
- Drizzle ORM on Neon Postgres (`@neondatabase/serverless`); PGlite for local development
- Tailwind CSS 4
- Signed-cookie sessions (`jose`) with bcrypt passwords

## Local development

```bash
npm install
cp .env.example .env      # then set SESSION_SECRET
npm run db:migrate
npm run db:seed           # creates the first admin + starter services
npm run dev
```

Open http://localhost:3000 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`. Change that password by adding a new admin and deactivating the seed account.

With `DATABASE_URL=pglite://./.pglite` no database server is needed; data is stored in the `.pglite/` folder.

## Deploying to Vercel + Neon

1. Create a Neon project and copy its connection string.
2. Import this repository into Vercel and set the environment variables `DATABASE_URL`, `SESSION_SECRET` (and optionally `ADMIN_EMAIL`, `ADMIN_PASSWORD`).
3. Run the migrations and seed once against Neon from your machine:
   ```bash
   DATABASE_URL="postgresql://…" npm run db:migrate
   DATABASE_URL="postgresql://…" ADMIN_PASSWORD="…" npm run db:seed
   ```
4. Deploy.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | TypeScript check |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | First admin user and starter services (safe to re-run) |

## Project layout

```
src/
  app/[lang]/            Root layout per locale, login, not-found
  app/[lang]/(app)/      Signed-in pages: dashboard, jobs, customers, invoices, warranties, services, users
  components/            UI pieces (forms, nav, badges, logo)
  db/                    Drizzle schema and client
  i18n/                  en.ts / ar.ts dictionaries and formatting (KWD, dates)
  lib/actions/           Server Actions (each re-checks the session)
  lib/auth.ts, session.ts
  proxy.ts               Locale prefix + signed-out redirect
drizzle/                 SQL migrations
scripts/db.ts            migrate / seed
```

Money is stored as integer fils (1 KWD = 1000 fils). Times are shown in Kuwait time.
