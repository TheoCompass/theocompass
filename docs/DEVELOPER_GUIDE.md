# TheoCompass: Developer Onboarding Guide

Welcome to the TheoCompass project! This document outlines the backend architecture, data flow, and current state of the application. 

## 1. High-Level Overview
TheoCompass is a highly nuanced theological alignment tool. Unlike standard personality quizzes, it calculates a user's alignment with over 230 Christian denominations based on 3 dimensions for every question:
1. **The Stance:** What they believe.
2. **Certainty (C):** How confident they are (0 to 3).
3. **Tolerance (T):** How they view Christians who disagree (0 to 4).

Because the math to calculate Euclidean distances across 120 questions for 230 denominations is highly complex, our backend is designed to run efficiently on a hybrid **Cloudflare D1 + KV** architecture, utilizing V8 isolates to keep API response times lightning fast.

## 2. Tech Stack
We are using a modern, serverless edge stack:
* **Frontend:** Next.js (React, Tailwind CSS, TypeScript) hosted on Cloudflare Pages.
* **Backend API:** Cloudflare Workers (TypeScript).
* **Database:** Cloudflare D1 (Serverless SQLite) for relational data and querying.
* **Cache:** Cloudflare KV Cache for storing precomputed denomination mathematical baselines.
* **Data Pipeline (ETL):** Node.js (`build_precomputed.js`) and Python (`generate_sql_seed.py`) scripts.

## 3. The Data Pipeline (How Data gets to the DB)
The "source of truth" for this project is a series of master CSV files managed by the domain expert. 
* **Step 1:** Raw CSVs containing questions, answers, and scoring matrices are edited.
* **Step 2:** `node scripts/build_precomputed.js` runs heavy mathematical models to format distance arrays, and writes `denomination_profiles.json`.
* **Step 3:** `python scripts/generate_sql_seed.py` merges the relational data into a massive `seed.sql` file.
* **Step 4:** The `seed.sql` file is executed against D1, and the `denomination_profiles.json` is uploaded to KV via Wrangler.

## 4. Database Schema Summary
The D1 SQLite database contains several key tables:
* `questions`: Holds the question text, categories, and sequencing flags.
* `answer_options`: Holds the answers linked to `question_id` and their theological labels. Labels are **per option**, so a multi-select answer (up to 3 ticks) returns one label per ticked option rather than one per question; the frontend dedupes by label text via `uniqueLabels()` in `TheologicalLabelCloud.tsx`, and the results footer counts through the same helper.
* `denominations`: Holds denomination metadata (names, families, descriptions).
* `denomination_answers` / `denomination_selected_options`: Normalized tables handling how every denomination effectively answered the quiz (including split answers) and their historical Certainty/Tolerance.
* `answer_scoring` / `hidden_dimensions`: The mathematical weights for the backend calculation engine.
* `denomination_compass_coordinates`: Precomputed dimensions for Scattermaps.

## 5. The API (Cloudflare Worker)
The Worker (`theocompass-api/src/index.ts`) connects the Next.js frontend to D1 and KV.
**Current Endpoints:**
* `GET /api/questions?mode=quick`: Dynamically fetches the quiz questions and nested answers based on the selected mode.
* `GET /api/coordinates`: Serves the precomputed dimensional data for the frontend chart visualizations.
* `GET /api/dev/profile?id=DENOM_XXX`: Pulls a specific denomination's answers directly from D1 (used for dev testing).
* `POST /api/calculate`: **The Core Engine.** Receives the user's answers, fetches the mathematical baselines for the 230 denominations directly from **KV Memory**, pulls the user scoring math from D1, runs the 12-dimensional Euclidean distance algorithm (applying Posture Amplifiers and Schism Drag), and returns the Top 10 matches with formatted 14-axis coordinates (12 survey dimensions + Tolerance + Certainty) and theological labels.
* `GET /api/roadmap` · `POST /api/roadmap/unlock` · `PATCH /api/roadmap/tasks/:id`: The full build plan and its moderator-only status editing (see §9).
* `POST /api/quiz/events` · `GET /api/stats`: Anonymous quiz completion counts for the landing page (see §10).
* `POST /api/issue-reports` · `GET /api/issue-reports` · `PATCH /api/issue-reports/:id`: The in-quiz "report an issue" flag, its triage queue and the maintainer notification (see §11).

