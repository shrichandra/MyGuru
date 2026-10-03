# MyGuru

A personal daily operating system: one loop (Plan, Do, Log, Reflect) across routines, health,
wealth, work and personal life, with an AI "Guru" that briefs, breaks down, drafts and reviews.
Installable on Android as a PWA, hosted on Google Cloud Run, data in SQLite replicated to Cloud Storage.

## What's in the app

| Screen | What it does |
| --- | --- |
| **Today** | Guru briefing line, a Now card that changes with the time block (morning routine with step timer, top 3 tasks and next meeting, people due a call, wind-down), Next up (max 3 rows), and five Pulse rings |
| **+ Log** | One text box: "lunch dal rice", "ran 5k 28 min", "called Ravi 20 min", "spent 450 on uber", "slept 11pm-6:30am q4", "todo: send deck". Parsed into the right table, with a confirm chip |
| **Plan** | Day timeline (time blocks + calendar + top 3), routines editor and run mode with streaks, sleep log, habits, goals |
| **Health** | Steps, sleep, food totals; workout plan by weekday and log (sets, reps, weight, minutes); meals with macros; weekly meal plan; Health Connect data |
| **Wealth** | Read-only portfolio monitor (value, day change, allocation by asset class and sector, top movers, trend), alert rules, wealth goals; optional typed-in expenses and monthly budgets |
| **Work** | Projects, tasks with subtasks, daily top 3, Guru task breakdown (steps under 60 min), meeting prep / exec update (BLUF) / SCQA / pyramid templates with Guru drafts, today's meetings with prep |
| **Life** | People with a contact frequency and days since last touchpoint, quality-time target, hobbies with weekly minutes and milestones |
| **Review** | Weekly scores per domain (0-100), Guru summary (wins, misses, one change), your 3 commitments, which become next week's pinned goals |
| **Settings** | Status of sign-in, Guru AI, Calendar, broker, Health Connect, notifications; JSON export |

Scheduled jobs (`/api/jobs/*`, called by Cloud Scheduler): morning briefing + push, calendar sync,
10-minute meeting reminders, portfolio refresh + alert push, 20:00 evening nudge, Sunday weekly
review, nightly housekeeping. Quiet hours (default 21:30-06:00) mute everything except the
briefing, alerts and the review.

Everything works without any keys: the Guru falls back to rule-based briefings, task breakdowns,
template drafts and a rule-based quick-log parser. Add `ANTHROPIC_API_KEY` to switch on the AI.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional; with no sign-in vars, dev mode is open
npm run dev                  # http://localhost:3000
npm test                     # unit + database tests
npm run typecheck
```

The database is created and migrated on first request at `./data/myguru.db` and seeded with
default time blocks, a morning and an evening routine, and expense categories.

## Stack

Next.js 16 (App Router, server actions) + TypeScript, Tailwind CSS 4, SQLite via Drizzle ORM
(better-sqlite3), Claude API (`@anthropic-ai/sdk`), Web Push, Litestream, Cloud Run, Cloud Scheduler,
Secret Manager. Code map:

```
src/app/(app)/        screens          src/lib/db/          schema, migrations runner, seed
src/app/actions.ts    server actions   src/lib/guru/        Claude client, context bundle, features
src/app/api/          auth, jobs, sync src/lib/portfolio/   read-only broker adapters + alerts
src/components/       UI pieces        src/lib/calendar/    Google OAuth + Calendar read-only
drizzle/              SQL migrations   src/lib/jobs.ts      scheduled jobs
deploy/               Cloud Run, Litestream, Scheduler       mobile/  Android wrapper (Health Connect)
```

Schema changes: edit `src/lib/db/schema.ts`, then `npm run db:generate` and commit the new SQL in `drizzle/`.

## Deploy to Google Cloud

1. Create a Google Cloud project and an OAuth client (Web application) in APIs & Services.
   Enable the Google Calendar API. Add yourself as a test user on the consent screen.
2. Create the secrets you need (each one is optional except `SESSION_SECRET` plus one sign-in method):
   ```bash
   printf '%s' "$(openssl rand -base64 32)" | gcloud secrets create SESSION_SECRET --data-file=-
   printf '%s' 'you@gmail.com'              | gcloud secrets create ALLOWED_EMAIL --data-file=-
   printf '%s' '<client id>'                | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-
   printf '%s' '<client secret>'            | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-
   printf '%s' "$(openssl rand -hex 24)"    | gcloud secrets create CRON_SECRET --data-file=-
   printf '%s' '<anthropic key>'            | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
   npx web-push generate-vapid-keys   # then create VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
   ```
3. `deploy/cloudrun.sh` (builds the image, creates the bucket, deploys one always-on instance).
4. Re-run with `APP_URL=<service url> deploy/cloudrun.sh`, and add `<service url>/api/auth/google/callback`
   as an authorised redirect URI on the OAuth client.
5. `APP_URL=<service url> CRON_SECRET=<same secret> deploy/scheduler.sh`.
6. On your phone, open the URL in Chrome and choose **Install app**. For Health Connect, build the
   wrapper in `mobile/`.

Cost estimate: Cloud Run 1 small always-on instance about 5-15 USD/month, storage and scheduler under
2 USD, AI calls a few USD/month for one person.

## Still needed from you

- **Broker** for the portfolio monitor. Until then holdings are typed in on the Wealth page.
  `src/lib/portfolio/kite.ts` shows the adapter shape (Zerodha Kite Connect as an example).
- **Google Cloud project** and the secrets above.
- **Timezone and currency**: defaults are `Asia/Kolkata` and `INR` (`APP_TIMEZONE`, `NEXT_PUBLIC_CURRENCY`).
