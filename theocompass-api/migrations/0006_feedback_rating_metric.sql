-- One rating, two questions.
--
-- The stars on the feedback card used to ask how close the top match felt. They
-- now ask how the quiz felt overall -- the app-store question -- and those are
-- not the same measurement, so they cannot share an average. This column says
-- which question a row's number answers, and `/api/stats` publishes only
-- `'experience'`.
--
-- Every row that exists when this migration runs answered the old question, so
-- it is relabelled rather than deleted: `fit` removes it from the published
-- average, the histogram and the rating count, while its yes/no answer keeps
-- counting in `accurateYes` / `accurateNo` -- that question did not change, so
-- its history is still valid. Nothing is hidden, nothing leaves the queue.
--
-- Order matters in one direction: the default is the *current* metric, so a
-- submission written by the previous worker between this migration and the next
-- deploy is still labelled correctly. Everything above the UPDATE predates the
-- change by definition.
--
-- Apply with:
--   npm run db:migrate-local
--   npm run db:migrate-remote

ALTER TABLE feedback ADD COLUMN rating_metric TEXT NOT NULL DEFAULT 'experience';

UPDATE feedback SET rating_metric = 'fit';

-- The aggregate query counts and averages by this column on every /api/stats
-- request, so it is looked up rather than scanned.
CREATE INDEX IF NOT EXISTS idx_feedback_metric ON feedback (rating_metric);
