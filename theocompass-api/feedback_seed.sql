-- Demo feedback rows, so `/api/stats` and `/api/feedback` have something to show
-- on a fresh remote database.
--
-- Not a migration: the deployed database holds real reader feedback, and demo
-- rows do not belong in the same stream as the schema. `npm run
-- db:seed-feedback-local` loads them into the local database; pointing
-- `wrangler d1 execute theocompass-db --remote --file=./feedback_seed.sql` at
-- production does the same there. Every session id is fixed and the insert is
-- `ON CONFLICT DO NOTHING`, so a second run adds nothing rather than doubling
-- the panel -- and `npm run db:clear-feedback-local` removes these twelve again
-- (it deletes `session_id LIKE 'demo-%'`), after which a fresh seed applies any
-- edits made here.
--
-- What the twelve rows add up to, since the arithmetic is the point:
--
--   ratings          5,5,5,5,4,4,4,4,3,3,2,1 -> 45 / 12 = 3.8 average
--                    histogram 1:1, 2:1, 3:2, 4:4, 5:4
--   stance           7 fit / 2 close / 1 off / 2 exploring -> 12 answers
--                    the top-1 figure is 7 of 10 = 70%: `exploring` is stored
--                    and counted, and kept out of that denominator (0008)
--   closest family   9 picked #1 -> 90% of 10; buckets 9 / 1 / 0 / 0
--   their tradition   7 picked #1 -> 70% of 10; buckets 7 / 1 / 1 / 1
--
-- The last two figures differ on purpose: a reader whose family came closest at
-- #1 can still have their own denomination further down that family's shortlist,
-- which is exactly what the two-level card was built to tell apart. The family
-- figure is therefore never the church figure restated.
--
-- Bucket keys, so the numbers above can be checked against what the panel prints:
--   top1  = 1        top3 = 2-3      top8 = 4-8      beyond = 0 or past the list
-- A row with NULL in a column skipped that question, and NULL is not zero: it
-- sits in no bucket and in no denominator. The two `exploring` rows are like
-- that on purpose -- a reader with no church to compare against has no position
-- to give, and the card says so instead of making them pick one.
--
-- `accurate` is not a second opinion here, it is the same answer: 1 for the seven
-- `fit` rows, 0 for the `close` and `off` ones, and NULL for `exploring` --
-- exactly as the API derives it from `fit_stance` (0008). Seeding them by hand
-- keeps the demo consistent with what a live submission writes.
--
-- `rating_metric` is 'experience' throughout: the stars on the card grade the
-- quiz, and the four `fit` rows still in production predate the change.
--
-- To see a skipped answer, blank a row's four columns:
--   UPDATE feedback SET fit_stance = NULL, accurate = NULL, family_rank = NULL,
--                       match_rank_pos = NULL
--    WHERE session_id = 'demo-0001';
-- That row then leaves the stance and position denominators while staying in the
-- average and the histogram, which is the behaviour the panel's sample lines
-- claim.
--
-- To see the hidden-row rule, hide one:
--   UPDATE feedback SET status = 'hidden' WHERE session_id = 'demo-0012';
-- Eleven ratings averaging 4.0, and the stance, family and church figures
-- recomputed over what is left.

INSERT INTO feedback
  (session_id, rating, accurate, fit_stance, family_rank, match_rank_pos, comment, mode,
   top_match_id, top_match_name, answered_count, app_version, data_version,
   status, rating_metric, created_at)
VALUES
  ('demo-0001', 5, 1, 'fit', 1, 1,
   'The first two questions already felt like they were describing me.',
   'quick', 'anglican', 'Anglican', 60, 'seed', NULL, 'new', 'experience',
   '2026-11-01T09:12:00.000Z'),
  ('demo-0002', 5, 1, 'fit', 1, 1,
   NULL,
   'deep', 'lutheran', 'Lutheran', 120, 'seed', NULL, 'reviewed', 'experience',
   '2026-11-02T14:40:00.000Z'),
  ('demo-0003', 5, 1, 'fit', 1, 1,
   'I have been in this tradition for years and the follow-up links were new to me.',
   'quick', 'baptist', 'Baptist', 60, 'seed', NULL, 'new', 'experience',
   '2026-11-03T20:05:00.000Z'),
  ('demo-0004', 5, 1, 'fit', 1, 1,
   NULL,
   'quick', 'methodist', 'Methodist', 60, 'seed', NULL, 'new', 'experience',
   '2026-11-05T08:30:00.000Z'),
  ('demo-0005', 4, 1, 'fit', 1, 1,
   'Close, but it put too much weight on the worship question.',
   'deep', 'presbyterian', 'Presbyterian', 120, 'seed', NULL, 'new', 'experience',
   '2026-11-07T11:15:00.000Z'),
  ('demo-0006', 4, 1, 'fit', 1, 1,
   NULL,
   'quick', 'pentecostal', 'Pentecostal', 60, 'seed', NULL, 'reviewed', 'experience',
   '2026-11-08T19:45:00.000Z'),
  ('demo-0007', 4, 1, 'fit', 1, 1,
   'Useful, though I would like to see the reasoning behind the top match.',
   'quick', 'anglican', 'Anglican', 60, 'seed', NULL, 'new', 'experience',
   '2026-11-10T07:55:00.000Z'),
  ('demo-0008', 4, 0, 'close', 1, 2,
   'The family was right; my church was one row further down.',
   'quick', 'lutheran', 'Lutheran', 60, 'seed', NULL, 'new', 'experience',
   '2026-11-12T13:20:00.000Z'),
  ('demo-0009', 3, NULL, 'exploring', NULL, NULL,
   'I am still working out where I sit, so there is no church to compare this with.',
   'deep', 'baptist', 'Baptist', 120, 'seed', NULL, 'reviewed', 'experience',
   '2026-11-14T16:10:00.000Z'),
  ('demo-0010', 3, 0, 'close', 1, 9,
   'Right family, but my tradition never appeared in the list at all.',
   'quick', 'methodist', 'Methodist', 60, 'seed', NULL, 'new', 'experience',
   '2026-11-16T21:35:00.000Z'),
  ('demo-0011', 2, 0, 'off', 3, 5,
   'The whole thing landed on the wrong branch of the family tree.',
   'quick', 'presbyterian', 'Presbyterian', 60, 'seed', NULL, 'new', 'experience',
   '2026-11-18T10:00:00.000Z'),
  ('demo-0012', 1, NULL, 'exploring', NULL, NULL,
   'None of it described me, but I am curious enough to keep reading.',
   'deep', 'pentecostal', 'Pentecostal', 120, 'seed', NULL, 'new', 'experience',
   '2026-11-20T18:25:00.000Z')
ON CONFLICT(session_id) DO NOTHING;

