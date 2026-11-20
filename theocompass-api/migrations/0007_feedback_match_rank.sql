-- ==========================================
-- WHERE THE BEST MATCH SAT (task 0.9, follow-up)
-- ==========================================
--
-- The card used to ask whether "the top match" described the reader: a yes/no
-- about rank #1 that never said "#1". It then asked for a six-bucket rank, which
-- still made the reader translate their own result into "#4-#10" and could not
-- tell "my denomination is missing" from "none of these fitted".
--
-- It now asks the question a reader can answer: which family came closest, and
-- then which denomination inside that family. Both answers are a position in the
-- list the reader was just looking at, so nothing has to be translated -- and the
-- two columns record the two different things the panel publishes: how often the
-- closest family was right, and how often the #1 denomination was.
--
-- Values (validated in src/feedback.ts rather than by a CHECK, the same bargain
-- the other migrations make):
--   family_rank     1-8  place of the family in the family list, best first
--                   0    "none of these": no family came close
--                   NULL the question was skipped, exactly like `accurate`
--   match_rank_pos  >=1  place of the chosen denomination in the full list
--                   0    "not one of these": not in that family's shortlist
--                   NULL skipped, or a family was named but no denomination was
--
-- Integers rather than a text enum: the shortlist lengths are a UI decision, and
-- an integer survives changing them from eight to six to ten without a second
-- migration or a rewrite of the rows written under the old list. Anything past
-- the list is still a miss, which is why the published buckets are ranges
-- (=1, 2-3, 4-8, the rest) and not named places.
--
-- `accurate` stays the published "Top 1 match accuracy" figure and is derived
-- from `match_rank_pos` (1 -> 1, anything else -> 0), so the two can never
-- disagree. It is still the column the yes/no split reads, which is what keeps
-- one denominator spanning the rows written before this question existed.
--
-- The backfill follows only the direction that is unambiguous. A legacy "yes"
-- said the #1 match described them, which is exactly position 1. A legacy "no"
-- did not say how far off it was, and `family_rank` was never asked at all, so
-- both stay NULL: writing a guess on the reader's behalf would invent an answer,
-- and the panel would publish it as one.
--
-- User-generated data (see 0001), so a `data:sync-remote` re-seed keeps it.
--
-- Rewritten in place: this migration was authored and then replaced before it
-- was ever applied to the remote database, so there is no `match_rank` text
-- column to drop in the field.
--
-- A *local* database that applied the draft keeps `match_rank` and never runs
-- this file again (wrangler records it by name), so the schema there has to be
-- brought level by hand once:
--
--   ALTER TABLE feedback ADD COLUMN family_rank INTEGER;
--   ALTER TABLE feedback ADD COLUMN match_rank_pos INTEGER;
--   UPDATE feedback SET match_rank_pos = 1 WHERE accurate = 1 AND match_rank_pos IS NULL;
--   CREATE INDEX IF NOT EXISTS idx_feedback_family_rank ON feedback (family_rank);
--   CREATE INDEX IF NOT EXISTS idx_feedback_match_rank_pos ON feedback (match_rank_pos);
--
-- The old `match_rank` column can stay: nothing reads it, and dropping a column
-- would rewrite the table for no reason. `npm run db:clear-feedback-local` then
-- `db:seed-feedback-local` puts the demo rows' two new positions back.

ALTER TABLE feedback ADD COLUMN family_rank INTEGER;
ALTER TABLE feedback ADD COLUMN match_rank_pos INTEGER;

UPDATE feedback SET match_rank_pos = 1 WHERE accurate = 1 AND match_rank_pos IS NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_family_rank ON feedback (family_rank);
CREATE INDEX IF NOT EXISTS idx_feedback_match_rank_pos ON feedback (match_rank_pos);
