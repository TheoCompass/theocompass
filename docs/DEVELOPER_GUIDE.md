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

### The belief chip (`TheologicalLabelCloud`)
A belief chip states three independent facts, and the topic is the only one allowed to be a colour:

| Fact | Channel | Where |
| --- | --- | --- |
| Which topic | a 2px border in the category's hue, plus the topic's short word **on the chip** | both views; the word drops out in the topic view, where the accordion header directly above already names the topic |
| How essential | the tier's word, plus a three-step weight on the card frame (margin rail + numeral block) | the word is printed only in the topic view; the rail and the `1/5`–`5/5` numeral live on the heading that owns the group |
| How sure | how many of three ticks are filled | always |

Two rules make that safe, and both were learned the hard way — see the doc comments above `CERTAINTY_TEXT` in `lib/palette.ts`, which record four reverts of colour-coded *essentiality*. First, **no hue may be the only carrier**: everything coloured is also written, so the panel survives greyscale, a photocopier, and any colour-vision deficiency. Second, **ordinal data never gets a hue**: nine unordered topics suit a categorical palette, five ordered tiers do not — a rank may ride on value (ink, weight, the lightness of one hue), but never on a second hue, which would make five ranks read as five categories.

The rank is carried by the **frame, not the chip**. `tierWeight()` in `_constants.ts` folds the five tiers onto three weights — a 4px ink rail and an 11px filled numeral for core and primary, a 2px rail and a 10px filled numeral for secondary, no rail and an outlined numeral for tertiary and non-essential — and `_TierNumeral` renders the block so the cloud and the exported report cannot drift apart. Three steps rather than five, because readers rank about three levels of any ordering reliably — the plate below is the one channel that carries all five, and it argues its case there. Animation was the obvious alternative and the wrong one: it cannot be ordinal (nothing makes 0.35s read as "more essential" than 0.55s), it cannot be compared in a glance, html2canvas captures whichever frame it happens to catch, and the `prefers-reduced-motion` guard in `globals.css` deletes it outright — taking the encoding from exactly the readers who need the redundancy. The chip's only motion is a 1px hover lift, which encodes nothing.

The five tier cards sit on a **graded blue plate** (`--color-plate-1` … `--color-plate-5`, deepest at `1/5` core dogma, white at `5/5` non-essential) instead of the white used by every other panel. This is the one channel that carries all five steps, and it is allowed to because a tint is glanced at rather than compared: a reader who cannot separate `plate-2` from `plate-3` has lost nothing, while the rail still ranks the cards in three — and in the same direction, so the two never disagree. Each step is the same blue mixed into white at 0 / 25 / 50 / 75 / 100%, so the ordering lives in lightness alone: 21.6 L* of span in four even steps (~5.4 each), wide enough that five cards read as one scale rather than as five unrelated panels, and it survives greyscale, a photocopier and the html2canvas rasterisation of the report without ever claiming to be categorical. The pale end is paper white, so a non-essential card costs the printer nothing at all. Its floor is measured rather than chosen — the rail *is* the navy ink, so a navy ground would erase it (1.00:1), the 11px tier line is `text-ink-muted`, which falls to 2.21:1 on navy, and a chip's wash must stay lighter than the ground it sits on; at `plate-1` the rail and ink keep 6.74:1 (past that the rail stops being the loudest line on the card) and the washes still clear 1.69:1. Header strips are deliberately *not* tokens: each is `bg-white/75` over its own body, so the strip is the ground bleached, `plate-1`'s lands on `#e9f0f8`, and `text-ink-muted` holds 4.88:1 on every step — the ramp can move without re-auditing the header, and on the white card the strip is simply the body, with the hairline under the header doing the dividing. The outlined numeral is filled `transparent` for the same reason, so it shows the plate and not a honeydew block.

The colours come from `categoryTints()` in `lib/palette.ts`, which returns the border hue, the wash behind it and the hover wash as **resolved hexes**. Do not hand these to `var(--color-cat-*)` inside an inline style — the exported report is rasterised by html2canvas, which cannot read them there. `HUE_WASH` in that file is the single number deciding whether a tier of chips reads as a soft panel or as a rainbow; the filter row above the cloud uses the same border hues in the same order, so it doubles as the key.

The topic view's groups start **open**; a closed group is the reader's own choice. The state is therefore the *collapsed* set, not the expanded one: seeding an expanded set means every group that was not in the first snapshot — labels arriving after mount, or a group a search reveals — starts shut, which is the exact "empty shelf" the default is meant to remove. The importance view has no accordion at all, because there the tier cards are the structure.

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
back. `updated_at` is bumped only for rows whose content actually changed — a
null-safe `CASE` (`name IS NOT excluded.name OR …`) on every upsert, with
`status` in the comparison only under `--reset-status` — so an unchanged re-run
is a true no-op and a sync can no longer overwrite the timestamp a moderator's
PATCH just wrote.

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
never waits on it and never shows a "0 quizzes taken" badge. The request is
memoised in `frontend/lib/quiz-stats.ts`, because three components now quote the
same payload — the panel, the accuracy row in the quiz card, and the hero strip —
so a page view still makes one `/api/stats` request.

