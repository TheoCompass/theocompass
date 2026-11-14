-- ==========================================
-- LOCAL DEMO ROWS FOR POST-QUIZ FEEDBACK (task 0.9)
-- ==========================================
--
-- These are fake ratings, for one reason: the landing page only prints the
-- feedback tile once `total >= MIN_FEEDBACK` (10) in `frontend/lib/quiz-stats.ts`,
-- so a fresh local database can never show what the tile looks like. Twelve rows
-- clear that gate and the accuracy row's (8 yes / 3 no is eleven judged answers,
-- 73%), and give the histogram a shape worth looking at.
--
-- LOCAL ONLY. There is deliberately no `--remote` script for this file: demo
-- ratings must never reach the published average.
--
-- Apply / remove:
--   npm run db:seed-feedback-local
--   npm run db:clear-feedback-local      (deletes every session_id LIKE 'demo-%')
--
-- Safe to re-run: `demo-*` session ids hit the UNIQUE index on
-- `feedback.session_id` and the insert is skipped, exactly like a retried
-- submission in `src/feedback.ts`.
--
-- Deliberately NOT part of `data:sync-local`: that pipeline re-seeds reference
-- tables, and `reset.sql` leaves user tables alone -- feedback survives, so
-- seeding it there would either duplicate work or make the pipeline feel
-- destructive. Two explicit commands are easier to trust.
--
-- What these twelve rows add up to (and what the tile should then print):
--   ratings        5,5,5,5,4,4,4,4,3,3,2,1   -> average 45/12 = 3.75 -> 3.8
--   histogram      one 1*, one 2*, two 3*, four 4*, four 5*
--   accuracy       8 yes / 3 no / 1 skipped   -> the skip is NULL, never a "no"
--
-- A real local rating you have already submitted moves the count but not the
-- headline: 45 + 5 over 13 rows is 3.85, which still prints 3.8.
--
-- One row to test the mix with: `status = 'hidden'` is the only value with
-- behaviour -- those rows are dropped from `/api/stats` (13 -> 12, average
-- 3.85 -> 4.08) without being deleted:
--   UPDATE feedback SET status = 'hidden' WHERE session_id = 'demo-0012';
--   UPDATE feedback SET status = 'new'    WHERE session_id = 'demo-0012';
--
-- `created_at` is spread over the last week instead of "now", so a
-- `GET /api/feedback` readout looks like a queue rather than one batch.

INSERT INTO feedback
  (session_id, rating, accurate, comment, top_match_id, top_match_name, mode,
   answered_count, app_version, data_version, status, created_at)
VALUES
  ('demo-0001', 5, 1, NULL,
   'DENOM_001', 'The Apostolic Church (Early Church)', 'quick',
   30, 'v2.0', NULL, 'new', datetime('now', '-1 day')),
  ('demo-0002', 5, 1, NULL,
   'DENOM_068', 'Eastern Orthodox Church', 'standard',
   60, 'v2.0', NULL, 'new', datetime('now', '-1 day', '-3 hours')),
  ('demo-0003', 5, 1, 'Demo row: this sentence only exists in local dev data.',
   'DENOM_064', 'Coptic Orthodox Church', 'quick',
   30, 'v2.0', NULL, 'new', datetime('now', '-2 days')),
  ('demo-0004', 5, 1, NULL,
   'DENOM_105', 'Evangelical Lutheran Church in America (ELCA)', 'deep',
   125, 'v2.0', NULL, 'new', datetime('now', '-2 days', '-6 hours')),
  ('demo-0005', 4, 1, NULL,
   'DENOM_144', 'Southern Baptist Convention (SBC)', 'standard',
   60, 'v2.0', NULL, 'new', datetime('now', '-3 days')),
  ('demo-0006', 4, 1, NULL,
   'DENOM_001', 'The Apostolic Church (Early Church)', 'quick',
   30, 'v2.0', NULL, 'new', datetime('now', '-4 days')),
  ('demo-0007', 4, 1, NULL,
   'DENOM_068', 'Eastern Orthodox Church', 'quick',
   30, 'v2.0', NULL, 'new', datetime('now', '-4 days', '-2 hours')),
  ('demo-0008', 4, 1, 'Demo row: a second comment, so the queue is not one line.',
   'DENOM_105', 'Evangelical Lutheran Church in America (ELCA)', 'standard',
   60, 'v2.0', NULL, 'new', datetime('now', '-5 days')),
  ('demo-0009', 3, 0, NULL,
   'DENOM_144', 'Southern Baptist Convention (SBC)', 'quick',
   30, 'v2.0', NULL, 'new', datetime('now', '-6 days')),
  ('demo-0010', 3, 0, 'Demo row: a comment on a low rating.',
   'DENOM_064', 'Coptic Orthodox Church', 'deep',
   125, 'v2.0', NULL, 'new', datetime('now', '-6 days', '-4 hours')),
  ('demo-0011', 2, 0, NULL,
   'DENOM_001', 'The Apostolic Church (Early Church)', 'quick',
   30, 'v2.0', NULL, 'new', datetime('now', '-7 days')),
  ('demo-0012', 1, NULL, NULL,
   'DENOM_068', 'Eastern Orthodox Church', 'quick',
   30, 'v2.0', NULL, 'new', datetime('now', '-8 days'))
ON CONFLICT(session_id) DO NOTHING;
