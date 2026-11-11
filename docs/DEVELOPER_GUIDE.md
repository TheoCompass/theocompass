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
* `answer_options`: Holds the answers linked to `question_id` and their theological labels.
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

## 6. Frontend State & Silence Logic
The frontend tracks user progress in a Next.js client component (`userAnswers` state). A unique mechanic is the **Silence options**, which bypass the standard Certainty/Tolerance sliders and auto-inject specific logic directly into the payload:
* **Apathetic Silence** ("Not relevant to me"): Injects Certainty 0, Tolerance 2. 
* **Hostile Silence** ("I reject this framing"): Injects Certainty 3, Tolerance 1. 
The backend handles these automatically, forcing neutral coordinates (50) and applying amplified distance penalties.

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
them for the landing-page strip. Nothing identifying is stored — no email, IP,
user agent or free text — only mode, answer count, top match, tolerance and
certainty.

The client sends a `sessionId` (a UUID generated per completion) and the unique
index on `quiz_events.session_id` makes the insert idempotent: a retry, or a
results screen that re-posts, cannot inflate the counters. The payload is
validated server-side — mode must be `quick`/`standard`/`deep`, `answeredCount`
1–200 — and optional fields that fail their range are dropped rather than
rejecting the whole event.

`frontend/app/_components/_LiveStats.tsx` fetches `/api/stats` once per page view
and renders nothing until at least 10 quizzes are recorded, or if the request
fails, so the landing page never waits on it and never shows a "0 quizzes taken"
badge. `GET /api/stats` is cached for 60s per isolate and 5 minutes at the edge;
a recorded event invalidates the isolate cache.

Migration `migrations/0003_quiz_stats.sql` adds the outcome columns and the unique
session index to the `quiz_events` table created in `0001`.

**Tests.** `cd theocompass-api && npm test` runs everything. The D1-backed specs
(`test/roadmap.spec.ts`, `test/stats.spec.ts`) apply the real migrations through
`test/setup.ts`; `vitest.config.mts` reads them with `readD1Migrations`, so the
suite always tests the schema that gets deployed.
