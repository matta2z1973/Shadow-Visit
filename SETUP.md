# Shadow Visit — Setup

Internal admissions shadow-visit matching & scheduling for Greenhill School.
Built on the same stack as the coverage-planner app.

## Prerequisites

- Node 20+ and npm
- A Supabase project (free tier is fine) — gives you Postgres + magic-link auth
- A Resend account (for magic-link email delivery + `.ics` invites)

## 1. Install

```bash
cd shadow-visit
npm install
```

## 2. Environment

Copy the example and fill in values:

```bash
cp .env.local.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project settings → API
- `DATABASE_URL` — Supabase → Database → Connection string (URI)
- `RESEND_API_KEY`, `EMAIL_FROM` — Resend
- `APP_URL` — `http://localhost:3000` for local dev

In **Supabase → Authentication → Email**: enable Email OTP, and (optionally)
point SMTP at Resend so magic-link codes send reliably.

## 3. Database

```bash
npm run db:push     # create tables from src/lib/db/schema.ts
npm run db:seed     # seed interests, US block grid, default settings
```

## 4. Make yourself an admin

Sign in once (creates your `profiles` row), then in Supabase SQL editor:

```sql
update profiles set role = 'admin' where email = 'you@greenhill.org';
```

## 5. Run

```bash
npm run dev         # http://localhost:3000
```

- Admins land on `/admin`; students land on `/me`.

## Verify the parsers

```bash
npm run test:parsers   # host-schedule CSV → fixtures/host-schedule-sample.csv
npx tsx scripts/test-form.ts "../Blake Kyles - Interview and Visit Form - 2026-2027.pdf"
```

## End-to-end flow (Phase 1)

1. `/admin/uploads` — upload host **CSVs** and prospective **Interview & Visit Form PDFs**.
2. Students sign in → `/me` → set gender + interests.
3. `/admin/faculty` — add admissions staff + faculty, map faculty to interests.
4. `/admin/match?date=…` — review engine rankings, override host, assign counselor,
   confirm one or all. Flags surface over-cap hosts, uncovered top interests, free periods.
5. Per confirmed match → `/admin/schedule/[id]` — printable day + **Download .ics**.
   `/admin/match/export?date=…` — FinalSite re-import CSV.

## What's built

- Magic-link auth; student portal; admin dashboard with flags.
- Interests admin (Academic / Non-academic).
- Host-schedule CSV upload + FinalSite form-PDF import (both parsers validated on real files).
- Faculty ↔ interest mapping; host-usage vs soft cap.
- Matching engine — hard grade/gender filters, interest-fit scoring, free-period rule,
  soft-cap load balancing; single + bulk confirm with override.
- Printable schedule, `.ics` download, FinalSite CSV export.

## Pending (later phases / inputs)

- **Course-catalog vector store + LLM interest→course fit** — Phase 2. Currently a
  keyword mapper in `src/lib/matching/course-map.ts` (swap point is isolated).
- **Emailing** the `.ics`/schedule via Resend — only download is wired today.
- **Shadow-date field** — confirm the exact PDF label with a shadow-visit submission.
- **Published Outlook free/busy feeds; Blackbaud SKY API; MS Graph; MS/LS divisions** — later.
