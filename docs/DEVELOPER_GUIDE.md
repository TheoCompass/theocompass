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
* `POST /api/feedback` · `GET /api/feedback` · `PATCH /api/feedback/:id`: Post-quiz feedback from the results page, the moderator queue behind it, and the page at `/mod/feedback` that reads it (see §12).

### When the free D1 allowance runs out
Production runs on the Workers Free plan, where D1 allows a fixed number of rows per day. When the read allowance is gone, **every** query on the database throws until midnight UTC: the data is intact, the worker simply cannot read it. `src/d1-errors.ts` recognises that message (read or write, including when D1 wraps it in `cause`) and answers `503` with `{ code: "D1_LIMIT_REACHED", scope, resetAt }`, plus `Retry-After` and `Cache-Control: no-store`. 503 rather than 429 or 500 because the whole deployment is out of allowance until a fixed moment, not one caller being throttled. Every catch checks it before its generic error — `/api/questions` and `/api/calculate` catch their own failures, so both are wired explicitly.
The frontend owns the wording (`frontend/lib/d1-limit.ts`): `D1LimitError`, `D1_LIMIT_HEADING` ("TheoCompass is paused for today"), `d1LimitMessage()` and `D1_LIMIT_QUIZ_NOTE`. `lib/api.ts` turns the response into that error in one place (`errorFrom`), so the quiz start, the results view and `/roadmap` all explain the outage instead of blaming the reader's setup, and the reset time is shown in the reader's clock and in UTC. The Cloudflare sentence itself is pinned only by `theocompass-api/test/d1-errors.spec.ts`: if it is ever reworded, that test is the one place to update.

## 6. Frontend State & Silence Logic
The frontend tracks user progress in a Next.js client component (`userAnswers` state). A unique mechanic is the **Silence options**, which bypass the standard Certainty/Tolerance sliders and auto-inject specific logic directly into the payload:
* **Apathetic Silence** — the question screen's **I don't know** button ("I haven't settled this, or it isn't essential to me"): Injects Certainty 0, Tolerance 2. 
* **Hostile Silence** — the **I reject the question** button ("The premise is wrong, not just the options"): Injects Certainty 3, Tolerance 1. 
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
The five steps are defined inline in `_QuizController.tsx` (`totalSteps` is derived from `steps.length`). Step 2 is a live, unscored miniature of the multi-select opt-in: local `demoMultiSelect` / `demoPicks` state over the fixture list `DEMO_OPTIONS`, mirroring the real mode bar in `QuizQuestionView` **by hand**. If that chrome or its wording changes, change the tutorial too — nothing links them. Step 5 covers the three no-answer doors — *None of the above* in the list, then **No view** and **Rejection** under it — using the same words as the question screen, which is the user-facing statement of the rule in §6.

### The axis vocabulary (`AXIS_LABELS`)
`_constants.ts` is the only place the fingerprint's pole words live, and each entry carries four layers: `left` / `right` (the names on the rail), `desc` (the topic line printed under every row), `hints` (the two-to-five word gloss printed under each pole) and `poles` (the full sentences shown when a row is opened). The panel, the export PNG and the denomination loader in `_QuizController` (which uses the keys to accept or drop a coordinate) all read the same map, so a new axis is one entry and nothing else.
Two rules keep the rails honest. Treat `hints` as mandatory even though the type marks them optional (that is what let the chart and the export card compile untouched): "Orthodox" on a rail reads as a denomination or as a verdict, so the row has to say *creeds are settled authority* before anyone clicks. And a row must never claim a lean at exactly 0 — `AxisRow` treats `signed === 0` as its own case, bolds neither pole, and says "you sit at the midpoint"; the export card mirrors that.

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
it. The frontend keeps an accepted code in `sessionStorage` for the tab only
(`frontend/lib/mod-code.ts`, which also serves the feedback queue at
`/mod/feedback`), and applies each change optimistically, rolling the whole list
back if the PATCH fails.

**Numbering.** Phase 7 is labelled `8.x` in the spreadsheet. The site always
shows the positional `phase.task` (`7.1`), and keeps the sheet's own label in
`roadmap_tasks.sheet_id` so the row can still be found.

## 10. Anonymous Quiz Stats

