# Shadow Visit Platform — Project Status

> **Purpose of this file**: a living summary of this project and the decisions
> made about it, kept up to date so a new conversation/context window can pick
> up where the last one left off without re-deriving everything from scratch.
> Update this whenever a key setup fact, decision, or piece of completed work
> changes — don't let it go stale.

Last updated: 2026-08-27

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
- All local work through 2026-08-26 is **committed and pushed** to
  `origin/main` (commit `8f00c7b`) — view-as-student toggle, bulk FinalSite
  import (gender + interests now correct), Outlook-synced host schedules,
  and email-schedule-to-host via Resend. Working tree is clean except the
  three untracked real-data sample files (see Secrets section).
- **Deployed to production**: https://shadow-visit-platform.vercel.app,
  auto-redeployed on every push since — see the Deployment section below.

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
| `RESEND_API_KEY` | set, valid (confirmed via `GET /api-keys` → 200) — but see below |
| `EMAIL_FROM` | `admissions@mail.greenhillinnovation.org` (changed 2026-08-25 from `admissions@greenhill.org` — see below) |
| `APP_URL` | set to `http://localhost:3001` |

If a future session can't find `.env.local` (e.g. fresh machine/clone), the
values live only in the user's Supabase/Resend dashboards and this project's
prior chat history — they are intentionally not duplicated anywhere in git.

**Resend/email status (checked 2026-08-25, not yet resolved)**: the Resend
API key works, but no email can actually send yet. `GET
/domains` on the Resend account shows `mail.greenhillinnovation.org` with
status `"failed"` — none of its 3 required DNS records verified (DKIM TXT at
`resend._domainkey.mail.greenhillinnovation.org`, SPF MX + SPF TXT both at
`send.mail.greenhillinnovation.org`, values available via the Resend API/
dashboard). Domain was added 2026-08-06, so this isn't propagation lag —
the records were likely never added, or added wrong. **`EMAIL_FROM` was
changed today to match this domain** (`admissions@mail.greenhillinnovation.org`,
was mismatched against `@greenhill.org` before, which wouldn't have worked
either even with verification). User is checking the DNS side. Nothing to
build here yet either way — per `SETUP.md`, actual email-sending code
(magic-link SMTP relay, `.ics` invites via Resend) isn't wired up in the app
yet, only the env vars exist. Don't assume this is fixed without re-checking
`GET /domains` — verification could still be pending next session.

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
   - **Both open questions below resolved 2026-08-26** — FinalSite updated
     the report with explicit headers, so nothing here is inferred anymore:
     the four generic "Interest N" columns are now named columns
     `Involvement 1`/`Interest 1`/`Involvement 2`/`Interest 2` — confirming
     the earlier (level, name)-pair theory exactly, and "Involvement" is
     confirmed unused (proficiency level, per user: ignore it). A `Gender`
     column (`M`/`F`) now exists too. Parser and `uploadProspectiveReport`
     both updated to match: `gender` is read directly from the row now
     (`gender: null` only when the cell itself is blank, flagged per-row in
     the upload result as "N missing gender" rather than a blanket note).
   - ~~Non-obvious finding: the four "Interest N" columns aren't 4
     interests...~~ — superseded by the resolution above; kept here only so
     the reasoning trail isn't lost. Original finding was confirmed correct.
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
8. **`EMAIL_FROM` fixed to match the intended sending domain** (2026-08-25).
   Changed from the mismatched `admissions@greenhill.org` to
   `admissions@mail.greenhillinnovation.org` in `.env.local` and on Vercel
   production, then redeployed. Pure config change — no app code sends email
   yet at this point in the timeline (see item 9, which changed that).
   Confirmed via Supabase's Management API that magic-link sign-in still
   runs on Supabase's own default mailer, not Resend (`smtp_host` etc. are
   `null` in the project's auth config) — intentionally **not** switched to
   Resend SMTP yet, since doing that before the domain verifies risks
   breaking the only sign-in path the app has. Do that once `GET
   https://api.resend.com/domains` shows the domain verified, not before.
