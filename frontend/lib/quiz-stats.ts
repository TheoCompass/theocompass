import { fetchQuizStats, type QuizStats } from "./api";

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

/** Ratings need a sample before an average is worth publishing. */
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
 * How often readers said the top match described them.
 *
 * `judged` is yes + no, not the number of ratings: a skipped question is a
 * shrug, and counting it as a disagreement would understate the match. Returns
 * null rather than a number when the sample is too small to publish, so both
 * surfaces hide the figure instead of showing a placeholder that implies one.
 */
export function quizAccuracy(feedback: QuizStats["feedback"]): QuizAccuracy | null {
  if (!feedback) return null;
  const judged = feedback.accurateYes + feedback.accurateNo;
  if (judged < MIN_JUDGED) return null;
  return { percent: Math.round((feedback.accurateYes / judged) * 100), judged };
}