### When the free D1 allowance runs out
Production runs on the Workers Free plan, where D1 allows a fixed number of rows per day. When the read allowance is gone, **every** query on the database throws until midnight UTC: the data is intact, the worker simply cannot read it. `src/d1-errors.ts` recognises that message (read or write, including when D1 wraps it in `cause`) and answers `503` with `{ code: "D1_LIMIT_REACHED", scope, resetAt }`, plus `Retry-After` and `Cache-Control: no-store`. 503 rather than 429 or 500 because the whole deployment is out of allowance until a fixed moment, not one caller being throttled. Every catch checks it before its generic error — `/api/questions` and `/api/calculate` catch their own failures, so both are wired explicitly.
The frontend owns the wording (`frontend/lib/d1-limit.ts`): `D1LimitError`, `D1_LIMIT_HEADING` ("TheoCompass is paused for today"), `d1LimitMessage()` and `D1_LIMIT_QUIZ_NOTE`. `lib/api.ts` turns the response into that error in one place (`errorFrom`), so the quiz start, the results view and `/roadmap` all explain the outage instead of blaming the reader's setup, and the reset time is shown in the reader's clock and in UTC. The Cloudflare sentence itself is pinned only by `theocompass-api/test/d1-errors.spec.ts`: if it is ever reworded, that test is the one place to update.

## 6. Frontend State & Silence Logic
The frontend tracks user progress in a Next.js client component (`userAnswers` state). A unique mechanic is the **Silence options**, which bypass the standard Certainty/Tolerance sliders and auto-inject specific logic directly into the payload:
* **Apathetic Silence** ("Not relevant to me"): Injects Certainty 0, Tolerance 2. 
* **Hostile Silence** ("I reject this framing"): Injects Certainty 3, Tolerance 1. 
The backend handles these automatically, forcing neutral coordinates (50) and applying amplified distance penalties.
**"None of the above"** is the answer list's last row and, mathematically, the same case as *apathetic* silence — there is no fourth silence mechanic. The UI nevertheless presents it as its own answer ("Nothing here is what I hold") and lights only the row the reader pressed; the payload records which one with `silenceSource` (below), so restoring a question does not move the highlight.

### Multi-select payload
Multi-select is **opt-in per question**: the list opens as single choices, a "Hold more than one?" button opens a disclaimer dialog, and enabling the mode lasts for that question only (`resetQuestionState`/`restoreQuestionState` in `_QuizController.tsx` own that lifecycle). The product cap is `MAX_MULTI_SELECT = 3` (`_constants.ts`), enforced in the controller and dimmed in the view; a question restored with several saved ids re-opens in multi-select. Turning the mode off collapses the set to its first pick, so the payload can never carry selections the UI no longer shows.

Each `UserResponse` sends:
* `answerIds: string[]` — every option the reader ticked, in click order (deduped; blank / `"skipped"` entries dropped; sliced to 3 by the client, clamped at 8 by the Worker as a defence against junk payloads).
* `answerId: string` — the primary (first) selection, still sent for backwards compatibility. A single choice therefore produces `answerIds` of length 1 and scores bit-identically to the pre-multi-select engine.
* `silenceSource: "answer-none" | "rail"` — **UI provenance only; the Worker never reads it.** It distinguishes the list's "None of the above" row from the apathetic-silence button, which share one calculation but are two answers on screen. Legacy saves omit it and are treated as `"rail"`.

