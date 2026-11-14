-- Post-quiz feedback (task 0.9).
--
-- `feedback` was created in 0001 for exactly this feature and is still empty;
-- this migration adds what a submission from the results page actually carries.
-- `session_id` is the client's idempotency key: a retry after a dropped
-- connection, or a second tap on "Send", must not become a second rating.
--
-- What is NOT here is as deliberate as what is: no email, no IP, no user agent,
-- no cookie. The rating, the yes/no and the optional comment are the whole row.
-- Nothing in this table is published as text -- `/api/stats` exposes counts,
-- an average and a histogram, never a quote -- so a comment needs no consent
-- flow. It does get a human read: the moderator queue at `/mod/feedback`
-- (`GET /api/feedback`, `PATCH /api/feedback/:id`) is the only place a comment is
-- ever shown, and it is behind `X-Admin-Code`.
--
-- `status` is the reviewer's triage, 'new' by default. It stays in the table and
-- never in the published average: `hidden` is filtered out by the
-- `status <> 'hidden'` clause in `handleGetStats`, so a spam row can be retired
-- without deleting the evidence. The queue sets it; nothing else does.
--
-- Like the rest of 0001 this is user-generated data: `reset.sql` drops reference
-- tables only, so a `data:sync-remote` re-seed keeps every rating.
--
-- Apply with:
--   npm run db:migrate-local
--   npm run db:migrate-remote

ALTER TABLE feedback ADD COLUMN session_id TEXT;
ALTER TABLE feedback ADD COLUMN answered_count INTEGER;
ALTER TABLE feedback ADD COLUMN top_match_name TEXT;
ALTER TABLE feedback ADD COLUMN app_version TEXT;
ALTER TABLE feedback ADD COLUMN status TEXT NOT NULL DEFAULT 'new';

-- Idempotency. Multiple NULLs are allowed in a SQLite UNIQUE index, so any
-- legacy or hand-inserted row without a session_id stays valid.
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_session ON feedback (session_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback (rating);