`POST /api/quiz/events` records one completed quiz; `GET /api/stats` aggregates
them for the landing-page "Collective results" panel. Nothing identifying is
stored — no email, IP, user agent or free text — only mode, answer count, top
match, tolerance and certainty. (The feedback card is the one place a reader can
type something of their own, and it keeps its own table — see §12.)

The client sends a `sessionId` (a UUID generated per completion) and the unique
index on `quiz_events.session_id` makes the insert idempotent: a retry cannot
inflate the counters. The payload is validated server-side — mode must be
`quick`/`standard`/`deep`, `answeredCount` 1–200 — and optional fields that fail
their range are dropped rather than rejecting the whole event.

Only the normal end-of-quiz path posts an event. The `mod` developer tools
(“Skip to a result”) calculate directly and mark themselves as dev runs, so their
results enter neither `quiz_complete` analytics nor `/api/quiz/events`. They do
render the feedback card, because that is how the form gets inspected without
answering a whole quiz — a rating submitted from such a run is stored like any
other and can be set to `hidden` in `/mod/feedback`.

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

## 12. Post-Quiz Feedback

`POST /api/feedback` records how a run felt — a 1–5 rating of the overall quiz
experience, how close the top match is to where the reader actually is (one tap,
four answers, 0008), where their own church sat if they want to be precise (two
pickers: the closest family, then the denomination inside it, each answerable or
skippable) and an optional comment — from the card that sits under the results
dashboard. `GET /api/feedback` is the moderator queue behind it, behind the same
`X-Admin-Code` as the roadmap editor and the report queue.

**One rating, two questions.** The stars used to ask *how close the match felt*.
They now ask *how the quiz felt overall*, which is a different measurement, so
rows carry `feedback.rating_metric` (`'experience'` for everything the handler
writes, `'fit'` for the rows that predate the change — labelled by
`migrations/0006_feedback_rating_metric.sql`). Only `'experience'` rows feed the
published `total`, `averageRating` and `ratingHistogram`; the match question
never changed its meaning, so `accurateYes` / `accurateNo` still span every
judged row, reset or no reset. Nothing is deleted and nothing is hidden: the
queue keeps reading the old rows, tagged `match fit`, and a row can still be
retired with `hidden`. The metric is a discriminator, not a reset button: the
file is applied once (the UPDATE has no `WHERE`, so running it by hand a second
time would relabel every new row too).

**The match question (0007).** That question used to be a yes/no about *the top
match*. The copy never said *#1*, so a reader could reasonably answer about the
list as a whole, and a "no" could not distinguish a near miss from a denomination
that is simply not in the database. A single row of six rank buckets answered the
first half of that and left the second: "my denomination is missing" and "none of
these fitted" were two different answers, and `#4–#10` said nothing about which
*level* was wrong.

It is now the two things a reader can answer without translating anything, in the
order the page asks them: **which family came closest** (`family_rank`, the place
of the family in the family list the reader was just looking at) and then **your
church in that family** (`match_rank_pos`, the place of the denomination in the
full list). Each level has its own escape hatch — `0`, "none came close" and "not
one of these" — and that is a judgement about the list, not a skip.
`migrations/0007_feedback_match_rank.sql` adds both integer columns and indexes
them. Integers rather than a text enum on purpose: the shortlist lengths are a UI
decision (`FAMILY_OPTIONS` / `CHURCH_OPTIONS` in `_PostQuizFeedback.tsx`), so
changing eight to six must not need a migration or a rewrite of rows written
under the old list, and anything past the list is still a miss — which is why the
published buckets are ranges (`=1`, `2-3`, `4-8`, the rest) rather than named
places.

The ranks are positions in the lists *on screen*: `_QuizController` hands the card
the filtered lists (`filterFamiliesByActive` / `filterDenomsByActive`), so "active
only" moves the page's numbering and the picker together and a hidden tradition
never keeps a place in the count. The family options are the first
`FAMILY_OPTIONS` = 8 rows of `familyMatches`; the church options are that
family's first `CHURCH_OPTIONS` = 5 rows, but each is numbered by its index in
the *full* `results` list — so a button can read `#7`, and the number on it is
still the number on the page. A denomination absent from the visible list is
simply not offered: the row sends the escape hatch instead of an invented
position.