9. **Built "email schedule to host" via Resend** (2026-08-25) — the
   `SETUP.md` "Pending" item ("only download is wired today") is now done in
   code, blocked only on the same domain verification as item 8.
   - `src/lib/email.ts` — thin `sendEmail()` wrapper around the `resend` SDK
     (already a dependency, just unused until now). Reads
     `process.env.RESEND_API_KEY`/`EMAIL_FROM` directly rather than through
     `src/lib/env.ts`'s `env` object — that object's type is a client/server
     discriminated union and doesn't expose server-only fields cleanly to
     TypeScript outside `env.ts` itself; `src/lib/db/index.ts` uses the same
     `process.env` workaround for the same reason.
   - `src/lib/matching/build-match-ics.ts` — extracted the `.ics`-building
     logic that used to live inline in the download route
     (`admin/schedule/[matchId]/ics/route.ts`), so both the download and the
     new email path produce identical calendar content from one place.
   - `src/lib/matching/match-detail.ts` — `MatchDetail` now also resolves
     `hostEmail` via `host_students.profile_id → profiles.email`. **Real
     constraint**: `host_students` has no email column of its own — only
     hosts who have logged in at least once (so `profile_id` is set) have a
     resolvable email. Hosts synced in only via a calendar link or legacy
     CSV import, who've never visited `/me`, have no email on file and are
     skipped with an explicit message, not a silent failure.
   - `src/lib/matching/email-host-schedule.ts` — `emailHostSchedule(matchId)`,
     the shared send function: builds an HTML summary of the day
     (reannouncing `buildTimeline`/`fmtTime`, same data source as the
     printable page) plus the `.ics` as an attachment.
   - Per-match **"Email to host"** button on `/admin/schedule/[matchId]`
     (`email-actions.ts` + `email-button.tsx`, next to Download .ics/Print).
   - Bulk **"Email schedules to hosts"** button on `/admin/match?date=X`
     (`emailSchedulesForDate` in `actions.ts` + `email-schedules-button.tsx`)
     — emails every confirmed/sent match's host for that date in one click,
     reports `Sent N/M` plus which ones were skipped and why.
   - **Verified end-to-end against real Resend calls**, not just typechecked:
     built synthetic DB rows (prospective + match, reusing the real existing
     admin host record from earlier `/me` testing — profiles/host_students
     rows are unique-constrained per email/profile, so a from-scratch fake
     profile collided), ran `emailHostSchedule` directly, confirmed the
     no-email-on-file path, then confirmed the real failure mode is exactly
     "The mail.greenhillinnovation.org domain is not verified" — i.e. the
     *only* thing standing between this and working is item 8's DNS, not a
     code bug. All synthetic rows cleaned up after; no real data left behind.