The engine scores every affirmed option against every accepted view and applies the same Schism Drag twice: once across a denomination's branches, then across the user's own selections with `F = ((4 - T) / 4) * (C / 3)`, so a certain, exclusive reader who ticks several options is scored against all of them while an uncertain or tolerant one keeps best-match credit. A silenced question ignores `answerIds` entirely but must still count in the weighted average — it is scored as one neutral slot (`50` on every axis), never dropped.

### The tutorial (`currentView === "instructions"`)
The five steps are defined inline in `_QuizController.tsx` (`totalSteps` is derived from `steps.length`). Step 2 is a live, unscored miniature of the multi-select opt-in: local `demoMultiSelect` / `demoPicks` state over the fixture list `DEMO_OPTIONS`, mirroring the real mode bar in `QuizQuestionView` **by hand**. If that chrome or its wording changes, change the tutorial too — nothing links them. Step 5 covers the three no-answer doors (*None of the above* in the list, apathetic and hostile silence below it), which is the user-facing statement of the rule in §6.

## 7. Dev Tools (Auto-Finish)
To speed up testing the Results UI without clicking through 30+ questions, the frontend includes a hidden Developer Tool. 
* Open the **Restart** modal from the header.
* Type the secret code: `mod`.
* Click **Unlock Dev Tools**.
This allows you to either generate random dummy answers or pull a specific denomination's perfect profile from D1 to ensure the match percentage equals 100%.

## 8. Current Status & Next Immediate Tasks
The core backend pipeline, D1 database, KV cache, Euclidean calculation engine, and Results Dashboard are fully operational. The backend is perfectly parsing split answers, descriptions, and scaling tolerance correctly.

### Next Immediate Tasks (Where we are now):
1. **Wiki / Deep Dive Pages:** 
   Build dynamic routes (e.g., `/denomination/[id]`) so users can click on a Top 10 result and see a side-by-side comparison of exactly *how* that denomination answered the questions compared to the user.
2. **Open Beta Database Expansion:**
   Transition the system from the 30 "Pre-Demo" denominations to the full 230+ master list. Monitor the `Math CPU Time` logged in the Cloudflare Worker to ensure the loop stays well under execution limits.
3. **Standard & Deep Modes:**
   The frontend currently locks users into the 30-question "Quick" mode. Unlock the "Standard" (70 Qs) and "Deep" (120 Qs) modes by ensuring the frontend correctly passes the URL parameters to the API.
4. **Mobile Optimization & Polish:**
   Review all UI elements (especially the 12-axis diverging chart and Recharts tooltips) on mobile viewports to ensure scaling and touch targets are optimal.

## 9. The Roadmap (`/roadmap`)

Both pages read the same model. The landing page shows three milestones — Beta
(phase 0), Official launch (phases 1-5) and Extensions (phases 6-7) — from
`ROADMAP_MILESTONES` in `frontend/lib/roadmap.ts`; `/roadmap` is the real plan
behind them: eight phases and 61 tasks, grouped under the same three headings.

**Where the data lives.** `data/roadmap.csv` is the source of truth for *content*
— phase titles, goals, task names, descriptions, type, the verification note and
the initial status. It holds one line per row of `data/TheoCompass Roadmap.xlsx`,
so the spreadsheet stays readable and the pipeline stays reviewable: a content
change is a one-line diff instead of a binary file. The workbook is provenance;
`export_roadmap_csv.py` re-reads it (and **overwrites** the CSV), which is only
worth doing when the sheet itself has changed. Both scripts are stdlib-only; the
pipeline adds no dependencies.

```bash
python3 scripts/build_roadmap_json.py      # csv  -> data/roadmap.json
python3 scripts/generate_roadmap_seed.py   # json -> theocompass-api/roadmap_seed.sql
cd theocompass-api && npm run db:seed-roadmap-local    # or -remote

python3 scripts/export_roadmap_csv.py      # only when the xlsx changed (overwrites)
```

