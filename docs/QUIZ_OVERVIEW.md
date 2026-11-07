# TheoCompass Quiz — Overview

Two lenses on the same product: what **developers** work with, and what the **quiz taker** actually experiences.

---

## Part 1 — The Developer View

### Repo layout

| Area | What lives there |
|---|---|
| `/data` | Source-of-truth CSVs (questions, hidden dimensions, answer scoring, denominations, quiz sequence, families) |
| `/scripts` | ETL: `build_precomputed.js` (math → `denomination_profiles.json`), `generate_sql_seed.py` (→ `seed.sql`), `tSNE_taxonomy_script.py` |
| `/precomputed` | Generated artifacts (19 MB profiles JSON, mode summary CSV, pairwise matrices, `manifest.json`) |
| `/theocompass-api` | The Cloudflare Worker (`src/index.ts`) + D1/KV config |
| `/frontend` | Next.js 16 / React 19 / Tailwind 4 / Recharts app |
| `/docs` | Developer guide + methodology guide + this overview |

### The workflow developers run

1. Edit CSVs → 2. `node scripts/build_precomputed.js` → 3. `python scripts/generate_sql_seed.py` → 4. `wrangler d1 execute … --seed.sql` + `npm run kv:update-*` → data is live, **no frontend redeploy**.

### What lives in the Worker (one file, ~760 lines)

- **Endpoints:** `/api/questions?mode=`, `/api/coordinates`, `/api/calculate` (core), `/api/families`, `/api/alignment`, `/api/scoring`, `/api/dev/profile?id=DENOM_XXX`, health check.
- **Perf design:** KV (`denomination_profiles`) + D1 scoring tables are cached in **module-level V8 memory**; warm requests do zero DB I/O. Custom headers `X-Compute-Time-ms`, `X-D1-Rows-Read`, `X-D1-Query-Time-ms` report the cost of each call.
- **The engine:** per-question weighted Euclidean distance on 12 axes × `certaintyAmp` × `toleranceAmp` + posture penalty, clamped by a distance ceiling → 0–100 % similarity → weighted average → top 10; plus schism drag for split denominational answers, silence cases (both affirmed / apathetic / hostile / both silent), the 13th tolerance axis, family averages, and theological labels from `answer_options`.
- **Data scale:** 230 denominations, 123 questions (quick 30 / standard 58 / deep 123).

### Dev-only tools

- Restart modal → type **`mod`** → 🚀 Unlock Dev Tools → *Generate Random Answers* or *Test a perfect `DENOM_XXX` profile* (expect 100 %).
- `npm run data:sync-local | data:sync-remote`, `npm run dev`, `npm run deploy`.

### Known gaps (current backlog)

- Frontend hard-locks **Quick mode**; Standard/Deep buttons `alert("coming soon")`.
- Mode cards say "60/120 Qs" while `manifest.json` says 58/123.
- `theocompass-api/test/index.spec.ts` is still the "Hello World" scaffold — no real test coverage.
- `_InstructionsSteps.tsx` is unused; `lib/api.ts` is only partially adopted; `userLabels` is typed `string[]` but actually returns objects.

---

## Part 2 — The Quiz Taker's Experience

A single path: **mode select → tutorial → 30 questions → results dashboard.**

1. **Landing / mode select.** Three cards — ⚡ Quick (30 Qs, ~30 min, "best for first-timers"), 🧭 Standard and 🔬 Deep marked *Coming Soon*. If progress exists, Quick shows a **"Resume Quiz →"** ribbon.

2. **Four-step tutorial.** Interactive walkthrough of the three inputs — **Stance** (with a live "Learn more" example), **Certainty** (0–3), **Tolerance** (0–4), and **Silence**. "Start Quiz" unlocks only after all 4 steps, with a "Skip tutorial" option.

3. **The question screen** (one question at a time):
   - Category badge (color-coded), question number, shimmering progress bar, slide-in animation, and a short interstitial when the topic category changes.
   - **Answers are shuffled** per question; each has a **"Learn more"** pill revealing a definition.
   - **Silence buttons:** 🤷 *Apathetic* ("not relevant to me") and ✖ *Hostile* ("I reject this framing") — these auto-set certainty/tolerance and grey out the normal answers.
   - **Certainty slider** and **Tolerance slider** appear only once a real answer is chosen, each with plain-English labels and a severity-colored summary badge.
   - **Keyboard play:** `1–4` to pick, `Enter` to confirm, `S`/`H` for silence.
   - **Auto-save:** every change persists ("Progress saved" toast); refresh or come back later and resume exactly where they stopped; Back restores the previous answer.

4. **Results dashboard:**
   - **#1 hero match** with a tiered badge (Near Perfect Match / Strong Affinity / Significant Overlap…) and a big match %.
   - In Quick mode the hero is the closest **denomination family**, with its best individual tradition called out; "Show Specific Traditions" toggles to individual denominations — with an honest disclaimer about 30-question precision.
   - Ranked **top 10 families / denominations**, expandable into the top 5 members.
   - **Your Theological Fingerprint** — 13 axes grouped into *Theology / Practice / Posture*; click any axis for definitions, intensity ("strong conviction" vs "neutral lean"), and a **Compare** dropdown against any of the 230 denominations showing the gap in points ("Well Aligned · 12pt").
   - **2D compass scatter chart**, and a **Theological Label Cloud** (searchable belief labels with certainty rings).
   - **Shareable PNGs:** Download Results / Belief Labels / Fingerprint, plus "Post on r/TheoCompass", a Ko-Fi support link, and **Retake Quiz**.

**Overall impression:** a calm, low-friction, one-question-per-screen flow with heavy hand-holding (tutorial, definitions, save/resume) that ends in a dense but well-structured results page — big visual payoff, one clear call to action (download and share).