10. **Counselor→interviewer rename, AI settings tab, embeddings-based interest
    matching, interviewer fixed time-slots, host-schedule filters**
    (2026-08-27) — three end-user feedback items, built together since they
    touched overlapping schema. **Not yet committed to git or deployed** —
    typecheck/lint pass and every touched page smoke-tested 200 via curl with
    the admin bypass cookie, but the interactive forms (settings save,
    availability add, filter UI) have not been driven from an actual browser
    this session — no browser tool was available, so treat the click-through
    as unverified until someone does that pass.
    - **"Counselor" renamed to "interviewer" everywhere in the UI.** Pure
      TS-level rename — SQL column names (`counselor_staff_id`,
      `counselor_name_raw`) deliberately unchanged to avoid a migration;
      only the Drizzle property names (`interviewerStaffId`,
      `interviewerNameRaw`) and every UI label/form-field name changed.
      Touched: `schema.ts`, `admin/match/{page,actions}.tsx`,
      `admin/prospectives/{page,actions}.tsx`, `admin/match/export/route.ts`,
      `admin/schedule/[matchId]/page.tsx`, `lib/matching/match-detail.ts`.
    - **New `/admin/settings` ("AI Settings") page** — provider-agnostic LLM
      config, stored as rows in the existing `app_settings` key/value table
      (`src/lib/llm/settings.ts`): a reasoning-provider picker (Anthropic or
      OpenAI — now consumed by the PDF course-catalog path below, with a
      same-day fix so it actually respects this choice; see that section),
      and a masked API-key field per provider (blank = keep existing key; a
      checkbox explicitly clears one).
      Saving a key round-trips it through a live test call
      (`src/lib/llm/client.ts`) before persisting, so a typo is caught
      immediately. **Anthropic has no public embeddings endpoint**, so
      embeddings always go through OpenAI regardless of the chosen reasoning
      provider — the page says this explicitly.
    - **Course-catalog upload + embeddings**, same page, below the provider
      form (`src/app/admin/settings/course-catalog-form.tsx` +
      `uploadCourseCatalogAction`). Accepts **either a PDF or a spreadsheet**
      — the real-world source turned out to be a PDF catalog with a lot of
      non-course content mixed in (department overviews, graduation
      requirements, front/back matter), not a clean spreadsheet as first
      assumed, so PDF support was added 2026-08-27 as the primary path.
      - **PDF path** (`src/lib/courses/extract-courses-from-pdf.ts`): sends
        the raw PDF bytes to an LLM as a native document/file input (no
        local text-extraction library) with structured outputs (a
        hand-written JSON schema) forcing back exactly
        `{courses: [{code, title, description}]}`. The prompt explicitly
        tells it to skip anything that isn't one specific course and to
        return every course found, not a sample. **Provider-agnostic, with a
        fallback** — first version hardcoded this to Claude regardless of
        the reasoning-provider setting, which was wrong (see "Fixed" note
        below); now `resolveProvider()` uses whichever provider is selected
        as the reasoning provider *if its key is saved*, otherwise falls
        back to whichever key is actually present. Claude path: 24MB
        source-file guard (base64 inflates ~4/3, API cap is 32MB),
        `max_tokens: 64000`, streamed via
        `client.messages.stream(...).finalMessage()`. OpenAI path: Responses
        API (`client.responses.create`) with an `input_file` content part
        (base64 data URL) + `text.format` structured output, model
        `gpt-4o`, `max_output_tokens: 16384` — verified against the
        installed `openai` v7.7.0 type definitions directly (no bundled
        skill covers OpenAI's SDK the way one does for Anthropic's, so this
        wasn't cross-checked against any external authority beyond the
        installed package's own types).
      - **Fixed same day**: initially required an Anthropic key
        unconditionally for the PDF path even if only an OpenAI key was
        configured — user caught this immediately ("should use one key,
        whichever LLM is selected and has a key, not require one or more
        specific keys"). Corrected as described above.
      - **Spreadsheet path** (unchanged, kept as a fallback): .xlsx/.csv with
        a course name/title column and (ideally) a description column
        (`src/lib/courses/parse-course-catalog.ts` — flexible header
        matching, several accepted spellings per column).
      - Either path lands in the same place: **replaces the entire
        catalog** — rows go into the `courses` table (`code`, `title`,
        `description`, `embedding vector(1536)` via **pgvector**, enabled on
        the Supabase Postgres instance via `scripts/enable-pgvector.ts`),
        embedded via OpenAI `text-embedding-3-small` in batches of 100
        (`src/lib/llm/embeddings.ts`).
    - **Interest→class matching is now embeddings-based, with a keyword
      fallback** — replaces the "Phase 2" placeholder that used to live in
      `src/lib/matching/course-map.ts`. `courseCoveredInterestIds` now takes
      an optional `SemanticMatchContext` (catalog rows + one embedding per
      interest, cosine similarity ≥ 0.32 = "covered") and unions its result
      with the existing keyword matcher — keyword matching alone if no
      catalog is uploaded or no OpenAI key is set, so nothing breaks for a
      school that never visits the new settings page.
      `src/lib/matching/loader.ts`'s new `buildSemanticContext()` builds
      this once per match-run: reads the `courses` table, and **lazily
      embeds+caches each interest's embedding on the `interests` row itself**
      (new `interests.embedding` column) so repeat page loads of
      `/admin/match` don't re-call the embeddings API for interests already
      embedded. A host's scheduled course is resolved to a catalog row by
      exact course-code match, then exact normalized-title match, then a
      loose substring match either direction (ICS-sourced course
      titles/codes are often abbreviated). `engine.ts`'s existing
      "interest covered by an actual class the student sees" bonus was
      bumped from +1 to +2 to reflect the user's explicit priority that a
      class-based interest match should outweigh a merely-shared-hobby
      match more clearly. Grade and gender remain hard constraints exactly
      as before (unchanged) — that already satisfies "match on Gender, Grade,
      Interests" as listed priorities; nothing structural needed there.
    - **Interviewer fixed time-slot scheduling** (`/admin/staff`, Admissions
      tab, below each staffer's calendar-link field) — new
      `interviewer_availability` table (staff id, date range, weekday
      multi-select Mon–Fri, 30-min block multi-select 8am–3pm, all as
      Postgres array columns) via `addInterviewerAvailability`/
      `deleteInterviewerAvailability` in `admin/staff/actions.ts`.
      `src/lib/matching/interview-slots.ts`'s `getOpenInterviewSlots(date)`
      turns these templates into actually-open slots for a given shadow
      date (matches the ISO weekday, excludes slots already booked by
      another prospective's confirmed `match_meetings` row that day). Wired
      into `/admin/match`: the old free-standing "Interviewer" `<select>`
      is now a single grouped "Interview slot" dropdown (one `<optgroup>`
      per interviewer, one `<option>` per open 30-min block); confirming a
      match writes the picked interviewer + computed start/end straight onto
      `prospective_students` and the `match_meetings` row — replacing
      reliance on the family's free-form PDF-selected time. **Known gap**:
      nothing yet auto-*assigns* a slot during bulk "Confirm best for all" —
      that button still leaves the interview slot unset, admin has to pick
      one per-row afterward. Also, no `.ics` output for staff interviews yet
      (separate, still-open backlog item 4 below).
    - **Host-schedule grade/gender/interest filters**
      (`/admin/hosts/schedules` → `schedule-compare.tsx`): grade `<select>`
      (5–12), gender `<select>`, and an interest multi-select
      (`<details>`-based checkbox popover, any-of semantics). Per explicit
      spec: **setting any filter resets the host-selection checkboxes to
      empty** (same effect as clicking "Clear all"), the visible checkbox
      grid narrows to just the filtered hosts once any filter is active, and
      "Select all" thereafter only selects that filtered/visible set;
      "Clear all" is unchanged (always empties selection regardless of
      filters). The comparison table itself is unaffected structurally —
      still just "whatever's checked," exactly as before.
    - New dependencies: `@anthropic-ai/sdk`, `openai`. New schema: `courses`
      table, `interviewer_availability` table, `interests.embedding` column
      — all applied via `db:push --force` per the standing migration-journal
      quirk above, not a tracked migration.
    - **No `ANTHROPIC_API_KEY`/OpenAI key exists anywhere in this
      environment yet** (checked bash + PowerShell env, no `ant` CLI either)
      — an admin needs to visit `/admin/settings` and add at least an OpenAI
      key before semantic interest matching activates; until then matching
      silently runs keyword-only, which is the pre-existing behavior, so
      nothing regresses by leaving it unconfigured. User has since added an
      OpenAI key via the settings page (confirmed by hitting the PDF-upload
      bug below), but has not confirmed adding an Anthropic key.
    - **`next.config.ts` needed a body-size-limit bump for the PDF upload**:
      Next's Server Actions default to a 1MB request body cap, hit
      immediately on any real course-catalog PDF. Added
      `experimental.serverActions.bodySizeLimit: "30mb"` (still under
      `experimental` in Next 16.2.4 per its own type defs) — comfortably
      above `extractCoursesFromPdf`'s own 24MB guard. **Requires restarting
      the dev server** to take effect; Turbopack does auto-detect and
      restart on `next.config.ts` changes on its own (`⚠ Found a change in
      next.config.ts. Restarting the server to apply the changes...` seen in
      the logs), but don't rely on that timing — if a body-size error
      persists right after this kind of config change, restart manually
      before assuming the fix didn't work.
11. **Admin nav restructured into sub-tab groups** (2026-08-27, same day),
    per explicit request. Top nav is now just **Dashboard, Match,
    Prospectives, Hosts, Settings** — mirroring the existing Hosts pattern
    (top-level link → the group's first page, a small tab-bar component
    rendered inside each page).
    - **Availability removed from the nav** (not deleted) — `/admin/availability`
      still exists and works exactly as before, just unreachable by clicking
      anything; only reachable by typing the URL directly. No code under
      `src/app/admin/availability/` was touched.
    - **Uploads folded into Prospectives** as two tabs: "Students" (the
      existing `/admin/prospectives` page, unchanged content) and "Upload"
      (new `/admin/prospectives/upload/page.tsx`). The old top-level
      `/admin/uploads` route is **deleted** (`page.tsx` removed — now 404s);
      its action/form modules (`actions.ts`, `prospective-actions.ts`,
      `host-upload-form.tsx`, `prospective-upload-form.tsx`,
      `prospective-report-upload-form.tsx`) were left in place under
      `src/app/admin/uploads/` and are imported cross-folder into the new
      page rather than physically moved, to keep the diff small. Per
      explicit request, the migrated Upload tab **dropped the "Host
      schedules" pointer paragraph** (made sense on a catch-all Uploads
      page, redundant once nested under Prospectives) and also dropped a
      stale "Course catalog — Phase 2 placeholder" card that had been sitting
      there since before this session — real course-catalog upload lives on
      Settings → AI Settings now, so that placeholder was actively
      misleading. New component: `src/components/prospectives-tabs.tsx`
      (`"students" | "upload"`). Fixed every other in-app link that pointed
      at `/admin/uploads` (`admin/page.tsx`'s "Upload data" button,
      `admin/match/page.tsx`'s empty-state copy — which was also still
      stale-referencing the long-removed PDF-form upload path, now says
      "FinalSite bulk report" correctly) and the `revalidatePath("/admin/uploads")`
      calls in `prospective-actions.ts` (now revalidate
      `/admin/prospectives/upload` + `/admin/prospectives`).
    - **Interests, Staff, and AI Settings folded into "Settings"** as three
      tabs on a new `src/components/settings-tabs.tsx`
      (`"interests" | "staff" | "ai"`), rendered on each of the three
      existing pages (`/admin/interests`, `/admin/staff`, `/admin/settings`)
      right below each page's own `<h1>` — same placement convention as
      `HostsTabs`/`ProspectivesTabs`. Routes themselves are unchanged; the
      top nav's "Settings" link points at `/admin/interests` (the first tab),
      mirroring how "Hosts" points at the roster page. The Staff page's
      existing Faculty/Admissions sub-tabs (a *second*, page-internal tab
      row) sit directly below `SettingsTabs`, unchanged.
    - Verified via curl smoke tests (200 on every new/moved route, 404 on
      the deleted `/admin/uploads`) rather than a real browser click-through
      — same caveat as item 10, no browser tool available this session.
12. **Nav reorder + real Greenhill branding** (2026-08-27, same day). Three
    small requests handled together since the last two touch the same files.
    - **Top nav reordered** to Dashboard → Prospectives → Hosts → Match →
      Settings (was Dashboard → Match → Prospectives → Hosts → Settings).
    - **Logo swapped**: the placeholder "SV" badge in `site-nav.tsx` is now
      the real Greenhill "G" mark. Source file
      `Graphics/G_green.svg` (sibling folder to this repo, one level up —
      not part of the repo) copied to `public/greenhill-g.svg` and rendered
      as a plain `<img>` (no `next/image`; it's a small static brand mark,
      not worth the optimization pipeline).
    - **Real brand palette + typography applied**, sourced from
      `Graphics/Greenhill Style Guide (Updated August 2024).pdf`
      (confirmed exact hex/typeface names — the user's first copy of this
      file was accidentally just a single page from the deck with no hex
      codes; they replaced it with the real 20+ page guide mid-conversation).
      - **Colors** (`src/app/globals.css`, Tailwind v4 `@theme` block — no
        `tailwind.config.ts` in this project, CSS-first config): Forest
        Green `#004820` (primary), Cool Green `#00ae77`, Light Green
        `#11de92`, Copper `#c87337` from the primary palette; Forest Dark
        `#092b1c`, Mint `#94ffd6`, Ivory `#f1efe4` from the secondary
        palette — all exposed as Tailwind utilities (`bg-forest`,
        `text-cool-green`, etc.) via `--color-*` custom properties, the v4
        convention. Every primary-action element site-wide (buttons, active
        tab/date pills, the "admin" badge) was swapped from the placeholder
        `zinc-900`/`green-800` scheme to `bg-forest` via a scripted find/replace
        across `src/` (86 replacements, 20 files) — **not hand-edited
        file-by-file**. The script's negative-lookbehind regex initially
        mis-caught two `dark:hover:bg-zinc-900` subtle-hover states (unrelated
        to the brand-primary pattern) as `dark:hover:bg-forest`; caught by
        grepping every resulting `bg-forest` occurrence afterward and
        reverted those two by hand (`site-nav.tsx`, `me/page.tsx`). Status
        chips (day-type green/gold, match-confirmed green, warning amber,
        error red) were deliberately left untouched — those are semantic
        state colors, unrelated to brand green, and touching them would
        break their meaning.
      - **Typography**: the style guide's actual website fonts are Plantin
        (headlines) and Halyard (body) — both **Adobe-licensed webfonts**
        this project has no Adobe Fonts kit for, so they aren't embeddable
        here. Substituted the closest open equivalents in the same register
        via `next/font/google`: **Source Serif 4** (transitional serif,
        `--font-heading`, applied globally to `h1`/`h2`/`h3` via a bare CSS
        rule in `globals.css` rather than touching every page) and
        **Work Sans** (humanist grotesque, `--font-body`, wired as the new
        `--font-sans` so it's the default body font everywhere). Dropped the
        default `Geist` sans font entirely; kept `Geist_Mono` (still used
        for a few `font-mono` spots like file-upload result rows). **Also
        fixed a latent bug while in here**: `globals.css`'s `body` rule had
        a hardcoded `font-family: Arial, Helvetica, sans-serif` that
        silently overrode the `--font-sans` Tailwind variable — the site was
        actually rendering in plain Arial the whole time, not the Geist font
        the original scaffold intended. Now correctly references
        `var(--font-sans)` first.
    - Verified: `npm run typecheck` and `eslint src/` both pass clean; every
      admin page + `/me` + `/login` smoke-tested 200 after a full dev-server
      restart (cleared an accumulated Supabase connection-pool exhaustion
      from earlier smoke testing — see the local-setup memory note on this).
      **Not verified in an actual browser** — no browser tool available this
      session, so the visual result (does Source Serif 4 actually look good
      against Work Sans, does forest green read correctly in dark mode) is
      unconfirmed. Look at it before deploying.
13. **Forced light theme** (2026-08-27, same day) — the site was rendering
    dark for the user, since every component has `dark:` Tailwind variants
    that, by Tailwind v4's default, follow the browser/OS
    `prefers-color-scheme`. Rather than stripping `dark:` classes out of
    ~30 files, switched the variant itself to class-based via
    `@custom-variant dark (&:where(.dark, .dark *));` in `globals.css` —
    since nothing in the app ever adds a `.dark` class anywhere, every
    `dark:` utility is now permanently inert and the site renders light
    unconditionally, regardless of visitor system setting. Also deleted the
    plain-CSS `@media (prefers-color-scheme: dark) { :root { ... } }` block
    that separately overrode `--background`/`--foreground` outside Tailwind's
    utility system — needed removing too, or the page background/text color
    would still have flipped dark even with `dark:` utilities neutralized.
    Confirmed via the compiled CSS bundle: zero `prefers-color-scheme`
    occurrences, dark selectors now compile to `:where(.dark, .dark *)`.
    If dark mode is ever wanted back as a real feature (not just removed),
    the natural next step is a theme-toggle button that adds/removes `.dark`
    on `<html>` — the class-based variant is already set up for that, just
    unused.

## Git status

**Fully committed and pushed to `origin/main`** as of 2026-08-26 — three
commits: `143a566` ("Add view-as-student toggle, bulk prospective import,
and synced host schedules"), `478dda7` ("Simplify Uploads page and improve
the student schedule-link flow", items 6-7), and `8f00c7b` ("Add
email-schedule-to-host via Resend; fix bulk import gender/interests",
items 3 and 9). Every push since `vercel link` connected this repo
auto-triggers a production deploy — confirmed again for `8f00c7b` (new
deployment, "Ready", 36s build). Item 8 (`EMAIL_FROM` fix) was a
Vercel-only env change with nothing to commit. Working tree is clean except:

```
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
   interests, current school, visit date. **Done 2026-08-26** — see
   "Decisions made" item 3 above. Both blockers resolved: FinalSite's report
   now has an explicit `Gender` column and named `Involvement`/`Interest`
   columns (no more guessing). Import path verified against the updated
   real sample file, all 10 rows parse clean with zero warnings.
4. Output `.ics` files for **staff interviews** (distinct from the existing
   per-match `.ics` download at `/admin/schedule/[id]`). Still open — the
   interviewer fixed-slot feature (item 10 above, 2026-08-27) picks a slot
   and writes it to `match_meetings`, but nothing generates an `.ics` for
   the interviewer from it yet.
5. **Matching priority order**: Date → Grade → Gender → Interest 1 → next
   interests in descending priority → Previous school (lowest priority).
   **Partially superseded 2026-08-27** by a more specific, later request
   (Gender → Grade → Interests → class-based interest match) — grade/gender
   remain hard constraints as before, interest coverage now prefers a class
   match more strongly (+2 bonus, was +1), and interest matching itself is
   now embeddings-based with keyword fallback (see item 10 above). "Previous
   school (lowest priority)" as an actual scoring factor is still
   unimplemented — `previousSchool`/`currentSchool` data exists on
   prospectives but doesn't feed into `engine.ts` at all yet.
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

- ~~Course-catalog vector store + LLM interest→course fit (Phase 2)~~ —
  **done 2026-08-27**, see "Decisions made" item 10 above. Requires an admin
  to upload a catalog and set an OpenAI key on `/admin/settings` before it
  activates; keyword matching still runs either way.
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
