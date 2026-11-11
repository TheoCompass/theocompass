-- Roadmap content and per-task status.
--
-- `roadmap_tasks.status` is the only column a moderator can change from the
-- /roadmap page (PATCH /api/roadmap/tasks/:id). Everything else is owned by
-- `data/roadmap.csv`: regenerate it with
--   python3 scripts/build_roadmap_json.py
--   python3 scripts/generate_roadmap_seed.py
--   npm run db:seed-roadmap-local
-- The generated upsert skips `status`, so re-syncing content never reverts an
-- edit; pass --reset-status to the generator to force the CSV's values back.
--
-- These tables are NOT dropped by reset.sql or the reference seed, so statuses
-- survive `npm run data:sync-*`.

CREATE TABLE IF NOT EXISTS roadmap_phases (
  phase_index INTEGER PRIMARY KEY,          -- 0..7, matches "Phase N" in the sheet
  title       TEXT NOT NULL,                -- "Phase 3 — The Museum & SEO (Content Moat)"
  label       TEXT NOT NULL,                -- title without the "Phase N — " prefix
  goal        TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS roadmap_tasks (
  id          TEXT PRIMARY KEY,             -- "p3-04": stable slug, never renumbered
  phase_index INTEGER NOT NULL,
  task_index  INTEGER NOT NULL,             -- 1..n within the phase -> "3.4"
  sheet_id    TEXT,                         -- "3.4" as printed (Phase 7 ships "8.x")
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type        TEXT,                         -- 'Code' | 'UI' | 'Data' | 'Content' | ...
  owner_role  TEXT,                         -- column E, a short verification note
  status      TEXT NOT NULL DEFAULT 'not_started'
              CHECK (status IN ('not_started', 'in_progress', 'implemented_local', 'implemented_live')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_phase
  ON roadmap_tasks (phase_index, task_index);