`roadmap_seed.sql` upserts by key and deletes rows that no longer exist, so it is
safe to re-run. It deliberately **does not write the `status` column**: statuses
edited on `/roadmap` live in D1 and must survive a content re-sync. Pass
`--reset-status` to the generator when you actually want the sheet's statuses
back.

**Tables** (`migrations/0002_roadmap.sql`): `roadmap_phases` (one row per phase)
and `roadmap_tasks` (`id` = `p3-04`, `phase_index` + `task_index` render as `3.4`,
`status` constrained to the four values below). Neither table is dropped by
`reset.sql`, so `npm run data:sync-*` leaves statuses alone.

| Stored value | Displayed |
| --- | --- |
| `not_started` | Not started |
| `in_progress` | In progress |
| `implemented_local` | Implemented locally |
| `implemented_live` | Implemented Live |

Those four strings are the spreadsheet's own validation list. If a fifth is ever
added, update `frontend/lib/roadmap.ts` (labels, chips, bars) and
`ROADMAP_STATUSES` in `theocompass-api/src/roadmap.ts` together — the API rejects
anything else with a 400.

**Moderator editing.** Statuses are shared: everyone sees the same value.
`POST /api/roadmap/unlock` validates the code; `PATCH /api/roadmap/tasks/:id`
requires it in the `X-Admin-Code` header and writes one status. The code comes
from `env.ADMIN_CODE` (`npx wrangler secret put ADMIN_CODE`), falling back to
`mod` so a fresh clone works without setup. This is a speed bump on a public
status field, not an authentication system — do not put anything private behind
it. The frontend keeps an accepted code in `sessionStorage` for the tab only, and
applies each change optimistically, rolling the whole list back if the PATCH
fails.

**Numbering.** Phase 7 is labelled `8.x` in the spreadsheet. The site always
shows the positional `phase.task` (`7.1`), and keeps the sheet's own label in
`roadmap_tasks.sheet_id` so the row can still be found.

## 10. Anonymous Quiz Stats

`POST /api/quiz/events` records one completed quiz; `GET /api/stats` aggregates
them for the landing-page "Collective results" panel. Nothing identifying is
stored — no email, IP, user agent or free text — only mode, answer count, top
match, tolerance and certainty.

The client sends a `sessionId` (a UUID generated per completion) and the unique
index on `quiz_events.session_id` makes the insert idempotent: a retry cannot
inflate the counters. The payload is validated server-side — mode must be
`quick`/`standard`/`deep`, `answeredCount` 1–200 — and optional fields that fail
their range are dropped rather than rejecting the whole event.

Only the normal end-of-quiz path posts an event. The `mod` developer tools
(“Skip to a result”) calculate directly and mark themselves as dev runs, so their
results enter neither `quiz_complete` analytics nor `/api/quiz/events`.

`frontend/app/_components/_LiveStats.tsx` fetches `/api/stats` once per page view
and renders nothing below 10 runs or if the request fails, so the landing page
never waits on it and never shows a "0 quizzes taken" badge. The panel sits below
the product card and has three states:

* **10–49 runs** — total, the 14-day sparkline, and a progress panel that says
  how many runs unlock the rest.
* **50–199 runs** — all four tiles, plus an "Early data" label.
* **200+ runs** — all four tiles, label gone.

The tiles are: runs (total, 14 UTC days, last 7 days, today), closeness
(median/mean closest match and the five-tier distribution), family shares (top
five families plus an explicit "Other families" remainder), and posture
(tolerance/certainty averages, taken only over runs that answered both sliders).
Every percentage names its own denominator.

`GET /api/stats` keeps the original summary fields and adds `medianTopMatch`,
`daily[14]` (zero-filled UTC days), `scoreHistogram[20]` (5-point buckets),
`scoreSample`, `familySample`, `matchSample`, `distinctFamilies`, and
`posture { tolerance, certainty, sample }`. `last7Days` is now a UTC calendar
window (today plus the six before), so it always equals the last seven bars of
`daily`. All new `QuizStats` fields are optional in `frontend/lib/api.ts`, so a
frontend deploy that lands before the API still renders the older summary.

