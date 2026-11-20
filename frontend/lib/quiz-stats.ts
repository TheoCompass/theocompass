import {
  fetchQuizStats,
  FEEDBACK_STANCES,
  RANK_BUCKETS,
  type FeedbackStance,
  type QuizStats,
  type RankBreakdown,
  type RankBucket,
} from "./api";

/**
 * The landing page's shared view of `/api/stats`.
 *
 * Two things on that page quote the same payload: the collective-results panel
 * and the accuracy row in the quiz card. Two `useEffects` would mean two
 * anonymous requests per page view for one number, so the request is memoised
 * here instead -- the in-flight promise is shared, and a success is kept in
 * module scope, which outlives the page but not the tab.
 *
 * A *failure* is deliberately not cached: a rejection held here would keep the
 * panel and the accuracy row hidden for the rest of the visit, including after a
 * flaky connection recovers. Dropping the promise lets the next mount try again.
 */

/**
 * Ten answers before a star average (or an accuracy percentage) is worth
 * publishing. `FeedbackTile` applies it per figure: the stars were reworded once,
 * so a reset rating count must not hide an accuracy percentage that is still
 * based on the same question.
 */
export const MIN_FEEDBACK = 10;

/**
 * The collective-results panel publishes nothing below this many runs, and the
 * accuracy row is gated on the same number: the figure links down to that panel,
 * so it must never appear when the panel has decided not to exist.
 */
export const MIN_QUIZZES = 10;

/**
 * Judgements need a sample before a percentage is worth publishing. Same
 * threshold as the average: both are claims about strangers, and both read as
 * noise below about ten.
 */
export const MIN_JUDGED = 10;

let cached: QuizStats | null = null;
let inFlight: Promise<QuizStats> | null = null;

export function loadQuizStats(): Promise<QuizStats> {
  if (cached) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = fetchQuizStats()
      .then((stats) => {
        cached = stats;
        return stats;
      })
      .catch((error: unknown) => {
        inFlight = null;
        throw error;
      });
  }
  return inFlight;
}

/** The two figures the accuracy row needs, or null when there are too few answers. */
export type QuizAccuracy = { percent: number; judged: number };

/**
 * How often the #1 match was the right one.
 *
 * `judged` is yes + no, not the number of ratings: a skipped question is a
 * shrug, and counting it as a disagreement would understate the match. Since
 * 0008 the answer comes from the stance question first (`fit` yes, `close` /
 * `off` no) and from the church's position as a fallback; a reader who answered
 * "exploring" -- no church to compare against -- is missing from both sides on
 * purpose, because they did not judge the match. Returns null rather than a
 * number when the sample is too small to publish, so both surfaces hide the
 * figure instead of showing a placeholder that implies one.
 *
 * The figure has always been about rank #1 -- the old yes/no asked about "the
 * top match" and simply did not say so in the copy. That is why the name is now
 * explicit and the arithmetic did not move: renaming it kept the rows written
 * under the old wording, and the published number never dipped.
 */
export function topOneAccuracy(feedback: QuizStats["feedback"]): QuizAccuracy | null {
  if (!feedback) return null;
  const judged = feedback.accurateYes + feedback.accurateNo;
  if (judged < MIN_JUDGED) return null;
  return { percent: Math.round((feedback.accurateYes / judged) * 100), judged };
}

/** The old name, kept so an unchanged import still means the same figure. */
export const quizAccuracy = topOneAccuracy;

/** One bar of a rank breakdown: a bucket and its count. */
export type RankBucketBar = { bucket: RankBucket; count: number };

/** A breakdown ready to print: the bars in reading order and their denominator. */
export type RankBreakdownView = { buckets: RankBucketBar[]; judged: number };

/**
 * Shape one of the two levels' tallies into bars.
 *
 * The denominator is the count of rows that answered *that* level, which the
 * server sends beside the buckets; it is what every bar is a share of. It is
 * deliberately not `accurateYes + accurateNo`: legacy "no" rows answered the
 * question without naming a position, so they sit in that pair and in no bar
 * here, and printing each list with its own denominator is what keeps both
 * honest. A payload that arrived without the count falls back to the bars' own
 * sum, which is the same number on any worker that sends the buckets.
 */
function breakdownView(
  counts: RankBreakdown | undefined,
  judged: number | undefined
): RankBreakdownView | null {
  if (!counts) return null;
  const buckets = RANK_BUCKETS.map((bucket) => ({ bucket, count: counts[bucket] ?? 0 }));
  const total =
    typeof judged === "number" ? judged : buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total < MIN_JUDGED) return null;
  return { buckets, judged: total };
}

/**
 * Where the closest *family* sat, out of the eight the card printed.
 *
 * The first of the two levels: `top1` means the family the quiz ranked first
 * was the right one, and the escape hatch ("none of these families") counts as
 * `beyond`, because it is a statement about coverage.
 */
export function familyRankBreakdown(feedback: QuizStats["feedback"]): RankBreakdownView | null {
  return breakdownView(feedback?.familyRanks, feedback?.familyJudged);
}

/**
 * Where their *denomination* sat in the full list.
 *
 * This is the level the top-1 figure used to live on: a row in the `top1` bar
 * here is a row `matchRankPos = 1` -- the same row, not merely a similar one.
 * Since 0008 the stance outranks it, so `top1` here includes rows that said the
 * match was not close. Fewer rows answer it than answer the family picker,
 * because the second picker is optional and "not in this list" lands in
 * `beyond`.
 */
export function matchRankBreakdown(feedback: QuizStats["feedback"]): RankBreakdownView | null {
  return breakdownView(feedback?.matchRanks, feedback?.matchJudged);
}

/** One bar of the stance breakdown: an answer and how many readers gave it. */
export type StanceBar = { stance: FeedbackStance; count: number };

/** The stance tally ready to print: the four answers and their denominator. */
export type StanceView = { buckets: StanceBar[]; judged: number };

/**
 * How the readers who answered the stance question split across its four
 * answers (0008).
 *
 * This is the only figure that includes `exploring` -- a reader with no church
 * to compare against. They are an answer here and absent from
 * `topOneAccuracy`, which is the whole reason the question exists: it is what
 * separates "the match was wrong for me" from "I have nothing to compare it to".
 *
 * Null below `MIN_JUDGED`, like every other figure here -- and on a database
 * where the question has only just shipped, every existing row predates it, so
 * the row hides rather than printing four zeros.
 */
export function stanceBreakdown(feedback: QuizStats["feedback"]): StanceView | null {
  if (!feedback?.stanceCounts) return null;
  const buckets = FEEDBACK_STANCES.map((stance) => ({
    stance,
    count: feedback.stanceCounts?.[stance] ?? 0,
  }));
  const total =
    typeof feedback.stanceJudged === "number"
      ? feedback.stanceJudged
      : buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total < MIN_JUDGED) return null;
  return { buckets, judged: total };
}