`accurate` is *derived*, never asked twice: the stance when the row has one
(0008), otherwise `match_rank_pos` (`1` → 1, anything else → 0), otherwise the
boolean an old bundle sends, and `NULL` when nothing was answered — so the
columns can never disagree and the published "Top 1 match accuracy" figure keeps
one denominator across every wording the card has ever used. A tab still running
the old card keeps working for the same reason. The backfill is deliberately
one-directional: `accurate = 1` becomes `match_rank_pos = 1`; a legacy "no" leaves
both columns `NULL`, because it never said how far off it was and writing a guess
would invent an answer the panel would then publish. `family_rank` is never
backfilled at all — the question was never asked. `fit_stance` is not backfilled
either (see below). The 0007 indexes are there for the queue's future filters,
not for `/api/stats`, which sums the whole table in one pass.

**The stance question (0008).** Everything above asks the reader to place *their
church* in a list. That question has no answer for a curious reader, a seeker, or
someone doubting the tradition they were raised in, and their two exits both
lied: the pickers' escape hatch `0` was stored as a *miss* and pulled the
published accuracy down, and a skip was stored as `NULL` and disappeared. The
figure then read as "the match is right for 58% of readers" while measuring "58%
of readers who happen to have a church".

So the card asks the answerable question first: **how close is the top match to
where you actually are?** `migrations/0008_feedback_fit_stance.sql` adds a
nullable `fit_stance` text column with four values — `fit`, `close`, `off`,
`exploring` — validated by `parseStance()` in `src/feedback.ts` rather than by a
`CHECK`, the same bargain 0005–0007 make (an unknown value is dropped to `NULL`
rather than rejecting a rating). `exploring` means *no church to compare
against*; it is stored as an answer, counted as one, and derives
`accurate = NULL`, so it leaves the accuracy denominator without leaving the
table. The two escapes that used to be indistinguishable are now distinguishable.

The derivation, in full, because it decides a published number:

| stance       | `accurate` | in `stanceCounts` | in the top-1 figure |
| ------------ | ---------- | ----------------- | ------------------- |
| `fit`        | 1          | yes               | numerator           |
| `close`      | 0          | yes               | denominator         |
| `off`        | 0          | yes               | denominator         |
| `exploring`  | NULL       | yes               | neither             |
| `NULL`       | from rank / legacy boolean | no    | as before 0007      |

That makes one answer recordable that never was: *#1 as their church, yet the
match is `off`* — the reader who says "the top match describes me better than the
church I belong to". Under the old wording that row was a hit (their church was
#1) and the disagreement was invisible. It is now a miss with a rank of 1.

Two consequences to expect, both by design. The published accuracy moves when
this ships — the denominator changes from "readers who answered" to "readers with
a church to compare" — so treat the deploy as a discontinuity, the way the 0006
metric reset was documented; the panel prints the exclusion as a sentence
(`N of M said they were exploring`) rather than leaving it implied.
`familyJudged` / `matchJudged` will also shrink relative to the accuracy count as
the stance absorbs the coarse question, because an `exploring` reader skips the
pickers entirely.

The column is not backfilled: a stance reconstructed from an old rank would be a
guess written on the reader's behalf, and `/api/stats` would publish it as an
answer. It is not indexed either — every read of it happens inside the one
aggregate scan, so an index would never be chosen. The stance is also what will
decide whether a longer end-of-quiz journey is worth building: if `exploring` is
a large share of `stanceJudged`, exploration is the product; if it is a few
percent, the card stays this small.

**Which question goes where.** The card keeps the pickers for everyone, not only
for readers who said "not close": showing them only to misses would turn the
published breakdowns into a list of misses. Their escape hatches were reworded to
say coverage rather than fit — "none of these families", "not in this list" — so
`0` now means exactly one thing per level. Identity, goals and "what are you
looking for" questions are deliberately *not* here: they belong to an end-of-quiz
journey, where they can change the result, and a feedback card is the wrong place
to ask a question the page will not act on.

