-- Phase 0 user-generated data tables.
--
-- Managed via `wrangler d1 migrations` and intentionally NOT dropped by the
-- reference-data seed (generate_sql_seed.py). This means collected feedback,
-- issue reports, and quiz stats survive reference re-seeds.
--
-- Apply with:
--   npm run db:migrate-local     (local)
--   npm run db:migrate-remote    (production)
--   npx wrangler d1 migrations apply theocompass-db --remote --env staging

CREATE TABLE IF NOT EXISTS issue_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT,
  answer_id TEXT,
  issue_type TEXT,            -- 'typo' | 'bad_mapping' | 'other'
  note TEXT,
  data_version TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rating INTEGER,             -- 1–5
  accurate INTEGER,           -- 1 = yes, 0 = no, NULL = skipped
  comment TEXT,
  top_match_id TEXT,
  mode TEXT,
  data_version TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT,
  top_family TEXT,
  top_match_id TEXT,
  data_version TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
