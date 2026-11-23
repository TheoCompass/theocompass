-- Demo feedback rows, so `/api/stats` and `/api/feedback` have something to show
-- on a fresh remote database.
--
-- Not a migration: the deployed database holds real reader feedback, and demo
-- rows do not belong in the same stream as the schema. `npm run
-- db:seed-feedback-local` loads them into the local database; pointing
-- `wrangler d1 execute theocompass-db --remote --file=./feedback_seed.sql` at
-- production does the same there. Every session id is fixed and the insert is
-- `ON CONFLICT DO NOTHING`, so a second run adds nothing rather than doubling
-- the panel -- and `npm run db:clear-feedback-local` removes these eighteen again
-- (it deletes `session_id LIKE 'demo-%'`), after which a fresh seed applies any
-- edits made here.
--
-- What the eighteen rows add up to, since the arithmetic is the point:
--
--   ratings          5,5,5,5,4,4,4,4,3,3,2,1 and 3,3,3,2,3,4 -> 63 / 18 = 3.5
--                    histogram 1:1, 2:2, 3:6, 4:5, 5:4
--   stance           8 fit / 5 close / 3 off / 2 exploring -> 18 answers
--                    the top-1 figure is 8 of 16 = 50%: only `fit` counts as a
--                    hit, and `exploring` -- stored and counted -- is kept out of
--                    the denominator (0008). The panel prints the near-miss beside
--                    it, so the same seed reads "another 31% called it close".
--   their family     9 named #1 of 16 -> median #1; places 1,2,3,6,11,18,25
--                    plus one "none of these families" (the escape hatch)
--   their church     7 named #1 of 16 -> median #2; places 1,2,5,9,22,47,96,140
--                    plus one "not in this list"
--
-- The last two figures differ on purpose: a reader whose family came closest at
-- #1 can still have their own denomination further down the list, which is
-- exactly what the two-level card was built to tell apart. The family figure is
-- therefore never the church figure restated.
--
-- The places are spread on purpose too. Half the answers sit in the first two
-- places and the rest run out to #25 and #140, so the panel's cumulative curve
-- has a real tail: a median of #1 and #2, and a long flat crawl to the right
-- that one reader occupies. A sample piled up at #1 would draw a vertical line
-- against the left edge and say nothing about the axis.
--
-- A row with NULL in a column skipped that question, and NULL is not zero: it
-- sits in no place and in no denominator. The two `exploring` rows are like
-- that on purpose -- a reader with no church to compare against has no position
-- to give, and the card says so instead of making them pick one. `0` is the
-- other kind of answer: the list did not cover them, which is counted (it is in
-- the denominator) but has no place on the axis.
--
-- `accurate` is not a second opinion here, it is the same answer: 1 for the eight
-- `fit` rows, 0 for the `close` and `off` ones, and NULL for `exploring` -- just
-- as the API derives it from `fit_stance`. Seeding them by hand keeps the demo
-- consistent with what a live submission writes. The published top-1 figure does
-- not divide this column, though: it divides the stance, so `fit` is the only hit
-- and "close" is a printed near-miss.
--
-- `rating_metric` is 'experience' throughout: the stars on the card grade the
-- quiz, and the four `fit` rows still in production predate the change.
--
-- A pre-0008 row, for hand-checking that the legacy boolean no longer inflates the
-- figure. Uncomment the insert below and re-seed: it is a rating plus a boolean
-- "yes" with no stance but a `#1` church place (what the backfill wrote for a
-- legacy yes), so the average becomes 68/19 and the church curve gains one #1
-- answer -- while the top-1 row must still read 50% of 16, not 9 of 17.
--
--   INSERT INTO feedback
--     (session_id, rating, accurate, fit_stance, family_rank, match_rank_pos, comment,
--      mode, top_match_id, top_match_name, answered_count, app_version, data_version,
--      status, rating_metric, created_at)
--   VALUES
--     ('demo-0019', 5, 1, NULL, NULL, 1, NULL,
--      'quick', 'anglican', 'Anglican', 60, 'legacy-bundle', NULL, 'new', 'experience',
--      '2026-11-23T12:05:00.000Z');
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
--   UPDATE feedback SET status = 'hidden' WHERE session_id = 'demo-0018';
-- Seventeen ratings averaging 3.5, and the stance, family and church figures
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
   '2026-11-20T18:25:00.000Z'),
  -- The deep picks. They exist so the panel's two curves have a tail to draw:
  -- with every answer inside the top few places the chart is a vertical line at
  -- the left edge, and neither the median rule nor the shaded "% past #n" band
  -- can be checked by eye. Family places 6, 11, 18, 25 and church places 22,
  -- 47, 96, 140, plus one reader the list did not cover at all.
  ('demo-0013', 3, 0, 'close', 6, 22,
   'Right family at #6, and my own church is a long way down the full list.',
   'quick', 'orthodox', 'Eastern Orthodox', 60, 'seed', NULL, 'new', 'experience',
   '2026-11-21T08:15:00.000Z'),
  ('demo-0014', 3, 0, 'off', 11, 47,
   NULL,
   'deep', 'reformed', 'Reformed', 120, 'seed', NULL, 'reviewed', 'experience',
   '2026-11-21T19:40:00.000Z'),
  ('demo-0015', 3, 0, 'close', 18, 96,
   'Closer than I expected, but my tradition sits near the bottom of the list.',
   'quick', 'methodist', 'Methodist', 60, 'seed', NULL, 'new', 'experience',
   '2026-11-22T09:05:00.000Z'),
  ('demo-0016', 2, 0, 'off', 25, 140,
   'Almost the last name on the list, which is about right for how it felt.',
   'deep', 'baptist', 'Baptist', 120, 'seed', NULL, 'new', 'experience',
   '2026-11-22T21:30:00.000Z'),
  -- The escape hatch: no family on the list fits, and nothing in the closest one
  -- either. Counted in both denominators, plotted nowhere -- which is the whole
  -- reason `none` travels beside the curve instead of becoming a fake #0.
  ('demo-0017', 3, 0, 'close', 0, 0,
   'None of the families on the list is mine, so there was nothing to pick.',
   'quick', 'pentecostal', 'Pentecostal', 60, 'seed', NULL, 'new', 'experience',
   '2026-11-23T07:50:00.000Z'),
  ('demo-0018', 4, 1, 'fit', 2, 2,
   'Second family, second church: it only just missed, and the reasoning was right.',
   'standard', 'lutheran', 'Lutheran', 90, 'seed', NULL, 'new', 'experience',
   '2026-11-23T11:20:00.000Z')
ON CONFLICT(session_id) DO NOTHING;