The card (`_PostQuizFeedback.tsx`) is mounted by `_QuizController.tsx` outside
`<main>`, so it is not part of the results the reader copies or prints. It shows
whenever there is a match to judge and the calculation finished — including on
`mod` "skip to a result" runs, which are the only way to inspect the form without
answering a whole quiz. What those runs stay out of is `/api/quiz/events` and the
public figures, and a rating submitted from one can be set to `hidden` in the
queue. Both the card and the `Was #1 right? ↓` link in the dashboard's closing
bar share one `feedbackEnabled` flag in `_QuizController`, so the link cannot
point at a card that is not there; the section carries
`id="feedback"` and takes its column from `WIDTHS.page` + `SHELL_GUTTERS` (the
same constants `Shell` uses) so it stays aligned with the dashboard above it.
The link's scroll offset comes from the existing `section[id]` rule in
`globals.css` (header height + 1rem); no per-section `scroll-mt-*` is needed.

**Idempotency.** The card generates one `sessionId` per mount and sends it as the
idempotency key; `feedback.session_id` carries a UNIQUE index and the insert is
`ON CONFLICT DO NOTHING`. A retry after a dropped response is the same row, so
`recorded: false` means "already have it", never "failed" — the client treats it
as a success and shows the thank-you. `frontend/lib/api.ts` keeps that mapping in
one place (`FeedbackOutcome`: `recorded` / `duplicate` / `failed`), and
`submitQuizFeedback` never throws: the card shows a `mailto:` fallback carrying
the rating, the stance and both positions in words, never the comment.

**Every answer is tri-state.** `null` means "skipped" and is stored as `NULL` in
`fit_stance`, `family_rank`, `match_rank_pos` and `accurate`, so a skip is in
neither the numerator nor the denominator of any published figure. The stance is
the one that carries meaning when answered: `exploring` is a *stored* answer that
reads back as `accurate = NULL`, which is why the queue prints it before the
boolean rather than replacing it. The UI lets the reader clear a pressed button by
pressing it again, and picking a different family clears the church under it — a
position in the old shortlist means nothing in the new one, so keeping it would
store an answer to a list the reader is no longer looking at. A value out of range
is context that is dropped rather than a `400` — the rating and the note are still
worth keeping, the stance falls back to the position, and the position falls back
to the old boolean, which is also the path an old client takes.

**Validation.** Rating must be an integer 1–5. The comment is trimmed, stripped
of control characters and truncated to 500 characters server-side (the textarea
counts to the same 500 client-side). `fitStance` is one of `FEEDBACK_STANCES`
(`fit`, `close`, `off`, `exploring`) and anything else — including a non-string —
is dropped to `NULL`. `familyRank` (0–`FAMILY_RANK_MAX` = 8) and `matchRankPos`
(0–`MATCH_RANK_POS_MAX` = 500) are the two positions; `mode`, `topMatchId`,
`topMatchName`, `answeredCount` and `appVersion` are context: optional, and
dropped rather than rejecting the submission if they fail their range.
`HOURLY_CAP = 120` rows an hour across the whole table is the only rate limit —
enough headroom that it never fires on real traffic, and it stops a script rather
than a retry (the session id already covers retries).

**What is published.** `GET /api/stats` gains a `feedback` object —
`total`, `averageRating`, `ratingHistogram[5]` (index 0 is one star),
`accurateYes`, `accurateNo`, two breakdowns each with the count of rows that
answered it (`familyJudged` + `familyRanks`, `matchJudged` + `matchRanks`, with
`top1`, `top3`, `top8`, `beyond` — always all four keys, zeros included), and the
stance as `stanceJudged` + `stanceCounts` (`fit`, `close`, `off`, `exploring`).
The rating figures count `rating_metric = 'experience'` rows only, and `total` is
their denominator, so the printed "4.2 out of 5, from 37 ratings" and the
histogram always agree. The top-1 pair and both breakdowns are unchanged in
scope — every non-hidden judged row — which is the point: the star reset does not
move them.

`stanceJudged` is the only denominator on the payload that is **not** a subset of
`accurateYes + accurateNo`: it is larger, by exactly the `exploring` rows, because
those rows answered this question and were left out of the accuracy split. That is
why it travels beside the counts instead of being inferred from them, and why
`topOneAccuracy()` in `frontend/lib/quiz-stats.ts` still divides
`accurateYes / (accurateYes + accurateNo)` — the exclusion already happened
server-side. `stanceBreakdown()` shapes the four counts into bars and hides below
`MIN_JUDGED` like every other figure, which matters on the deploy day when the
column is empty.