**Above the buttons.** `_HeroStats.tsx` states the headline figures in one line
between the intro and "Take the quiz", because a reader who never scrolls past the
hero would otherwise never learn that other people have already taken the quiz. It
is deliberately compact — values with a shortened label each, no notes, and a
"See how that's counted" link to `#collective-results` ("1,284 runs recorded ·
74.5% median match · 4.3 / 5 quiz rating"). The denominators stay in the panel's
summary row; a strip is a pointer, not the published table. Its slot keeps a
reserved height (`min-h-9 sm:min-h-5`) whether or not the payload arrives, so a
late response cannot push the two buttons down while a thumb is aiming at them.
Like the panel it renders nothing below `MIN_QUIZZES` and nothing on failure.

**One gate, both surfaces.** The hero strip and the panel's summary row both map
over `collectiveFigures()` in `lib/quiz-stats.ts`, which is where the thresholds
live: runs always (the card only exists above `MIN_QUIZZES`), the median closest
match from `BREAKDOWN_RUNS` — 50, moved here from `_LiveStats.tsx` so the strip
cannot print a median the closeness tile is still withholding — and the star
average from `MIN_FEEDBACK` ratings. A figure that has not cleared its gate is
absent from the list rather than present as a dash, so neither surface can print
it early and changing a threshold cannot leave the other surface quoting the old
number.

**Tile order is a layout decision, not a ranking.** At two columns the tiles were
placed in reading order, which put the tallest one (feedback: rating, histogram,
two rank ladders) beside a short one: the short card stretched to the tall card's
height and its footer sank to the bottom of a hollow box, and the remaining tile
ended up alone in a half-empty row. Feedback now closes the grid as a full-width
band — rating on the left, the two ladders side by side on the right — while runs
pairs with closeness and family shares with the posture averages, the pairs whose
content is closest in size. Below the 50-run gate the same grid is a stack of
full-width bands (runs, feedback, the unlock panel): a half-width volume card
there would sit beside an empty cell, because the band under it is too wide to
fit. Rows still stretch their tiles to a common height, but the leftover space is
now a line or two rather than half a tile.

Everything else is a disclosure: "See the full breakdown" expands the tiles and
the counting notes in place, with `aria-expanded`/`aria-controls` and `inert`
while closed, so the nested `<summary>` in the notes is not reachable by tab. The
accuracy row in the quiz card links to `#collective-results`, and the hash opens
the disclosure, so the figure never points at hidden content; the click also calls
`openCollectiveResults()` from `lib/quiz-stats.ts` (which fires
`OPEN_COLLECTIVE_RESULTS`), because a repeat click on an unchanged hash produces
no `hashchange`. The hero strip uses the same function, so both entry points
behave the same way.

The full breakdown has three states:

* **10–49 runs** — total, the 14-day sparkline, the feedback band, and a
  progress panel that says how many runs unlock the rest. All three cards are
  full-width bands, the volume tile included.
* **50–199 runs** — all five tiles, plus an "Early data" label.
* **200+ runs** — all five tiles, label gone.

The tiles are: runs (total, 14 UTC days, last 7 days, today), feedback (star
average and histogram, the two rank curves, and the top-1 line — see below),
closeness (median/mean closest match and the five-tier distribution), family
shares (top five families plus an explicit "Other families" remainder), and
posture (tolerance/certainty averages, taken only over runs that answered both
sliders). Every percentage names its own denominator.

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
four answers, 0008), which denomination on the list is closest to their church
(one picker, 0007) and an optional comment — from the card that sits under the
results dashboard. `GET /api/feedback` is the moderator queue behind it, behind
the same `X-Admin-Code` as the roadmap editor and the report queue.

**One rating, two questions.** The stars used to ask *how close the match felt*.
They now ask *how the quiz felt overall*, which is a different measurement, so
rows carry `feedback.rating_metric` (`'experience'` for everything the handler
writes, `'fit'` for the rows that predate the change — labelled by
`migrations/0006_feedback_rating_metric.sql`). Only `'experience'` rows feed the
published `total`, `averageRating` and `ratingHistogram`; the match question
never changed its meaning, so `accurateYes` / `accurateNo` still span every judged
row, reset or no reset — though the published top-1 figure no longer divides them
(the stance section below says why). Nothing is deleted and nothing is hidden: the
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

It is now a position the reader can give without translating anything: **the
closest denomination's place in the full results list** (`match_rank_pos`,
whatever family it belongs to), with `0` — "none of these are close" — as the
escape hatch. That is a judgement about the list, not a skip.
`migrations/0007_feedback_match_rank.sql` adds it (along with `family_rank`) and
indexes it. Integers rather than a text enum on purpose: a place is a number, so
nothing in the schema depends on how long the list is, and a longer card needs no
migration at all.

The picker asks for the closest **denomination**, not for "your church", and that
wording is part of the design. The list is the database's rows, and a row is never
a congregation: under the old label a reader with First Baptist Church of
Scottsbluff did what the label said, found nothing, and answered "not in this
list", which made the escape hatch the modal answer and left the histogram saying
more about how the list is spelled than about where readers are. Asking for the
nearest denomination — "Baptist", whichever Baptist row is closest — puts the
ordinary answer back on the list, and leaves `0` meaning what it says: none of the
230 are close, because the reader is unaffiliated, of another faith, or in a
tradition the database does not hold. That bucket is the clearest signal we have
about what to add, so the panel prints it as its own count beside the curve rather
than plotting it.

**The family is read, never asked.** Every denomination in the bundle is filed
under exactly one family, and that family is a row of the list the dashboard
prints, so naming the closest denomination answers both questions at once. The
card prints the consequence under the pick — *"Filed under Reformed — #2 of 30
traditions this run"* — and `family_rank` travels as that family's place, with
`familyName` beside it. There is no second question any more: the card asked for
the family directly in the two-picker version, then only as a fallback box behind
"not in this list", and both are gone. The fallback was the stranger of the two —
it appeared exactly for the readers whose church was missing, and once the picker
asks for the closest denomination, those readers can answer on the list after all.