`GET /api/stats` is cached for 60s per isolate and 5 minutes at the edge; a
recorded event invalidates the isolate cache.

Migration `migrations/0003_quiz_stats.sql` adds the outcome columns and the unique
session index to the `quiz_events` table created in `0001`.

**Tests.** `cd theocompass-api && npm test` runs everything. The D1-backed specs
(`test/roadmap.spec.ts`, `test/stats.spec.ts`) apply the real migrations through
`test/setup.ts`; `vitest.config.mts` reads them with `readD1Migrations`, so the
suite always tests the schema that gets deployed. `stats.spec.ts` covers the
bucket boundaries (0, 4.9, 5, 89.9, 90, 95, 100), the median for odd and even
counts, UTC day zero-fill/`last7Days`, and the separate denominators behind the
closeness, family and posture figures.

Multi-select scoring has its own pair: `test/split-scores.spec.ts` unit-tests the
pure aggregation (`resolveAnswerIds`, `scoredViewIds`, `schismFactor`,
`applySplitDrag`) and `test/multiselect.spec.ts` runs the real `/api/calculate`
handler against D1 + KV shims, pinning single-selection parity, the per-selection
and cross-selection schism drag, and the rule that a silenced question still
counts as one neutral slot.

## 11. In-quiz Issue Reports

Every question carries a small bordered **Report** chip at the end of its meta row
(`_components/_ReportIssue.tsx`), and the first question's hint bar points at it
once, because a control nobody finds is the same as no control. It opens the
shared `Dialog`: four type chips (typo, wrong options, loaded framing, something
else) and an optional note of up to 500 characters. The report deliberately
carries the screen it came from — `question_id`, the ticked `answer_id`, `mode`,
`question_index` and `APP_VERSION` — so it is actionable without a round trip.

**Why D1 first.** The row is the record; the email is a courtesy. A report can be
counted, deduplicated and moved through `open → triaged → fixed → wont_fix`, and
`data_version` says which dataset it was filed against. A mail in an inbox can do
none of that, so the notification is sent only after the insert succeeded.

**Endpoints.**

* `POST /api/issue-reports` — files one report. `flagId` is a client UUID and the
  unique index on `issue_reports.flag_id` makes the write idempotent:
  `ON CONFLICT DO NOTHING`, `recorded: false` means "already have it", not
  "failed". Required: `flagId`, `questionId`, `issueType`. Optional junk is
  dropped rather than rejected (same bargain as `parseQuizEvent`), the note is
  truncated to 500 characters, and one question is capped at 10 reports an hour
  (`429` past that) so the open endpoint cannot be scripted. There is no
  Turnstile: the flag id stops a retry, the cap stops a script, and the endpoint
  writes to one table.