`familyRanks` is where the *family* sat; `matchRanks` is where the reader's own
*denomination* sat. The buckets are ranges — `=1`, `2-3`, `4-8`, and `beyond`,
which holds `0` (the coverage escape hatch) together with every position past the
eighth — so neither shortlist length is baked into the schema and the escape hatch
is counted as the answer it is rather than as a missing one.

Each breakdown is a *separate* measurement with its own denominator: only the
rows that answered that level. A reader who named a family and skipped the church
is in `familyJudged` and not in `matchJudged`, so the church denominator is
usually the smaller of the two. On any database holding pre-0007 answers both are
also smaller than `accurateYes + accurateNo`, because a legacy "no" answered the
yes/no without naming a position. Neither figure is wrong; the panel prints each
list with its own count and its own percentage instead of implying one total. No
comment, no row, no id ever leaves the table through the public endpoint:
`/api/stats` returns counts, an average and histograms. The landing panel
(`frontend/app/_components/_LiveStats.tsx`) prints the tile under **What readers
said** when *either* figure has ten answers: `total >= MIN_FEEDBACK` (10) for the
average and histogram, else `accurateYes + accurateNo >= 10` for the top-1 line
alone, else `stanceJudged >= 10` once the stance exists, with "Experience ratings
are still building" in place of the mean. The two sets of bars appear under the
histogram — "Where the closest family sat" first, then "Where their own church
sat" — once `familyRankBreakdown()` / `matchRankBreakdown()` in
`frontend/lib/quiz-stats.ts` have ten answers each to divide, and carry a `title`
explaining that skipped answers, and legacy "no" rows, are in neither list, and
that the church list is the shorter one because the second picker is optional. The
bars read `#1`, `#2–#3`, `#4–#8` and `none / #9+`: the last one is labelled for
both kinds of answer it holds, because on the family list the coverage escape
hatch is the only thing that can land there (the card offers eight families) while
on the church list a real ninth place does too. Between the histogram and those
bars, `stanceBreakdown()` adds one sentence — "N of M readers who answered said
they were exploring" — which is the only place the excluded readers are visible;
without it the top-1 denominator would silently be a different population from the
one above it. A payload without `feedback` still renders nothing, and a new rating
invalidates the 60s stats cache.

**Privacy line.** The `feedback` table stores no email, IP, user agent or cookie
— the rating, its metric, the stance, the two positions, the comment and the run's
context are the whole row. The landing panel says so, and says that comments are
read by a moderator and never published. The GA4 event is
`quiz_feedback_submitted` with `{ quiz_mode, rating, rating_metric, fit_stance,
family_rank, match_rank_pos, accurate, has_comment, outcome }` — shapes only; the
comment never leaves the request body. `rating_metric` is there for the same
reason as the SQL column: a GA4 average over `rating` alone would mix two
questions. `fit_stance` carries `"skipped"` for a cleared question, so the four
answers and the skip are all distinguishable in an export. `family_rank` and
`match_rank_pos` are the two precision dimensions, with `"skipped"` in place of a
cleared question so the skip is visible rather than missing. `accurate` stays in
the event as the derived yes/no — stance first, then position — so an exploration
built before the pickers keeps working, with `exploring` reported as `"skipped"`
because it is not a judgement about position 1.

**Reading the queue.** `GET /api/feedback` returns `data.counts`
(`new` / `reviewed` / `hidden` / `commented`) plus the rows, newest first, and
takes `?status=new|reviewed|hidden`, `?commented=1` (the rows carrying a note,
across all three statuses) and `?limit=` (max 200). `commented` is a separate
tally rather than a fourth status, because a note is a property of the row and
not a stage of review. It answers `401` without the header. Locally the code can
be the literal `mod`, because `expectedAdminCode()` in `src/roadmap.ts` falls
back to it when `ADMIN_CODE` is unset — in production set the secret and use
that:

```bash
# local, against `npm run dev` (:8787)
curl -s -H 'X-Admin-Code: mod' 'http://localhost:8787/api/feedback?limit=20' | python3 -m json.tool

# production
curl -s -H "X-Admin-Code: $ADMIN_CODE" "https://<worker-host>/api/feedback?status=new"

# or straight from the table
npx wrangler d1 execute theocompass-db --remote \
  --command "SELECT id, rating, accurate, family_rank, match_rank_pos, comment, created_at FROM feedback WHERE status = 'new' ORDER BY created_at DESC LIMIT 50"
```

`familyRank` and `matchRankPos` are integers or `null`, and `accurate` is derived
from the stance when there is one (`fit` → `true`, `close` / `off` → `false`,
`exploring` → `null`) and from the second position otherwise (`true` for `1`,
`false` for every other position, `null` for a skip). Each level is independent: a
row can name a family and no church, so the
queue prints them in the order the card asked — "closest family was #3, their
church was #5 in the list" — and shows whichever parts exist. The stance comes
before both when present ("not close to where they are; closest family was #1"),
because it is the sentence the published figure follows; `exploring` prints as
"exploring, no church to compare against" and is the one stance answer that is
absent from the accuracy split. `0` is the coverage escape hatch at either level
("none of the families listed" / "their church was not in the list") and is
printed as the answer it is. `null` in both positions is either a skip or a
submission from before the pickers existed: it is in neither `accurateYes` nor
`accurateNo` and in no bar of either breakdown. A legacy "no" has
`accurate = false` with both positions `null` — the row predates the question, so
the queue shows "no match fitted (stance and position not given)" instead of
guessing how far off it was — and a legacy "yes" has `accurate = true` with both
`null`, which it prints as "#1 was the best match", the only thing that row
actually said.
Each row also carries `ratingMetric` (`"experience"` / `"fit"`), which
`/mod/feedback` prints beside the stars — the same number means two things, so it
is never shown without it. A response from a worker deployed before `0006` has no
such field, and the page labels that as `match fit`, which is what those rows
are.

**Setting a status.** `PATCH /api/feedback/:id` takes `{ "status": "..." }` and
nothing else — the note is never editable through the API. `status` is a CHECK
constraint in the schema and a validation in the handler, so a fourth value is a
`400`; an id that does not exist is a `404`. `hidden` is the one status with a
public consequence: `/api/stats` filters it out, so the published figures move on
the next request (the write invalidates the 60s stats cache). Which one moves
follows the metric: an `experience` row leaves the average, the histogram and
the rating count; a legacy `fit` row leaves only the top-1 pair. Either way the
row leaves both breakdowns, because neither rank column is scoped by
`rating_metric`. The row stays in the table as evidence — nothing is ever
deleted.

```bash
curl -s -X PATCH -H 'X-Admin-Code: mod' -H 'Content-Type: application/json' \
  -d '{"status":"reviewed"}' http://localhost:8787/api/feedback/42
```

**The moderator page.** `/mod/feedback` (`frontend/app/mod/feedback/`) is the
same queue with one tri-state control per row, and the default view is the rows
that carry a note. It shares the roadmap's code through `frontend/lib/mod-code.ts`
— one `sessionStorage` key, so unlocking either page unlocks the other and Lock
in either header forgets it. There is no separate verify endpoint: the unlock
*is* a queue request, so a wrong code fails exactly where a wrong PATCH would,
and a `401` from any call drops the stored code. The page is `noindex`, absent
from `sitemap.ts`, and linked only from `_RoadmapHeader`, after the roadmap is
unlocked. Filtering is server-side (`?commented=1`, `?status=`) rather than a
`.filter()` over one page, which would hide notes past the limit.

