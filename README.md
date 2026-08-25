# Shadow Visit Platform — Project Status

> **Purpose of this file**: a living summary of this project and the decisions
> made about it, kept up to date so a new conversation/context window can pick
> up where the last one left off without re-deriving everything from scratch.
> Update this whenever a key setup fact, decision, or piece of completed work
> changes — don't let it go stale.

Last updated: 2026-08-25

## What this is

Internal admissions shadow-visit matching & scheduling app for Greenhill
School. Next.js 16 + Supabase (Postgres + magic-link auth) + Drizzle ORM.
Built on the same stack as the school's coverage-planner app.

- **Origin repo**: https://github.com/matta2z1973/Shadow-Visit (cloned in, not
  originally authored in this working directory)
- **Local path**: `Shadow Visit Platform/` under this Admissions project
  directory
- **Full original setup doc**: [SETUP.md](./SETUP.md) — still accurate for
  the app's intended features and end-to-end flow; this README instead
  covers *this specific local environment's* state and *what's changed since
  clone*.

## Current status (as of last update)

- Repo cloned, `npm install` done, TypeScript compiles clean (`npm run
  typecheck`).
- Local dev server runs on **port 3001** (not the Next default 3000):
  ```
  npm run dev -- -p 3001
  ```
  Currently running as of this update, verified working at
  http://localhost:3001.
- `.env.local` is filled in with **real, working credentials** for a live
  Supabase project (git-ignored — never committed, see Secrets section
  below). The app is fully functional locally: auth, DB reads/writes, the
  new admin/student view toggle all confirmed working.
- One real user account exists and is provisioned as admin:
  `abbondanziom@greenhill.org`.
- All local work through 2026-08-25 is **committed and pushed** to
  `origin/main` (commit `143a566`) — view-as-student toggle, bulk FinalSite
  import, and the Outlook-synced host schedules. Working tree is clean
  except the three untracked real-data sample files (see Secrets section).
- **Deployed to production** (2026-08-25): https://shadow-visit-platform.vercel.app
  — see the Deployment section below.

## Deployment

Live at **https://shadow-visit-platform.vercel.app** (Vercel project
`matts-projects-c8866403/shadow-visit-platform`, account `mabbondanzio-1166`,
created 2026-08-25 — first deploy ever for this repo, via `vercel link` +
`vercel deploy --prod` using the account's `VERCEL_TOKEN`).

- **`vercel link` auto-connected the GitHub repo** — Vercel's Git integration
  is now active, meaning **every future `git push` to `origin/main` will
  trigger its own production deployment automatically**, independent of any
  manual `vercel deploy`. This wasn't true before today. Worth remembering
  before casually pushing — "just a push" now also means "also goes live."
- Production env vars are set directly on Vercel (`vercel env ls production`
  to check), copied from `.env.local` at deploy time — not derived from
  anything in git. If they ever need updating, use `vercel env add <NAME>
  production --value "..." --force` (add `--no-sensitive` for the two
  `NEXT_PUBLIC_*` ones — they're meant to be public/client-visible, and
  Vercel rejects `NEXT_PUBLIC_*` vars set to secret visibility on
  Production/Preview).
- `DATABASE_URL` uses the same Supabase IPv4 pooler string as local dev —
  untested whether Vercel's serverless functions would have reached the
  direct hostname fine on their own (they very well might, unlike this local
  network), but no reason to find out since the pooler string already works.
- `.env.local` gained a `VERCEL_OIDC_TOKEN` line from `vercel link` — a
  Vercel-issued local-dev token, harmless, still git-ignored like everything
  else in that file.
- This deploy reaches the **same live Supabase project** used for local dev
  — there's only one environment, not separate prod/dev databases. Real
  student data flows through both equally; there's no staging DB to test
  against instead.

## Local environment quirks (hard-won, don't re-debug these)

- **`DATABASE_URL` is a hard requirement for every page**, not just for
  `db:push`/`db:seed` as `SETUP.md` implies. `src/lib/db/index.ts` throws at
  module-eval time if it's unset, and it's imported transitively from the
  root layout (`layout.tsx` → `site-nav.tsx` → `auth.ts` → `db`). Every page
  500s without it.
- **The direct Supabase DB hostname doesn't resolve on this network.**
  `db.<project-ref>.supabase.co` returns `getaddrinfo ENOTFOUND` — no
  reachable IPv4 or IPv6 route. Must use the **IPv4 transaction pooler**
  instead: in Supabase's "Connect" dialog → Transaction pooler tab, toggle
  "Use IPv4 connection" to get a working connection string. That string uses
  a different host (`aws-<n>-<region>.pooler.supabase.com`) and a different
  username format (`postgres.<project-ref>`, not plain `postgres`).