So a skipped pick sends `NULL` for both family fields, and the two numbers can
never disagree because one pick produces both. `family_rank` is still stored and
still returned by `GET /api/feedback`: it is context for the queue (a denomination
at #77 whose family is #4 says something the position alone does not), and the row
is the record of what the card answered. It is not published as a curve of its own,
because that curve would be `matchRanks` regrouped — the same readers counted twice
— and a figure that moves whenever another one moves is not a second measurement.
That is also why there is no `family_source` column: only one kind of family answer
is left, so a marker distinguishing "derived" from "asked" would have nothing to
distinguish.

The picker lists the **whole** list it is about: all 230 denominations in the order
the quiz ranked them, not one family's contents. That is the rework that retired the
old `FAMILY_OPTIONS` / `CHURCH_OPTIONS` shortlists of eight and five. With 230
denominations in the database, a five-row list could only ever hold the head of the
ranking, and `#4–#8` said nothing about whether the reader's denomination was ninth
or two-hundredth.

It is `PickerBox` in the card: a text field, the list opening inside the same
border underneath it, and the chosen row printed between the two with a `Clear`
button. The family control used to be a native `<select>`, grouped by tradition
(`FAMILY_TO_GROUP`) — thirty options with a rank above each name is a wall of text
on a phone — but a select cannot be typed into on most platforms, cannot report
which row is highlighted, and made the two questions look like two different kinds
of answer. 230 options need a way in that a browser's prefix type-ahead does not
reliably give, so the field is the way in. The list is on screen whenever the field
has focus and narrows as the reader types, so typing and picking are the same
control rather than a search box beside a select. It follows the ARIA
editable-combobox pattern (`role="combobox"` with `aria-expanded`,
`aria-controls`, `aria-activedescendant="…-o<index>"` and
`aria-autocomplete="list"` over a `role="listbox"` of `role="option"` rows), with
↑/↓ walking the list, Home/End jumping to its ends, Escape closing it, and Enter
taking the highlighted row — always `preventDefault`-ed, because the field sits
inside a `<form>` and Enter there would otherwise submit the card before a row was
picked. Nothing is highlighted until the reader types or arrows, so Enter in an
untouched field cannot record whoever happens to be first as their answer.
`frontend` has no headless UI dependency, so this is the one control in the app
whose ARIA contract is written by hand — which is why the roles and the keys are
spelled out here as well as in the component.

The field narrows the *options* only: the value on the wire is still a position
read off the list, matched on a folded name (NFD, accents stripped, lowercased), so
a name typed into it can never become an answer. The answer itself is kept as the
row's **id**, not its number, and printed in the box, so "active only" may renumber
the list under an answered card without the answer following the wrong row, and a
row that falls off the list is named in the status line instead of quietly becoming
a skip. `0` stays last and always offered, so a query that matches nothing still
has an answer. The control prints the place it will send underneath ("#9 of 230
denominations this run"), so the number on the wire is never a mystery.

The ranks are positions in the lists *on screen*: `_QuizController` hands the card
the filtered lists (`filterFamiliesByActive` / `filterDenomsByActive`), so "active
only" moves the page's numbering and the picker together and a hidden tradition
never keeps a place in the count. The denomination list is `results` in full,
numbered by each row's index there — so an option can read `#22`, and the number on
it is still the number on the page. The family position takes its number from the
filtered `familyMatches`, which is what makes the derived number on the card ("#2
of 30 traditions this run") the one that reaches the API: the card looks the picked
row's `family` string up in `familyMatches` and sends that index. A denomination
absent from the visible list is simply not offered, and the reader sends the escape
hatch instead of an invented position.

`accurate` is *derived*, never asked twice: the stance when the row has one
(0008), otherwise `match_rank_pos` (`1` → 1, anything else → 0), otherwise the
boolean an old bundle sends, and `NULL` when nothing was answered. The column is
now a per-row record — the queue prints it, and `accurateYes` / `accurateNo` still
ship on `/api/stats` for clients built before this change — but it is **not** what
the published top-1 figure divides. That figure is `topOneMatch()` in
`frontend/lib/quiz-stats.ts`, and it reads `stanceCounts`: `fit` over
`fit + close + off`. The reason is the reason the stance exists — a legacy "yes"
may have meant "close", and a boolean has no room to say so, so dividing the
pooled pair published a number that overestimated itself and that no arithmetic
can undo after the fact. A tab still running the old card keeps working; its
answer simply lands in the legacy pair. The backfill is deliberately
one-directional: `accurate = 1` becomes `match_rank_pos = 1`; a legacy "no" leaves
both columns `NULL`, because it never said how far off it was and writing a guess
would invent an answer the panel would then publish. `family_rank` is never
backfilled at all — it is read off the picked denomination, so a legacy row has
nothing to derive it from. `fit_stance` is not backfilled
either (see below). The 0007 indexes are there for the queue's future filters,
not for `/api/stats`, which sums the whole table in one pass.

**The stance question (0008).** Everything above asks the reader to place *their
church* in a list. That question has no answer for a curious reader, a seeker, or
someone doubting the tradition they were raised in, and their two exits both
lied: the picker's escape hatch `0` was stored as a *miss* and pulled the
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
| `NULL`       | from rank / legacy boolean | no    | neither             |

The last row is the change this section is about: a pre-0008 answer is still
stored, still printed in the queue and still counted in `accurateYes` /
`accurateNo`, but it is outside the published percentage, because "yes" does not
say whether the reader meant *exactly* or *close*. Guessing on their behalf would
be worse than a smaller sample.

That makes one answer recordable that never was: *#1 as the closest denomination,
yet the match is `off`* — the reader who says "the top match describes me better
than the church I belong to". Under the old wording that row was a hit (the top row
was where their church sat) and the disagreement was invisible. It is now a miss
with a rank of 1.

Two consequences to expect, both by design, and both worth a line in the deploy
notes. First, the population changes: every pre-0008 row leaves the fraction,
because its boolean cannot be split into "exactly" and "close" — those rows stay
in the table, in the queue and in `accurateYes` / `accurateNo`, and they simply
stop being divided. Second, the numerator changes with it: **only `fit` counts as
a hit**, so a legacy "yes" that may have meant "close" no longer inflates it. The
figure now measures one thing — "the #1 match is exactly where they are" — over
one population: readers who compared the match with their own church. Both
exclusions are printed rather than implied: the panel says `N of M said they were
exploring`, and the sentence holding the percentage prints the `close` share
beside it (`; another 31% called it close`).

Do not compare the new number with the old one, and do not promise a direction:
removing an ambiguous "yes" from the numerator and legacy "no"s from the
denominator can move it either way. Expect the row and the sentence to disappear
for a while — the figure hides below ten comparisons, exactly like the rank
curve, which on a database full of pre-0008 answers means "until ten people
answer the four-answer question". `matchJudged` shrinks too, for its own reason:
an `exploring` reader skips the picker entirely.

The column is not backfilled: a stance reconstructed from an old rank would be a
guess written on the reader's behalf, and `/api/stats` would publish it as an
answer. It is not indexed either — every read of it happens inside the one
aggregate scan, so an index would never be chosen. The stance is also what will
decide whether a longer end-of-quiz journey is worth building: if `exploring` is
a large share of `stanceJudged`, exploration is the product; if it is a few
percent, the card stays this small.

**Which question goes where.** The card keeps the picker for everyone, not only
for readers who said "not close": showing it only to misses would turn the
published breakdown into a list of misses. Its escape hatch is worded to say
coverage rather than fit — "none of these are close" — so `0` means exactly one
thing: the list did not cover the reader. Identity, goals and "what are you
looking for" questions are
deliberately *not* here: they belong to an end-of-quiz journey, where they can
change the result, and a feedback card is the wrong place to ask a question the
page will not act on.

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
neither the numerator nor the denominator of any published figure.
The stance is the one that carries meaning when answered: `exploring` is a
*stored* answer that reads back as `accurate = NULL`, which is why the queue prints
it before the boolean rather than replacing it. The UI lets the reader clear a
pressed button by pressing it again. The position carries its family with it: one
pick produces `match_rank_pos` and `family_rank` together, so there is no way for
the two to disagree, and clearing the pick clears both. A
position that is no longer in the list on screen — turning "active only" on
shortens the list under an answered card — is treated as a skip by the card and
dropped by the handler, so a stale place is never submitted. A value out of range
is context that is dropped rather than a `400` — the rating and the note are still
worth keeping, the stance falls back to the position, and the position falls back
to the old boolean, which is also the path an old client takes.

**Validation.** Rating must be an integer 1–5. The comment is trimmed, stripped
of control characters and truncated to 500 characters server-side (the textarea
counts to the same 500 client-side). `fitStance` is one of `FEEDBACK_STANCES`
(`fit`, `close`, `off`, `exploring`) and anything else — including a non-string —
is dropped to `NULL`. `familyRank` and `matchRankPos` are the two positions: `0` is
the escape hatch at either position, and the upper bound is the length of the list
they name once the bundle is readable, or `FAMILY_RANK_MAX` (64) /
`MATCH_RANK_POS_MAX` (500) when it is not. `familyName`, `matchName` and
`matchRankScope` are the context that makes that check possible (see below);
`mode`, `topMatchId`, `topMatchName`, `answeredCount` and `appVersion` are context
too: optional, and dropped rather than rejecting the submission if they fail
their range.
`HOURLY_CAP = 120` rows an hour across the whole table is the only rate limit —
enough headroom that it never fires on real traffic, and it stops a script rather
than a retry (the session id already covers retries).

**The labels are context, not answers.** The card sends three more fields beside
the positions: `familyName`, `matchName` and `matchRankScope` (the length of the
denomination list it printed). None of them is stored and no migration adds a
column — they exist so a position can be checked against the list it claims to be
a place in. `theocompass-api/src/vocabulary.ts` reads the same KV entry
`/api/calculate` serves (`denomination_profiles`): the families are its `families`
keys, the churches its `denominations[*].denomination.name`, with the same
`name || denominationname` fallback the results page uses, and nothing else — the
index deliberately holds no family membership, so the position check stays a check
of "is this a row of a list this worker can print" and never grows into a second
opinion about which family a church is in. It caches the index per isolate in
its own module, separately from `index.ts`'s profile cache — importing that one
here would make the two circular, and a stale index only ever makes this check
stricter.

What that buys is the check a numbers-only body cannot pass: a tab left open
across a re-seed, or a body that was never a card, names a family or a denomination
this data does not have, so the position beside it is dropped to `NULL` and the
rating and the note are kept. Two narrower rules come from the same index: a
position is bounded by the length of the list it names (the constants above are now
only the fallback) and `matchRankScope` drops a denomination position past the end
of the list it was counted in. The pair itself is not checked against each other:
the current card always sends the picked row's own family (so the pair agrees by
construction), but an older tab may still send "family #4, church #77" where row
#77 sits in family #9, and the rule that used to drop it is gone. A missing or
unreadable bundle degrades to the numeric bounds, exactly as the handler behaved
before the names existed, and a failed read is not cached, so a namespace seeded
later is picked up by the next submission. Junk in any of the three is dropped
rather than answered with a `400`, like every other optional field.

**What is published.** `GET /api/stats` gains a `feedback` object —
`total`, `averageRating`, `ratingHistogram[5]` (index 0 is one star),
`accurateYes`, `accurateNo`, one rank tally with the count of rows that answered it
(`matchJudged` + `matchRanks`; the tally is `counts`, `none`, `ranked`, `median`,
`p25`, `p75`, `p90` — always every key, so the client never reads `undefined`), and
the stance as `stanceJudged` + `stanceCounts` (`fit`, `close`, `off`,
`exploring`).
The rating figures count `rating_metric = 'experience'` rows only, and `total` is
their denominator, so the printed "4.2 out of 5, from 37 ratings" and the
histogram always agree. The rank tally keeps its scope — every non-hidden judged
row — which is the point: the star reset does not move it.

`accurateYes` / `accurateNo` are the legacy pair: they span every judged row, old
ones included, so they pool the pre-0008 booleans with the rows that replaced
them. Nothing public divides them any more. The published figure is
`topOneMatch()`, which reads `stanceCounts` — `fit` over `fit + close + off` — so
"close, but not quite" is a printed near-miss rather than a hit, `exploring` is in
no part of the figure, and a legacy yes/no cannot inflate it. The two fields stay
on the payload because the queue and older frontend bundles still read them.

That makes `stanceJudged` the widest denominator on the payload: it is
`accurateYes + accurateNo` grown by exactly the `exploring` rows, because those
rows answered this question and were left out of the accuracy split.
`stanceBreakdown()` shapes the four counts into a tally and hides below
`MIN_JUDGED` like every other figure, which matters on the deploy day when the
column is empty; `comparedCount()` is the same three-bucket sum without the gate,
because the panel prints "2 so far" while the figure is still withheld.

`matchRanks` is where the closest denomination the reader picked sat — the only
rank figure on the payload. It is a `RankTally`: `counts` (sparse, place →
answers), `none` (the escape hatch, `0`), `ranked`, and four quantiles. No buckets.
A bucket like `4-8` stopped being a description the moment the card offered all 230
denominations — nearly every answer was "9 or deeper" — so `/api/stats` publishes
the distribution itself and the panel draws it. There is no family tally beside it:
the family is read off the pick, so a family histogram would be this one regrouped,
the same readers counted twice, and one tap should not move two figures.

The tally comes from its own `GROUP BY match_rank_pos` statement with the same
scope as the headline (rated, non-hidden), and `matchJudged` is `ranked + none`
rather than a second `SUM(CASE ...)`, so a denominator cannot disagree with the
curve above it. The escape hatch is counted and kept *out* of `counts`: "none of
these are close" is a statement about coverage, and a fake `#0` on the axis would be
a place nobody picked. The quantiles are computed server-side (`quantileRank()` in
`src/quiz-stats.ts`) and are places, never averages of places: the median is the
smallest place whose cumulative share reaches 50%, so a two-answer tie between #1
and #4 has a median of #1 rather than a `#2.5` nobody could pick. That convention
is pinned by a test.

The tally is its own measurement with its own denominator: only the rows that
answered it. On any database holding pre-0007 answers it is also smaller than
`accurateYes + accurateNo`, because a legacy "no" answered the yes/no without
naming a position. Neither figure is wrong; the panel prints the level with its own
count instead of implying one total. No comment, no row, no id ever leaves the
table through the public endpoint: `/api/stats` returns counts, an average and
histograms. The landing panel (`frontend/app/_components/_LiveStats.tsx`) prints the
tile under **What readers said** when *either* figure has ten answers:
`total >= MIN_FEEDBACK` (10) for the average and histogram, else the legacy
`accurateYes + accurateNo` pair (kept so a pre-0008 database still gets its tile and
stars), else `stanceJudged >= 10` once the stance exists, with
"Experience ratings are still building" in place of the mean. The sentence under
the tile that quotes the #1 share is `topOneMatch()` itself rather than a second
division of the same counts, so the panel cannot print a percentage the accuracy
row above it refused; below ten comparisons it prints how many are in so far
(`comparedCount()`), and it prints the `close` share beside the percentage — `50%
of 16 readers who compared said the #1 match is exactly where they are; another
31% called it close` — so the strict numerator cannot read as a worse quiz than
the four answers describe.

The curve appears beside the histogram — "Where the closest denomination sat" —
once `matchRankCurve()` in `frontend/lib/quiz-stats.ts` has ten answers, and is
drawn by `frontend/app/_components/_RankCurve.tsx`. That component is hand-drawn
SVG (no `recharts`, which is already in the bundle for the results page but not
worth shipping here): a step ECDF over the places people actually picked, a rule at
50% labelled with the median, and a shaded band from the deepest round place before
the deepest pick — `#50` on an axis that ends at `#140` — labelled `% past #n`. The
axis ends at the deepest pick rather than at the length of the list, because the
payload does not know that length and a place nobody reached is not data; the
caption carries the median, the interquartile range, the tail share and the `none`
count. Screen readers get the same numbers as a sentence in the `aria-label`. The
old bars read `#1`, `#2–#3`, `#4–#8` and `none / #9+`, and the last one was where
nearly every real answer landed — which is exactly what the curve replaced.
Between the histogram and the curve, `stanceBreakdown()` adds one sentence — "N of
M readers who answered said they were exploring" — which is the only place the
excluded readers are visible; without it the top-1 denominator would silently be a
different population from the one above it. A payload without `feedback` still
renders nothing, and a new rating invalidates the 60s stats cache.

**Privacy line.** The `feedback` table stores no email, IP, user agent or cookie
— the rating, its metric, the stance, the two positions, the comment and the run's
context are the whole row. The family and denomination names that checked those
positions never reach the row either: they are used inside the request and
dropped. The landing panel says so, and says that comments are read by a
moderator and never published. The GA4 event is
`quiz_feedback_submitted` with `{ quiz_mode, rating, rating_metric, fit_stance,
family_rank, match_rank_pos, accurate, has_comment, outcome }` — shapes only; the
comment never leaves the request body. `rating_metric` is there for the same
reason as the SQL column: a GA4 average over `rating` alone would mix two
questions. `fit_stance` carries `"skipped"` for a cleared question, so the four
answers and the skip are all distinguishable in an export. `family_rank` and
`match_rank_pos` are the position and its tradition, with `"skipped"` in place of a
cleared question so the skip is visible rather than missing — the family is context
in the export exactly as it is in the queue, because it is the same pick.
`accurate` stays in the event as the derived yes/no — stance first, then position —
so an exploration built before the pickers keeps working, with `exploring` reported
as `"skipped"` because it is not a judgement about position 1.

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

`familyRank` and `matchRankPos` are integers or `null`: the first is the tradition
of the denomination the reader picked (context, read off the row), the second its
place in the list, and `accurate` is derived
from the stance when there is one (`fit` → `true`, `close` / `off` → `false`,
`exploring` → `null`) and from the second position otherwise (`true` for `1`,
`false` for every other position, `null` for a skip). The family position arrives
with the denomination rather than beside it, because the card reads it off the
pick: a row that named no denomination has neither, and an old row that asked the
family question itself may have one without the other. The
queue prints the position first and the tradition as a gloss — "nearest
denomination #5 in the list (tradition #3)" — and shows whichever parts exist. The
stance comes before both when present ("not close to where they are; nearest
denomination #1 in the list"), because it is the sentence the published figure
follows; `exploring` prints as "exploring, no church to compare against" and is the
one stance answer that is absent from the accuracy split. `0` is the coverage
escape hatch ("none of the listed denominations were close") and is printed as the
answer it is. `null` in both positions is either a skip or a submission from before
the pickers existed: it is in neither `accurateYes` nor `accurateNo` and not on the
curve. A legacy "no" has
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
row leaves both rank tallies, because neither rank column is scoped by
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
`<dl>`: `Top 1 match exactly right` — `topOneMatch()` in
`frontend/lib/quiz-stats.ts`, which is `fit` over `fit + close + off` — with the
denominator printed inline (`of 16 who compared`) and the number opening the
`#collective-results` disclosure below. Only `fit` is a hit. The four answers are
the reason: "close, but not quite" says the right tradition and the wrong
denomination, which is not the #1 match being right, and the old boolean had
nowhere to put it except "yes". `exploring` (nothing to compare) and pre-0008 rows
(a "yes" that
cannot be split) are outside both halves of the fraction; the panel below prints
the `close` share and the `exploring` count so the exclusions are visible rather
than implied. A row whose denomination was #1 but whose stance was `off` is a miss
— still on the rank-1 point of the curve, off the numerator — which is the
disagreement 0008 exists to record. Both this row and the panel read the payload
through `frontend/lib/quiz-stats.ts`, so a page view makes one `/api/stats`
request, not two; the row hides until `comparedCount()` reaches `MIN_JUDGED` (10)
*and* the panel's own `MIN_QUIZZES` gate is met, so it never links to a panel that
is not there. The panel it links to draws the rank curve under the star histogram,
with its own denominator and its `none` count beside it.

**Local demo data.** The landing tile only appears once `total >= 10`, which a
fresh local database never reaches, so `feedback_seed.sql` holds eighteen fake
ratings (`session_id` `demo-0001`…`demo-0018`) that clear the gate. They clear the
other three gates as well, and deliberately not by the same margin: the stance is
8 `fit` / 5 `close` / 3 `off` / 2 `exploring`, so the top-1 figure is 8 of 16 =
50% — `fit` only — with the panel's own sentence printing "another 31% called it
close" from the five `close` rows beside it; nine of the sixteen who answered
named their *family* first (median #1) while seven named their own *church* first
(median #2). The family figure is therefore never the church figure restated — a
reader whose family was #1 can still have their own church further down the list,
which is exactly the distinction the two-level card was built to measure. The two
`exploring` rows carry no positions at all, because that is what the card lets a
reader with no church do, and one row carries the escape hatch (`0`/`0`), so the
curve's "not listed" clause has a number behind it.

The six deep rows (`demo-0013`…`demo-0018`) exist for the curve: family places
6, 11, 18 and 25, church places 22, 47, 96 and 140. Without them every answer piles
up at #1 and the ECDF is a vertical line against the left edge — the median rule
never moves and the shaded tail is empty. With them the panel reads "Median #1 ·
half between #1 and #6 · 7% past #20" for families and "Median #2 · half between
#1 and #22 · 7% past #100" for churches, which is what the chart is meant to say:

```bash
cd theocompass-api
npm run db:seed-feedback-local    # 18 rows: avg 3.5, histogram [1,2,6,5,4], stance 8/5/3/2, family median #1, church median #2
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
seeded before the picker has no position and appears on no curve, and `0008` adds
`fit_stance` *empty* on purpose — a stance guessed
from an old rank would be an invented answer. The seed cannot replace any of them,
because the session ids already exist. Run `db:clear-feedback-local` and then
`db:seed-feedback-local` once after migrating and the eighteen rows come back as
experience ratings with the curve and the stance filled. (Remote has no demo rows
to worry about, and no `--remote` seed to run.)

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
on `accurate` is derived from it first. There is no `0009`: the family is read off
the pick, so the marker that distinguished a derived family position from an asked
one was never needed. All four are additive over the table
`0001` created, so a `data:sync-remote` re-seed keeps every rating.
`test/feedback.spec.ts` pins the storage shape (including
`rating_metric = 'experience'`, the stance and the position that derive
`accurate`), the derivation across all three wordings (stance beats position beats
the legacy boolean), `exploring` staying out of the accuracy split while being
stored, dropping a position that is not one, dropping a stance that is not one,
the legacy yes/no path, the tri-state, the idempotent replay, the four
`400`s, truncation, the hourly `429` and the queue (with and without the code);
`test/feedback-vocabulary.spec.ts` covers the list check: a position whose name the
bundle does not hold is dropped while the rating lands, a body with no names keeps
its positions, and an unreadable bundle falls back to the numeric bounds.
`test/stats.spec.ts` pins the aggregate, the `hidden` exclusion, the `fit`
exclusion, the rank tally with its own denominator and its quantiles (a
two-answer tie takes the lower middle *place* rather than a fraction), and the
stance counts — `fit` / `close` / `off` / `exploring` with `stanceJudged` their
sum, the three buckets `topOneMatch()` divides and the `exploring` answer that is
in no part of it. A legacy row moves neither `total`, `averageRating` nor the
histogram, while its yes/no still moves `accurateNo` and it appears on no curve.

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
top-1 figure is identical before and after it runs; the curve starts empty and
fills as new answers arrive, and on a database that has only ever seen the old card
it stays hidden rather than showing a fabricated split.

`0008` is the one that moves a published number. Same ordering rule (the new
INSERT names `fit_stance`, so migrate first), and the discontinuity is the point
rather than a bug: the accuracy denominator becomes "readers with a church to
compare" instead of "readers who answered", so expect the figure to change on the
first stance-answering day and read it from then on. Until answers arrive
`stanceJudged` is zero, the panel's exploring sentence does not render, and every
row keeps the `accurate` value it already had — which is also why the migration
needs no backfill and why a rolled-back deploy is harmless.

This release re-frames the picker's question and deletes the family question, and
it *shrinks* the escape-hatch bucket without touching the schema. The worker and
the Pages build go out in the same window, worker first: a new bundle against the
old worker still submits `familyRank` and `matchRankPos` (the old handler reads
both, and it no longer sends `familySource`, which the old handler treats as an
older card — harmless), while an old bundle against the new worker sends a
`familySource` the handler now ignores. Expect the `0` bucket in `matchRanks` to
fall sharply once the new card is live: the old wording ("your church") sent
readers with a local congregation to the coverage answer, and the new one ("which
denomination is closest to your church") lets them name the nearest row instead.
`familyRanks` disappears from the payload at the same moment, so a cached panel
from before the deploy draws no family curve on the next load rather than printing
a number that no longer exists.

The release that replaced the four buckets with a `RankTally` adds no migration
and no column, but it does move the payload, so the worker and the Pages build go
out in the same window with the worker first. A bundle from before the deploy
then reads bucket fields the payload no longer carries and draws four empty bars
against a real denominator until the tab reloads; a bundle from after it against
the old worker hides the curve instead, because `curveFrom()` needs `counts`.
The top-1 figure is not part of that pair — `topOneMatch()` divides
`stanceCounts` in the browser — so it ships with the Pages build, and the
discontinuity above is a frontend event. `POST /api/feedback` also reads
`denomination_profiles` from KV to check the two list names against it; there is
nothing to seed, because a missing or unreadable document degrades to the numeric
bounds `parseRank()` applied before the names existed.

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

## 13. Build Identity (`frontend/lib/site.ts`)

One file says which build a reader is looking at. `APP_VERSION` changes when the
quiz changes, `APP_STAGE` when the project does, and `APP_UPDATED` (ISO
`YYYY-MM-DD`) moves with the version.

Three surfaces print them, and each reads the constants instead of spelling out
its own string: the hero badge (`v2.0 open beta`), the landing page's product
facts (`Updated 21 Nov 2026`), and the footer of every downloaded card
(`TheoCompass v2.0 · Open beta · build 21 Nov 2026`). The card matters most: a PNG
outlives the tab it came from, so it is the only place a reader can tell two
builds apart months later.

Bump `APP_UPDATED` in the same commit as `APP_VERSION`. It is a fact in the
source, not a fetch — §14's changelog dates commits, not this constant, so the
two cannot contradict each other — and a date that goes stale is meant to show
up in review. The landing page shows a date rather than a cadence on purpose:
"updated weekly" can be false on any given week, "21 Nov 2026" cannot.
`formatBuildDate` formats by hand rather than through `Intl`, so the
statically-built HTML and the hydrated client cannot disagree.

## 14. The Changelog (`/changelog`)

The changelog is not a document. It is a view of the Git history: there is no
file anyone edits to publish a release note, and no second copy of the truth to
fall out of date. `frontend/app/changelog/page.tsx` is a server component that
renders `frontend/lib/changelog.generated.ts`, so the HTML a crawler gets is the
HTML a reader gets, and the page is prerendered as static content beside the
landing page, the quiz and the roadmap.

### What writes the data

`scripts/build_changelog.mjs` (no dependencies, Node's `https` and `child_process`)
merges two sources, newest first and de-duplicated by SHA:

- `git log` in the working copy for the commits reachable from the checkout
  being built — exact for HEAD, which matters because a deploy starts seconds
  after a push and the REST API has not indexed that commit yet;
- the public GitHub API (`/repos/TheoCompass/theocompass/commits`, at most three
  pages of 100) for the older history, because a Pages checkout can be shallow.
  The repository is public, so no token is needed; `GITHUB_TOKEN` is honoured
  when present but never required.

It writes two files. `lib/changelog.generated.ts` is the page's data — every
entry, sorted, with `feat(scope): …` split into its type, scope and subject and
`Task:` trailers resolved against `data/roadmap.json`. `lib/changelog-tasks.generated.ts`
is a small `Partial<Record<taskId, { short, date, subject }>>` used by the
roadmap's client bundle, so a 70 KB module of prose never ships to the browser
that only wants "which commit last touched this row". It also carries
`CHANGELOG_SUMMARY` (`{ last7d, last30d, latest }`): the landing page is a client
component, so its "42 changes in 30 days" has to come from these three numbers
rather than from the entries.

Reading the history itself lives in `scripts/lib/changelog-commits.mjs`
(`collectEntries`), which `scripts/reddit_digest.mjs` imports too — one
definition of "a product change", two consumers.

Both files are deterministic — same commits in, same bytes out; no timestamp of
"now", no `Math.random`, no JSON key order surprises — which is what makes
`node scripts/build_changelog.mjs --check` meaningful. It regenerates in memory
and exits non-zero if the committed snapshot differs, so CI or a pre-push hook
can catch a stale changelog the way a lockfile check catches a stale dependency.
`npm run changelog` / `npm run changelog:check` in `frontend/` are thin wrappers.

The generator **fails soft**: no network, a rate limit, no `git`, an unparsable
date — it warns, keeps the previous snapshot and exits 0. A changelog is worth a
slightly stale row; it is never worth a failed deploy. That is also why the
Pages build command chains it (`node ../scripts/build_changelog.mjs && npx
@cloudflare/next-on-pages@1`) rather than relying on a `prebuild` script:
next-on-pages calls `next build` itself, so `prebuild` would never fire.

### What an entry is

- `type` / `scope` / `subject` — from the conventional-commit prefix. A message
  that does not parse is typed `change` with the whole subject, and a merge is
  typed `merge`. Chips are verbs ("Added", "Fixed"), drawn from
  `CHANGELOG_TYPE_META` in the same palette as `ROADMAP_STATUS_META`, because
  `feat`/`fix` are Git's words rather than a reader's.
- `lead` — the opening paragraph of the commit message, `Task:` and
  `Co-authored-by`/`Signed-off-by` trailers removed. Only that paragraph
  travels: these bodies run to many paragraphs, and rendering all of them twice
  (HTML and the RSC payload) made a 580 KB page. The full message is one click
  away on GitHub. No author email is ever carried over.
- `tasks` — `Task: p1-03`, `Tasks: 1.3, p2-07` and `#1.3` all resolve, by task
  id or by the sheet's numbering. Unknown tokens are collected and printed as a
  warning naming the commit, so a typo surfaces in the build log instead of
  silently dropping the link.
- `housekeeping` — `chore`/`ci`/`build` types plus GitHub's own `Merge pull
  request #…` commits. They are real work but not changes a reader can use, so
  the page collapses them into one disclosure at the foot. Product entries stay
  above, which also means the month headings count only what moved.

### The two-way link with the roadmap

A commit that names a task gets a chip linking to `/roadmap#p1-03`; the roadmap
row (`_TaskRow.tsx`) carries `id={task.id}` and grows a "Latest" line that links
back to `/changelog#<short>`. The "Latest" line is absent, not empty, for the
tasks no commit has named — until the trailer convention is in use, that is all
61 of them, and an empty line on every row would be noise.

There is deliberately **no backfill**: nothing in the history says which sheet
row a pre-convention commit touched, and guessing from the diff would be a
fabrication published under the task's name. The link appears the first time a
commit says `Task:` itself.

Before trusting a change to the generator, check three things:
`node scripts/build_changelog.mjs --check` (deterministic), the rendered
`.next/server/app/changelog.html` (`id="<short>"` anchors, month headings, one
housekeeping block), and the client chunk for the roadmap
(`grep -r 'changelog#' .next/static/chunks`) to confirm the other half still
points at the anchors this page emits.

### Where the changelog is linked, and why there

The page is evidence, so it is attached to claims and nowhere else:

- the landing page's facts row: `Updated 21 Nov 2026 · 42 changes in 30 days →`,
  both numbers from `CHANGELOG_SUMMARY` in `lib/changelog-tasks.generated.ts`.
  The count is measured back from the newest commit, not from the wall clock, so
  a rebuild with no new commits prints the same number;
- the "What the beta adds" subtitle, which says four things changed and offers
  the rest;
- `/roadmap`, twice: the intro ("the same history in date order") and the
  closing note, which also explains the `Task:` trailer;
- the quiz footer's meta row, the one internal link there;
- the feedback card, but only after a submission and outside `role="status"`, so
  a screen reader does not re-announce the panel it was just told about.

There is no nav slot. A nav item says "we have a changelog"; these placements
say "here is the change you were just told about", which is the only reason
anyone opens one.

## 15. Announcing changes (the Reddit digest)

`scripts/reddit_digest.mjs` drafts the weekly post for
[r/TheoCompass](https://www.reddit.com/r/TheoCompass) from the same entries the
changelog renders — `scripts/lib/changelog-commits.mjs`, shared by both scripts,
so the page and the post cannot disagree about what a product change is.

**It does not post.** Posting needs a Reddit OAuth token; a script app needs the
account password, and the password grant stops working the moment 2FA is on. An
unattended bot also has no way to notice that the third bullet reads badly in
public. Selection is the part worth automating; judgement is not. What a
different design would need, if this ever changes: an app registered at
reddit.com/prefs/apps, a unique `User-Agent` such as
`node:theocompass-digest:v1 (by /u/oroq)`, and a token refreshed at most hourly.

### The window and the ranking

1. **Window** — the entries after `lastSha` in `data/reddit_digest.json`, or
   after `--since YYYY-MM-DD` when given (which overrides both the boundary and
   the cadence gate), or the last seven days on a first run.
2. **Filter** — out: `chore`/`ci`/`build` (already `housekeeping`), `merge`,
   `docs`, `refactor`, `test`, `style`. In: what a reader could see or use.
3. **Score** — `feat` 3, `perf`/`fix` 2, anything else 1; plus 2 when the commit
   names a roadmap task; plus up to 2 for a subject long enough to carry detail.
4. **Shape** — the top five as bullets. A scope with two or more bullets gets a
   bold heading (`**Feedback**`); a scope with one becomes a plain bullet up
   front, because five headings over five bullets reads like a form. Everything
   after the fifth is one `Also:` line, by name.

### The two places a human has to edit

The draft says so at the top, and it is serious: **the title and the closing
question are proposals.**

- The title is the week's top `feat` subject when it is at most 70 characters,
  otherwise `What changed in TheoCompass — 21 Nov 2026`. A subject is a commit
  message, not a headline.
- The closing question rotates through three variants by ISO week so
  consecutive posts do not open the same way. It is there to be replaced with
  the question you actually want answered this week.

Everything else in the draft — bullets, the range, the two links — is
mechanical and should stay that way.


### State, and what `--mark-posted` records

`data/reddit_digest.json` is committed and is the only memory the script has:

```json
{
  "version": 1,
  "lastPostedAt": "2026-11-21T23:01:14.524Z",
  "lastSha": "4c46467d4d354b97301774a01a4d3a3192ed1cee",
  "posts": [{ "sha": "…", "date": "…", "recordedAt": "…", "title": "…", "url": "…" }]
}
```

`--mark-posted <url>` appends to `posts[]`, sets `lastPostedAt` to now and
`lastSha` to the `through:` SHA written in the newest draft's comment block — not
to the newest commit in the repository. That difference is the point: anything
pushed between drafting and posting stays in the next window instead of
disappearing from both. `posts[]` is also what a future "discussed on
r/TheoCompass" line on `/changelog` would read; nothing reads it yet.

### Running it

```bash
node scripts/reddit_digest.mjs                      # draft since the last post
node scripts/reddit_digest.mjs --open               # draft, copy the body, open the form
node scripts/reddit_digest.mjs --since 2026-11-14   # explicit window
node scripts/reddit_digest.mjs --min 5              # stricter threshold
node scripts/reddit_digest.mjs --mark-posted <url>  # record what went out
node scripts/reddit_digest.mjs --offline            # git only, no GitHub API
```

The draft lands in `output/reddit-YYYY-MM-DD.md` — gitignored, because it is a
thing you edit once and paste, not a page. Re-running keeps a draft that already
exists (and `--open` copies the text as you left it); delete the file to
regenerate it. `--open` copies the body with `pbcopy` and opens the submit form
with `?title=` prefilled: Reddit honours the title parameter and discards
`text=`, so the clipboard is the only route that keeps the Markdown intact. Both
steps are macOS-only; elsewhere the script prints the path and the title and
says so.

Two gates keep the volume down, and both are gates rather than warnings:

- fewer than `--min` product changes (default 3) prints what there is and exits
  0 — a quiet week is a valid outcome, and six posts a year worth reading beat
  fifty that are not;
- less than five days after the last recorded post, it refuses and prints the
  date the gate opens. `--since` is the override, and using it is a decision.

### House rules

- **r/TheoCompass only.** It is the project's own subreddit; a build log posted
  into someone else's community is spam whatever the intent.
- **One post a week, at most**, and never the same text in two subreddits. If a
  post is worth cross-posting, rewrite it for the room.
- **Say you built it.** The draft's first person is deliberate: "the feedback I
  act on most" is a claim a maintainer can make and a brand cannot.
- The script fails soft on the network (git only, still drafts), loudly on a
  malformed `--mark-posted` URL, and exits 1 only when there is no history to
  read at all.