**The landing figure.** `_QuizAccuracy.tsx` adds one row to the quiz card's
`<dl>`: `topOneAccuracy()` — `accurateYes / (accurateYes + accurateNo)`, which is
how often the *#1* match was the right one — with the denominator printed inline
and the number linked to `#collective-results`. Since 0008 the two counts behind
it come from the stance question first (`fit` yes, `close` / `off` no) with the
church's position as the fallback, so a row whose church was #1 but whose stance
was `off` is now a miss, and an `exploring` row sits on neither side of the
fraction. Skips still do too. The old export name `quizAccuracy` is kept as an
alias so an unchanged import cannot silently stop meaning the same figure. Both
the row and the panel below it read the payload through
`frontend/lib/quiz-stats.ts`, so a page view makes one `/api/stats` request, not
two; the row hides until `MIN_JUDGED` (10) answers are judged *and* the panel's own
`MIN_QUIZZES` gate is met, so it never links to a panel that is not there. The
panel it links to prints both breakdowns
under the star histogram — family first, then church — each with its own
denominator. Since 0008 the top-1 row is *not* the church `#1` bar restated: the
stance decides the row first, so a `#1 church, not close` answer is in the bar and
not in the numerator, and an `exploring` answer is in neither.

**Local demo data.** The landing tile only appears once `total >= 10`, which a
fresh local database never reaches, so `feedback_seed.sql` holds twelve fake
ratings (`session_id` `demo-0001`…`demo-0012`) that clear the gate. They clear the
other three gates as well, and deliberately not by the same margin: the stance is
7 `fit` / 2 `close` / 1 `off` / 2 `exploring`, so the top-1 figure is 7 of 10 =
70%; nine of the twelve named the right *family* first (90%, buckets 9 / 1 / 0 / 0)
while seven had their own *church* first (70% of 10 answers, buckets 7 / 1 / 1 / 1).
The family figure is therefore never the church figure restated — a reader whose
family came closest at #1 can still sit further down that family's shortlist,
which is exactly the distinction the two-level card was built to measure. The two
`exploring` rows carry no positions at all, because that is what the card lets a
reader with no church do:

```bash
cd theocompass-api
npm run db:seed-feedback-local    # 12 rows: avg 3.8, histogram [1,1,2,4,4], stance 7/2/1/2, family 9/1/0/0, church 7/1/1/1
npm run db:clear-feedback-local   # DELETE FROM feedback WHERE session_id LIKE 'demo-%'
```

Both are `--local` only — there is deliberately no `--remote` twin, and the file
is not part of `data:sync-local`. Re-running the seed is a no-op: `demo-*` hits
the unique session index and is skipped, exactly like a retried submission. The
insert is `ON CONFLICT DO NOTHING`, so it also can't overwrite a real row. The
stats payload is cached for 60s per isolate, so restart `wrangler dev` (or wait a
minute) before expecting the tile, or the top-1 row, to appear or disappear.

The demo rows take the column default (`rating_metric = 'experience'`), so they
still drive the tile. Three wrinkles for an existing local database: migration
`0006` relabels every row it finds, demo rows included, to `'fit'`, `0007` only
backfills `accurate = 1` → `match_rank_pos = 1` (never `family_rank`), so a row
seeded before the pickers has no position in either list and appears in neither
set of bars, and `0008` adds `fit_stance` *empty* on purpose — a stance guessed
from an old rank would be an invented answer. The seed cannot replace any of them,
because the session ids already exist. Run `db:clear-feedback-local` and then
`db:seed-feedback-local` once after migrating and the twelve rows come back as
experience ratings with all three breakdowns filled. (Remote has no demo rows to
worry about, and no `--remote` seed to run.)

The one local database the migration cannot repair is one that ran the *draft*
`0007`: wrangler records a migration by name, so the rewritten file never runs
again there and the table keeps the draft's `match_rank` text column and neither
new column. The header of `0007_feedback_match_rank.sql` carries the five
statements that bring such a database level (`ADD COLUMN` twice, the same
backfill, the two indexes); the stale `match_rank` column can stay, since nothing
reads it. Then clear and re-seed the demo rows as above. Remote never applied the
draft version, so `db:migrate-remote` needs none of this.