* `GET /api/issue-reports?status=open&limit=50` — the triage queue, behind
  `X-Admin-Code` (the roadmap's code, `mod` by default). Returns the rows plus
  counts per status.
* `PATCH /api/issue-reports/:id` — `{ "status": "fixed" }`, same code. `status` is
  the only writable column.

**Notification.** `notifyIssueReport()` runs inside `ctx.waitUntil()`, only when
`recorded === true`, wrapped so a mail failure cannot lose a report, and it
writes `notified_at` only on success. Two optional channels, email first:

* `send_email` binding `FLAG_EMAIL` → `FLAG_EMAIL_TO` (default
  `theocompass.project@gmail.com`). The destination must already be a *verified*
  Email Routing address on a zone in the same account, which is what keeps an
  open endpoint from becoming a relay. The binding is commented out in
  `wrangler.jsonc`; uncomment it once that is true, because `wrangler deploy`
  rejects an unverified destination.
* `FLAG_WEBHOOK_URL` secret (`wrangler secret put FLAG_WEBHOOK_URL`) — a Discord
  or ntfy webhook, one JSON POST, for an account whose domain is not on
  Cloudflare.

With neither configured the function resolves to `null` and nothing is stored
about it: that is how the test suite stays offline, and a report filed while
notifications are broken is still in D1 waiting to be read. It is not silent,
though — the worker logs `ISSUE REPORT NOT NOTIFIED:` plus the reason (no channel
configured, or every configured channel failed), because silence is what let a
dead mail channel look healthy for a week. The client only trusts an explicit
boolean `recorded` in the response: a deploy older than this endpoint answers
every unknown `/api/*` path with `200` and the health payload, which used to look
exactly like a filed report.

**Testing the notification locally.** `wrangler dev` simulates `send_email`: the
mail never leaves the machine. The dev log prints `send_email binding called with
the following message:` and the path of an `.eml` under
`…/miniflare-*/files/email/`, which opens in any mail client — that file *is* the
notification, headers and all. The binding has to be declared to get that far, so
point dev at a scratch copy instead of editing the committed config:

```bash
cd theocompass-api
python3 - <<'PY'
s = open("wrangler.jsonc").read()
s = s.replace('\t\t\t"remote": true\n\t\t}\n\t]\n',
              '\t\t\t"remote": true\n\t\t}\n\t],\n\t"send_email": [{\n'
              '\t\t"name": "FLAG_EMAIL",\n'
              '\t\t"destination_address": "theocompass.project@gmail.com"\n'
              '\t}]\n', 1)
open("wrangler.email.local.jsonc", "w").write(s)
PY
npx wrangler dev --local -c wrangler.email.local.jsonc   # file a report in the UI
rm wrangler.email.local.jsonc                            # nothing committed changed
```

Two things this catches that a type check cannot, both of which were silent
failures the first time: `EmailMessage` is a `cloudflare:email` export and not a
global, and `send()` rejects a raw message with no `Message-ID` header.

For a notification you can actually read while developing, skip the mail:
`.dev.vars` is gitignored and read by `wrangler dev --local`, so

```bash
printf 'FLAG_WEBHOOK_URL=https://ntfy.sh/your-private-topic\n' > theocompass-api/.dev.vars
```

delivers the formatted report to your phone (a Discord webhook URL works the
same way), and `notified_at` is stamped when the POST goes through. Real mail
from the local runtime needs `"remote": true` on the `send_email` entry — that
is the same verified-destination prerequisite as a deploy, which is why the
simulated `.eml` is the useful local test.

**Privacy.** No email, name, account, IP or user agent is stored with a report —
the quiz never asks for any of them, and there is nothing to reply to. The note is
the only free text the site accepts, and it is never sent to analytics: the GA4
event is `question_issue_reported` with `{ question_id, issue_type }` only. The
`mailto:` fallback appears only when the POST failed, and reuses the public
contact address the footer already prints.

**Triage interim.** Until there is a panel, read the queue from the shell:

```bash
npx wrangler d1 execute theocompass-db --remote \
  --command "SELECT id, question_id, issue_type, note, created_at FROM issue_reports WHERE status = 'open' ORDER BY created_at DESC LIMIT 50"
```

Migration `migrations/0004_issue_reports.sql` extends the `issue_reports` table
created in `0001` with `flag_id`, `status`, `mode`, `question_index`,
`app_version`, `notified_at` and `updated_at`, plus the flag/created/question/
status indexes. `reset.sql` drops reference tables only, so a `data:sync-remote`
re-seed keeps every report. `test/issue-reports.spec.ts` pins the happy path,
idempotency, validation, note truncation, the hourly cap, the code on the read
and write queue endpoints, the `404`/`400` ids, and the raw MIME the mail channel
sends (a `Message-ID` that is present and unique per send).