- **Supabase project ref**: `lqzjktqpbwrcpgxdovpy` (region `us-west-2`).
- **Zod env validation treats an empty-string env var as present-but-invalid**,
  not absent (`src/lib/env.ts`). Optional vars (`SUPABASE_SERVICE_ROLE_KEY`,
  `DATABASE_URL` when unset, etc.) must be omitted or commented out of
  `.env.local` entirely — a blank `KEY=` line still fails validation.
- A Postgres trigger (`drizzle/bootstrap.sql`, applied via `npm run
  db:bootstrap`) auto-creates a `profiles` row with `role='student'` for
  every new Supabase Auth signup. Promoting to admin is manual SQL:
  ```sql
  update profiles set role = 'admin' where email = 'you@greenhill.org';
  ```
  (Not needed going forward for previewing the student view — see below.)
- **The migration journal (`drizzle/0000_init.sql` + `drizzle/meta/`) is
  stale relative to the live DB.** At some point columns were added directly
  via `npm run db:push` without ever `db:generate`-ing a migration to record
  it (e.g. `first_name`/`last_name` on several tables, `interests.category`
  changed from enum to text). Running `db:generate` picks up that drift and
  produces a migration that re-adds already-existing columns — applying it
  with `db:migrate` would error out. **Use `db:push` for schema changes in
  this project, not generate+migrate** — it diffs live DB state directly, so
  it only applies the real delta. If you accidentally run `db:generate`,
  delete the new `NNNN_*.sql` file and its `meta/NNNN_snapshot.json`, then
  revert `meta/_journal.json`'s `entries` array to drop that entry, before
  it confuses a future `db:migrate`.
- **`db:push` needs `--force`** in this shell — `drizzle.config.ts` has
  `strict: true`, which always prompts for confirmation, and this
  environment has no TTY for that prompt to render in:
  `npm run db:push -- --force` (or `npx drizzle-kit push --force`).

## Secrets (never commit these)

`.env.local` holds real secrets and is git-ignored (`.gitignore` excludes all
`.env*` except `.env.local.example`, which only documents variable *names*).
Required/known-good for this project:

| Var | Status |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | set (Supabase's newer `sb_publishable_...` key format — works fine as the anon key) |
| `DATABASE_URL` | set — **must be the IPv4 pooler string**, see above |
| `SUPABASE_SERVICE_ROLE_KEY` | **not set yet** — needed for admin-only server-side features when we build them |
| `RESEND_API_KEY`, `EMAIL_FROM` | set |
| `APP_URL` | set to `http://localhost:3001` |

If a future session can't find `.env.local` (e.g. fresh machine/clone), the
values live only in the user's Supabase/Resend dashboards and this project's
prior chat history — they are intentionally not duplicated anywhere in git.

## Decisions made / features shipped this project so far

1. **Dev port fixed at 3001**, not 3000 (user preference, avoids clashing
   with other local projects).
2. **"View as student" toggle** (2026-07-27): admins can preview the student
   portal without mutating the real `profiles.role` column. Implementation:
   - `src/lib/auth.ts` — `VIEW_AS_COOKIE` cookie check in `getCurrentUser()`;
     `AppUser` now has both `role` (display role, respects the override) and
     `actualRole` (real DB role, always authoritative for permission checks
     elsewhere going forward).
   - `src/app/view-as-actions.ts` — `viewAsStudent()` / `viewAsAdmin()`
     server actions, set/clear the cookie, redirect accordingly.
   - `src/components/site-nav.tsx` — the actual button, shown only to real
     admins.
   - This is a one-way-downgrade-only cookie (admin→student display only);
     it cannot be used to escalate a real student to admin, so it's safe to
     leave in the codebase permanently.
   - Superseded the earlier approach (manually flipping `profiles.role` via
     SQL to test the student view) — don't suggest that approach again.
3. **Bulk FinalSite prospective-student import (.xlsx)** (2026-08-25),
   toward backlog item 3 below. User provided a real sample export
   (`Test Report-test.xlsx`, untracked, contains real-looking student
   data — do not commit it) with columns: First, middle_name, Last,
   name_suffix, Preferred, Grade, Date, Current School, Interest 1–4.
   - New upload card on `/admin/uploads`: "Prospective students (bulk
     report)" → `src/app/admin/uploads/prospective-report-upload-form.tsx`
     + `uploadProspectiveReport` action in `prospective-actions.ts`.
   - Parser: `src/lib/finalsite/parse-prospective-report.ts` (pure,
     column-name-based, not position-based).
   - **Non-obvious finding, confirmed against `seed-interests.ts`**: the
     four "Interest N" columns aren't 4 interests — they're two `(level,
     name)` pairs (Interest 1/3 = proficiency word, Interest 2/4 = actual
     interest name). User is aware and will double-check against a larger
     real export.
   - **This report has no gender column** (unlike the PDF form) — imported
     rows get `gender: null`; admin must fill in on `/admin/prospectives`
     before matching (gender is a hard filter). User said they'll get an
     updated report that includes gender — once that lands, wire it into
     this parser/action instead of leaving it null.
   - Added `shadow_start`/`shadow_end` time columns to `prospective_students`
     (the report's "Date" column bundles a visit time-range, e.g. "7:45AM -
     1:00PM", which had nowhere to persist before). Applied via `db:push`,
     not a tracked migration (see the migration-journal quirk above). Wired
     into both this new import path and the existing PDF import (which also
     discarded a shadow time range it could parse but never stored).
   - Added `xlsx` (SheetJS) as a new npm dependency to read the report.
4. ~~Self-service CSV schedule upload on `/me`~~ — **built, then superseded
   the same day** by item 5 below once we found a strictly better data
   source. Left in git history only; the code itself was replaced, not kept
   as a fallback UI (see item 5).
5. **Outlook-calendar host schedules, synced on demand** (2026-08-25) — the
   real fix for backlog item 2, replacing item 4. Investigation path, since
   it matters for judging the result:
   - User supplied two real sample files to evaluate: a Blackbaud "Student
     Year Enrollment Matrix" `.xls` (rejected — whole-year block→course
     mapping only, **no dates, no times, no rotation info**, useless for
     scheduling) and a Blackbaud-exported `.ics` (better, but only a ~60-day
     rolling window).
   - Then tested an **Outlook "Publish a calendar" ICS link** (Settings →
     Calendar → Shared calendars → Publish a calendar, permission tier
     **"Can view titles and locations"** — not the free/busy-only tier
     staff Availability uses today). Dramatically better: ~2 school years in
     one link, full block/course/room/**teacher** detail per event
     (`SUMMARY` carries two trailing parens — `"English 10 - U1020-6  (E
     Block) (Cantu)"` — block letter then teacher last name; confirmed
     against a real fetch, not assumed), and an all-day marker event per
     school day giving the exact rotation slot (`Green 1/3/5/X`, `Gold
     2/4/6/X`) — more precise than guessing green/gold from which block
     letters appear.
   - **Caching model, per explicit user direction**: schedules are pulled
     from Outlook *only* when matching runs for a date, or via an explicit
     "Refresh schedules" button — never on every page view. The pulled data
     is written into the same `host_schedule_days`/`host_schedule_blocks`
     tables the old admin CSV-upload path used, so every other view (schedule
     comparison, the per-match printable timeline, `deriveHostDay` in
     `admin/match/actions.ts`) is a fast, static DB read that doesn't touch
     the network — avoids the "50-100 live fetches per page load" cost an
     earlier live-fetch-on-every-read version of this would have had.
   - `hostStudents.icsUrl` (new column, nullable) — the saved link.
   - `src/lib/schedule/parse-host-ics.ts` — pure ICS parser. Verified against
     two real feeds: the Blackbaud-sourced `host ICS.ics` (single trailing
     paren, no teacher) and a live fetch of a real Outlook link (double
     paren, with teacher) — an actual end-to-end DB-write test caught a real
     bug (block letter and teacher were swapped/misparsed against the
     two-paren format) before this ever hit a real host.
   - `src/lib/schedule/ics-sync.ts` — `syncHostScheduleDay`/
     `syncSchedulesForDate`: the only code that fetches a host's calendar
     over the network. Fetches, parses, deletes any existing row for that
     host+date, writes fresh rows. Hosts without `icsUrl` are skipped (their
     legacy CSV-imported rows, if any, are left alone).
   - `src/lib/matching/loader.ts` calls `syncSchedulesForDate(date)` first,
     then reads `host_schedule_days` exactly like the original CSV-era code
     did. `src/lib/matching/match-detail.ts` and
     `src/app/admin/hosts/schedules/page.tsx` are back to plain DB reads —
     no sync call, since they're meant to reflect the last sync, not trigger
     a new one.
   - `/admin/hosts/schedules` now shows a "last updated" timestamp for the
     viewed date (from `host_schedule_days.createdAt`) and a **"Refresh
     schedules"** button (`actions.ts` + `refresh-schedules-form.tsx`) that
     re-syncs just that date on demand, with a pending-state note that it
     may take a little while.
   - Sync failures are surfaced, not swallowed: `MatchData.scheduleErrors` on
     `/admin/match`, and a banner on `/admin/hosts/schedules` after a manual
     refresh.
   - `/me`'s schedule section is "paste your calendar link" — validates by
     actually fetching+parsing before saving (rejects HTML links, broken
     links, or calendars with zero school days found):
     `src/app/me/schedule-actions.ts`/`schedule-link-form.tsx` (renamed from
     the superseded CSV-upload files, not new files — any older mention of
     `schedule-upload-form.tsx` is stale).
   - `/admin/hosts`'s "missing schedule" badge checks `icsUrl` (falling back
     to legacy row presence), not upload history.
   - **Untracked sample files added to the repo root** for this investigation
     — `host ICS.ics` and `host schedule by block.xls` — both contain
     real-looking student data; don't commit them (same caution as
     `Test Report-test.xlsx`).
6. **`/admin/uploads` cleaned up to match reality** (2026-08-25, after
   deploy). Two changes:
   - **Host schedules card** no longer has a CSV upload form — there's
     nothing to upload anymore now that item 5 moved schedules to calendar
     links. Replaced with a pointer to `/admin/hosts` (where the link now
     lives — see next bullet) and `/admin/hosts/schedules` (the refresh
     button). `host-upload-form.tsx` and its `uploadHostSchedules` action in
     `admin/uploads/actions.ts` still exist and still work, just aren't
     reachable from any page anymore — not deleted, since the legacy-CSV
     fallback path in `ics-sync.ts`'s reads still depends on that data shape
     existing for hosts without a saved link.
   - **`/admin/hosts` now has an editable calendar-link field per host**
     (`FeedForm` in `page.tsx` + new `setHostFeed` action in `actions.ts`),
     mirroring the Staff page's `calendarFeedUrl` field/pattern exactly. Most
     hosts will still set their own via `/me`, but this lets an admin set or
     fix one directly.
   - **Prospective students consolidated to one section** — dropped the PDF
     "Interview and Visit Form" upload card from the page entirely, per
     explicit request ("we just need a single section to upload the xls
     file from finalsite"). Only the bulk `.xlsx` upload is shown now.
     `prospective-upload-form.tsx` and the `uploadProspectiveForms` PDF
     action still exist (not deleted, same reasoning as above) but are now
     unreachable from the UI — if the PDF path is truly done for good,
     those files are safe to delete outright next time this area gets
     touched.
7. **`/me` reordered + a help guide for getting the calendar link**
   (2026-08-25). The "My schedule" box now sits *above* "My interests" (was
   getting lost at the bottom) — same components, `ScheduleLinkForm` just
   moved earlier in `page.tsx`, `InterestsForm` now renders inside its own
   `mt-10 border-t` block below it.
   - Added a **"❓ Help me find this"** link next to the schedule heading. No
     suitable pre-made tutorial video exists (searched — the only close
     YouTube hit was about emailing a single calendar invite, a different
     topic that would confuse students), so built a step-by-step visual
     guide instead: an Artifact page at
     https://claude.ai/code/artifact/27730909-9dd0-4697-898b-79fb011c746c
     (source: `outlook-ics-guide.html`, not part of the repo — a
     standalone published page, hardcoded into `page.tsx`'s href). Covers
     the exact flow verified against a real feed earlier this session:
     outlook.office.com → Settings → Calendar → Shared calendars → Publish
     a calendar → "Can view titles and locations" → copy the `.ics` link,
     not the `.html` one.
   - **If the user records a real screen-capture video later**, swap that
     href in `src/app/me/page.tsx` for the video URL instead — the artifact
     was explicitly a stand-in, not a rejection of the original "video" ask.

## Git status

Base is **committed and pushed to `origin/main`** as of 2026-08-25, commit
`143a566` ("Add view-as-student toggle, bulk prospective import, and synced
host schedules"). On top of that, items 6-7 above (the `/admin/uploads`
cleanup and the `/me` reorder + help guide) are done locally but **not yet
committed/pushed** — remember: since `vercel link` connected this repo, the
next push will also trigger a live production deploy automatically, so
mention that before pushing again, not just before deploying.

```
 M src/app/admin/hosts/actions.ts
 M src/app/admin/hosts/page.tsx
 M src/app/admin/uploads/page.tsx
 M src/app/me/page.tsx
?? "Test Report-test.xlsx"        (real-looking student data — never commit)
?? "host ICS.ics"                 (real-looking student data — never commit)
?? "host schedule by block.xls"   (real-looking student data — never commit)
```

These three are deliberately excluded from every commit (staged with
`git add -A -- ':!<file>' ...` pathspec exclusions, not just "forgot to add
them") — real student PII sitting in plain repo-root files, not under the
gitignored `/fixtures/` convention. Don't add them to git even incidentally
(e.g. via a bare `git add -A`).

Per standing policy, future commits/pushes still need the user's explicit
ask each time — this one was requested directly.

## Backlog — next work (given by user 2026-07-27, not yet scoped/started)

1. Use an MS Form to reconcile interests (vs. only the in-app `/me` picker).
2. Bulk-pull 300+ student schedules at once. **Done 2026-08-25** — see
   "Decisions made" item 5 above: each host saves their Outlook calendar's
   ICS subscribe link once at `/me`; schedules sync into the DB automatically
   whenever matching runs for a date, or on demand via a "Refresh schedules"
   button — no upload/re-upload ever required, and no live network fetch on
   every page view either. Solves both the original problem (admin
   hand-uploading 50-100 CSVs) and the IT-blocked Blackbaud API constraint by
   going through Outlook instead. Verified end-to-end against a real feed
   (parser bug found and fixed via an actual DB-write test, not just
   eyeballing output). Remaining open question: whether every host's
   Blackbaud schedule actually syncs into their Outlook calendar at all —
   won't know for certain until real hosts start saving links.
3. New FinalSite report for prospective students — name, gender, grade,
   interests, current school, visit date. **In progress** — see "Decisions
   made" item 3 above. Import path is built and working against a sample
   file; blocked on two things from the user: (a) an updated report that
   actually includes gender, and (b) confirming the Interest-1-4
   level/name-pairing interpretation against a bigger real export.
4. Output `.ics` files for **staff interviews** (distinct from the existing
   per-match `.ics` download at `/admin/schedule/[id]`).
5. **Matching priority order**: Date → Grade → Gender → Interest 1 → next
   interests in descending priority → Previous school (lowest priority).
   Should inform/replace the matching engine's current logic in
   `src/lib/matching/` (today: hard grade/gender filters + interest-fit +
   free-period rule + soft-cap load balancing, no explicit tie-break ladder
   like this).
6. Add a "previous school" field on the **host** side (currently only
   planned for prospective-student data via item 3).
7. Run **Middle School and Upper School as separate operations** — not
   pooled together. Affects hosts, matching, uploads, everywhere division
   shows up. (`SETUP.md`'s pending list already flagged "MS/LS divisions.")
8. Need **updated MS and US calendars** — the matching engine's free-period
   rule depends on calendar/schedule data that needs refreshing, per
   division per item 7.
9. Add an **AI chat window under the matching screen** (`/admin/match`) to
   discuss what an admin doesn't like about a specific match and how to
   adjust it for the next matching run — feeds back into item 5's priority
   ladder.

None of these are prioritized relative to each other yet. Don't start
speculative design on any of them until the user picks one to scope in
detail.

## Also pending (from original SETUP.md, still relevant)

- Course-catalog vector store + LLM interest→course fit (Phase 2; currently
  a keyword mapper in `src/lib/matching/course-map.ts`, swap point isolated).
- Emailing the `.ics`/schedule via Resend (only download is wired today).
- Confirming the exact shadow-date PDF field label.
- Published Outlook free/busy feeds, Blackbaud SKY API, MS Graph.

## How to pick this back up cold

1. `cd "Shadow Visit Platform"`, confirm `.env.local` still has the values
   described above (it should, it's git-ignored and untouched by clone/pull).
2. `npm install` if `node_modules` is missing.
3. `npm run dev -- -p 3001`, open http://localhost:3001.
4. Sign in as `abbondanziom@greenhill.org` — lands on `/admin` (real role is
   `admin`). Use the "View as student" nav button to see the student side.
5. Check the Backlog section above for what's next; check Git status above
   for what's uncommitted.