Migration `migrations/0005_feedback.sql` adds `session_id`, `answered_count`,
`top_match_name`, `app_version` and `status` to the table created in `0001`,
plus the unique session index and the created/rating indexes.
`0006_feedback_rating_metric.sql` adds `rating_metric` (`NOT NULL DEFAULT
'experience'`), relabels the rows that predate the change as `'fit'` and indexes
the column. `0007_feedback_match_rank.sql` adds `family_rank` and
`match_rank_pos`, backfills the unambiguous half of the history (`accurate = 1`
→ `match_rank_pos = 1`) and indexes both; it leaves a legacy "no" `NULL` rather
than guessing, and never invents a `family_rank`. `0008_feedback_fit_stance.sql`
adds `fit_stance` and nothing else — no backfill (a reconstructed stance would be
a guess), no index (every read is inside the one aggregate scan) — and from then
on `accurate` is derived from it first. All four are additive over the table
`0001` created, so a `data:sync-remote` re-seed keeps every rating.
`test/feedback.spec.ts` pins the storage shape (including
`rating_metric = 'experience'`, the stance and the position that derive
`accurate`), the derivation across all three wordings (stance beats position beats
the legacy boolean), `exploring` staying out of the accuracy split while being
stored, dropping a position that is not one, dropping a stance that is not one,
the legacy yes/no path, the two-level tri-state, the idempotent replay, the four
`400`s, truncation, the hourly `429` and the queue (with and without the code);
`test/stats.spec.ts` pins the aggregate, the `hidden` exclusion, the `fit`
exclusion, both sets of bucket counts with their own denominator, and the stance
counts with the one denominator that is larger than `accurateYes + accurateNo` —
a legacy row moves neither `total`, `averageRating` nor the histogram, while its
yes/no still moves `accurateNo` and it appears in no bar of any breakdown.

**Shipping it.** Three deploys, and `git push` is only the first: Pages rebuilds
the frontend from the push on its own (the card and `/mod/feedback` are live as
soon as that build finishes), but the worker and the schema do not follow it.
In `theocompass-api`, migrate *first* — the handlers write columns `0001` never
created, so a deployed worker against an unmigrated table fails every insert —
then deploy, with `ADMIN_CODE` already set as a secret:

```bash
cd theocompass-api
npm run db:migrate-remote      # 0005 + 0006 + 0007 + 0008, in order
npx wrangler deploy            # POST/GET /api/feedback, PATCH /api/feedback/:id, stats.feedback
```

`0006` is the one to watch: it relabels every existing rating `'fit'`, so the
published average restarts from zero while the top-1 figure does not move.
Ordering is safe in both directions — the column defaults to `'experience'`, so
a rating written by the old worker between the migration and the deploy is
labelled correctly, and an old worker reading the new column simply ignores it.
What is *not* safe is deploying the new worker before `0006`: the insert names a
column that does not exist yet and every submission fails.

`0007` is additive in both directions and still goes first: an old worker's
INSERT does not name `family_rank` or `match_rank_pos` (the row stores NULL,
which is exactly what a card that never asked the question should leave), while
the new worker's INSERT does — so a deploy without the migration fails every
submission. Its backfill only rewrites `accurate = 1` rows, so the published
top-1 figure is identical before and after it runs; both breakdowns start at
zero and fill as new answers arrive, and on a database that has only ever seen
the old card they stay empty rather than showing a fabricated split.

`0008` is the one that moves a published number. Same ordering rule (the new
INSERT names `fit_stance`, so migrate first), and the discontinuity is the point
rather than a bug: the accuracy denominator becomes "readers with a church to
compare" instead of "readers who answered", so expect the figure to change on the
first stance-answering day and read it from then on. Until answers arrive
`stanceJudged` is zero, the panel's exploring sentence does not render, and every
row keeps the `accurate` value it already had — which is also why the migration
needs no backfill and why a rolled-back deploy is harmless.

A stale worker is loud once you know the tell: every unknown `/api/*` path
answers `200` with `{"status":"TheoCompass API Active","version":"2.0"}`, so
`POST /api/feedback` against an undeployed worker *looks* like a success and
stores nothing. `submitQuizFeedback` therefore trusts only an explicit boolean
`recorded`, and `/api/stats` simply has no `feedback` key, which is how the
tile and the top-1 row stay quiet. A new frontend against an old worker is
quieter still: the queue has `ratingMetric` missing from every row and labels
them all `match fit`, which is exactly what they are. Smoke-test the live worker
with `GET /api/feedback` (a `401` means the route exists) and `POST` a rating
whose `sessionId` you can delete again — the insert invalidates the stats cache,
so a `total` that does not move is the second tell, and a stored
`rating_metric = 'experience'` on that row is the third.
