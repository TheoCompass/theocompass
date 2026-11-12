-- In-quiz "report an issue" flags.
--
-- `issue_reports` was created in 0001 for exactly this feature; this migration
-- adds what a report filed mid-quiz actually carries. `flag_id` is the client's
-- idempotency key (a retry after a dropped connection must not file twice) and
-- `status` is the triage state -- the reason the row exists at all instead of a
-- mail landing in an inbox, where nothing can be counted or closed.
--
-- Vocabulary for `issue_type`: 'typo' (wording), 'bad_options' (an option is
-- missing, duplicated or mislabelled), 'framing' (the question itself is loaded
-- or hostile) and 'other'. `answer_id` is optional because most reports are
-- about the question, not one of its options.
--
-- Like the rest of 0001 this is user-generated data: `reset.sql` drops reference
-- tables only, so a `data:sync-remote` re-seed keeps every report.
--
-- Apply with:
--   npm run db:migrate-local
--   npm run db:migrate-remote

ALTER TABLE issue_reports ADD COLUMN flag_id TEXT;
ALTER TABLE issue_reports ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE issue_reports ADD COLUMN mode TEXT;
ALTER TABLE issue_reports ADD COLUMN question_index INTEGER;
ALTER TABLE issue_reports ADD COLUMN app_version TEXT;
ALTER TABLE issue_reports ADD COLUMN notified_at TEXT;
-- No DEFAULT: SQLite refuses a non-constant default in ALTER TABLE, so the
-- worker writes this explicitly on insert and on every status change.
ALTER TABLE issue_reports ADD COLUMN updated_at TEXT;

-- Idempotency. Multiple NULLs are allowed in a SQLite UNIQUE index, so any
-- legacy or hand-inserted row without a flag_id stays valid.
CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_reports_flag ON issue_reports (flag_id);
CREATE INDEX IF NOT EXISTS idx_issue_reports_created ON issue_reports (created_at);
CREATE INDEX IF NOT EXISTS idx_issue_reports_question ON issue_reports (question_id);
CREATE INDEX IF NOT EXISTS idx_issue_reports_status ON issue_reports (status);
