import {
  fetchQuizStats,
  FEEDBACK_STANCES,
  type FeedbackStance,
  type QuizStats,
  type RankTally,
} from "./api";
import { formatDay } from "./roadmap";

/**
 * The landing page's shared view of `/api/stats`.
 *
 * Three things on that page quote the same payload: the collective-results panel,
 * the accuracy row in the quiz card, and the hero strip above the buttons. A
 * `useEffect` in each would mean three anonymous requests per page view for the
 * same numbers, so the request is memoised here instead -- the in-flight promise
 * is shared, and a success is kept in module scope, which outlives the page but
 * not the tab.
 *
 * A *failure* is deliberately not cached: a rejection held here would keep all
 * three hidden for the rest of the visit, including after a flaky connection
 * recovers. Dropping the promise lets the next mount try again.
 */

/**
 * Ten answers before a star average (or a stance share) is worth publishing.
 * `FeedbackTile` applies it per figure: the stars were reworded once, so a reset
 * rating count must not hide a percentage that is still based on the same
 * question.
 */
export const MIN_FEEDBACK = 10;

/**
 * The collective-results panel publishes nothing below this many runs, and the
 * accuracy row is gated on the same number: the figure links down to that panel,
 * so it must never appear when the panel has decided not to exist.
 */
export const MIN_QUIZZES = 10;

/**
 * Family shares, the closest-match distribution and the two posture averages
 * need a sample before any of them describes more than the last few visitors, so
 * the detailed tiles unlock together at this many runs.
 *
 * It lives here rather than in the panel because the headline figures quote the
 * same gate: the median closest match is the closeness tile's number, so it may
 * not appear in a strip above a tile that has not unlocked yet. The panel prints
 * the same constant in its progress copy.
 */
export const BREAKDOWN_RUNS = 50;

/**
 * Judgements need a sample before a percentage is worth publishing. Same
 * threshold as the average: both are claims about strangers, and both read as
 * noise below about ten.
 */
export const MIN_JUDGED = 10;

/**
 * The accuracy row links with a hash, so the browser scrolls to the panel on
 * its own. This event lets the same click also reopen a panel the reader has
 * collapsed: once the hash matches, `hashchange` no longer fires.
 */
export const OPEN_COLLECTIVE_RESULTS = "theocompass:collective-results";

/**
 * Ask the panel to open, from any link that points at its hash.
 *
 * The hash does the scrolling on its own; the event is only needed for a click on
 * a hash that already matches, because then `hashchange` never fires. Every entry
 * point dispatches through here -- the accuracy row and the hero strip -- so they
 * cannot drift into one of them forgetting it.
 */
export function openCollectiveResults(): void {
  window.dispatchEvent(new Event(OPEN_COLLECTIVE_RESULTS));
}

/** The two formats every figure on the landing page prints through. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

export function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

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

/** The figures the accuracy row needs, or null when there are too few answers. */
export type TopOneMatch = {
  /** Of the readers who compared, the share who said the #1 match *is* where they are. */
  percent: number;
  /** The near-miss band: "close, but not quite". Never part of `percent`. */
  closePercent: number;
  /** `fit + close + off` -- the stance, minus the readers with nothing to compare. */
  judged: number;
};

/**
 * How often the #1 match was the right one, in the words the card asks it.
 *
 * `fit` is the numerator and only `fit`: the readers who said the top match is
 * *exactly* where they are. `close` is a miss here and a printed near-miss
 * beside it, because "right family, wrong church" is not the #1 match being
 * right -- and counting it as a hit is how the old yes/no overestimated this
 * figure, since a binary answer had nowhere else for a reader to put it.
 *
 * The denominator is `fit + close + off`, summed here rather than taken from
 * `stanceJudged`, so the numerator and the denominator cannot come from
 * different populations even if an older worker sends the counts without the
 * total. Two kinds of row are outside it by construction:
 *
 *   exploring   an answer, but not a judgement of the match: there is no church
 *               to compare against. Counting them as misses is the bug 0008
 *               exists to fix.
 *   legacy      a pre-0008 row with no `fit_stance` -- the boolean `accurate`
 *               answers under `accurateYes` / `accurateNo`. A legacy "yes" may
 *               have meant "close", and no amount of arithmetic can split it, so
 *               the pooled boolean is not divided here at all. Those rows stay in
 *               the table, in `/api/stats` and in the moderator queue; they are
 *               only kept out of this percentage.
 *
 * Returns null rather than a number when the sample is too small to publish, so
 * both surfaces hide the figure instead of showing a placeholder that implies
 * one. On a database where the stance has only just shipped that is every
 * surface, which is the same rule the two rank curves follow.
 */
export function topOneMatch(feedback: QuizStats["feedback"]): TopOneMatch | null {
  if (!feedback?.stanceCounts) return null;
  const judged = comparedCount(feedback);
  if (judged < MIN_JUDGED) return null;
  const fit = feedback.stanceCounts.fit ?? 0;
  const close = feedback.stanceCounts.close ?? 0;
  return {
    percent: Math.round((fit / judged) * 100),
    closePercent: Math.round((close / judged) * 100),
    judged,
  };
}

/**
 * How many readers compared the match with their own church: `fit + close +
 * off`, and nothing else.
 *
 * Exported because the panel prints the number while it is still growing ("2 so
 * far"), below the gate that hides `topOneMatch`, and two copies of this sum
 * would eventually disagree. `exploring` is excluded -- there was no church to
 * compare -- and so are pre-0008 rows, whose boolean answer said nothing about
 * *exactly* how wrong the match was.
 */
export function comparedCount(feedback: QuizStats["feedback"]): number {
  const counts = feedback?.stanceCounts;
  if (!counts) return 0;
  return (counts.fit ?? 0) + (counts.close ?? 0) + (counts.off ?? 0);
}

/** One place on a rank curve: the answers there and the share at or above it. */
export type RankCurvePoint = { rank: number; count: number; share: number };

/**
 * One level of the match answer, ready to plot.
 *
 * `points` is ascending by place, one entry per place someone actually picked,
 * each carrying the cumulative `share` of the answers at or above it -- so the
 * panel draws a step curve straight from the data without inventing ranges.
 * `none` is the escape hatch, which is in the denominator and off the axis: a
 * reader who said "none of these" is not at place 0, they are outside the list.
 *
 * The quantiles come from the API (one convention, tested server-side) and are
 * printed as `#n`. Null below `MIN_JUDGED`, like every other figure here.
 */
export type RankCurveView = {
  points: RankCurvePoint[];
  ranked: number;
  none: number;
  judged: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
  /** The deepest place anyone picked: the axis ends here, not at the list's end. */
  maxRank: number;
};

/**
 * Shape one of the two levels into a curve.
 *
 * The denominator is the count of rows that answered *that* level, which the
 * server sends beside the tally; it is what the curve is a share of. It is not
 * `accurateYes + accurateNo`: legacy "no" rows answered the question without
 * naming a position, so they sit in that pair and on no curve here, and each
 * level printing its own denominator is what keeps both honest.
 *
 * A tally with only escape-hatch answers is not null: it is a real result
 * ("everyone who answered said None of these") and the component says so.
 */
function curveFrom(counts: RankTally | undefined, judged: number | undefined): RankCurveView | null {
  if (!counts?.counts) return null;
  const total = typeof judged === "number" ? judged : counts.ranked + counts.none;
  if (total < MIN_JUDGED) return null;

  const entries = Object.entries(counts.counts)
    .map(([rank, count]) => [Number(rank), Number(count)] as const)
    .filter(([rank, count]) => Number.isInteger(rank) && rank > 0 && count > 0)
    .sort((a, b) => a[0] - b[0]);

  const ranked = entries.reduce((sum, [, count]) => sum + count, 0);
  let cumulative = 0;
  const points = entries.map(([rank, count]) => {
    cumulative += count;
    return { rank, count, share: cumulative / ranked };
  });

  return {
    points,
    ranked,
    none: typeof counts.none === "number" ? counts.none : Math.max(0, total - ranked),
    judged: total,
    median: counts.median ?? null,
    p25: counts.p25 ?? null,
    p75: counts.p75 ?? null,
    p90: counts.p90 ?? null,
    maxRank: entries.length > 0 ? entries[entries.length - 1][0] : 0,
  };
}

/**
 * Where their own *family* sat, out of the thirty the card now offers.
 *
 * The first of the two levels: a median of `#1` means half the readers who
 * answered saw their own family at the top, and the tail past the median is
 * readers whose family was in the second half of the list.
 */
export function familyRankCurve(feedback: QuizStats["feedback"]): RankCurveView | null {
  return curveFrom(feedback?.familyRanks, feedback?.familyJudged);
}

/**
 * Where their own *denomination* sat in the full results list.
 *
 * This is the level the top-1 figure lives on: a row at place 1 here is a row
 * `matchRankPos = 1` -- the same row, not merely a similar one. Since 0008 the
 * stance outranks it, so place 1 here includes rows that said the match was not
 * close. Fewer rows answer it than answer the family picker, because the second
 * picker is optional and a family with no matched church never offers one.
 */
export function matchRankCurve(feedback: QuizStats["feedback"]): RankCurveView | null {
  return curveFrom(feedback?.matchRanks, feedback?.matchJudged);
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
 * to compare against. They are an answer here and absent from `topOneMatch`,
 * which is the whole reason the question exists: it is what separates "the match
 * was wrong for me" from "I have nothing to compare it to".
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

/**
 * One headline figure of the collective results, ready to print.
 *
 * `label` is how the panel's summary row names it, `short` is how the hero strip
 * can name it inside a single line, and `note` carries the denominator or the
 * start date. Keeping all three beside the value is what lets the two surfaces
 * share one gate: a figure that has not earned its sample is simply not in the
 * list, so neither place can print it early.
 */
export type CollectiveFigure = {
  key: "runs" | "closeness" | "rating";
  label: string;
  short: string;
  value: string;
  note: string | null;
};

/**
 * The headline numbers: runs always, closeness from `BREAKDOWN_RUNS`, the star
 * average from `MIN_FEEDBACK` ratings.
 *
 * The gates are the tiles' own, restated once. The closeness figure is the
 * closeness tile's median and nothing else may stand in for it below the tile's
 * sample -- an "average closest match" from twenty runs next to a locked
 * distribution would be a claim the page does not make anywhere else. The mean is
 * therefore only a fallback for a payload that arrived without a median, exactly
 * as the expanded panel had it.
 *
 * Runs are unconditional because the card itself only exists above `MIN_QUIZZES`;
 * callers decide whether that gate is met. Everything is derived from the payload
 * the panel already fetched, so a page view still makes one `/api/stats` request.
 */
export function collectiveFigures(stats: QuizStats): CollectiveFigure[] {
  const since = formatDay(stats.trackingSince);
  const median = typeof stats.medianTopMatch === "number" ? stats.medianTopMatch : null;
  const mean = typeof stats.avgTopMatch === "number" ? stats.avgTopMatch : null;
  const closeness = stats.totalQuizzes >= BREAKDOWN_RUNS ? median ?? mean : null;
  const sample = stats.scoreSample ?? 0;
  const rating = stats.feedback?.averageRating ?? null;
  const ratings = stats.feedback?.total ?? 0;

  const figures: CollectiveFigure[] = [
    {
      key: "runs",
      label: "Runs recorded",
      short: "runs recorded",
      value: formatCount(stats.totalQuizzes),
      note: since ? `since ${since}` : null,
    },
  ];

  if (closeness !== null) {
    figures.push({
      key: "closeness",
      label: "Median closest match",
      short: "median match",
      value: `${formatScore(closeness)}%`,
      note: sample > 0 ? `over ${formatCount(sample)} scored runs` : null,
    });
  }

  if (rating !== null && ratings >= MIN_FEEDBACK) {
    figures.push({
      key: "rating",
      label: "Quiz experience",
      short: "quiz rating",
      value: `${formatScore(rating)} / 5`,
      note: `from ${formatCount(ratings)} rating${ratings === 1 ? "" : "s"}`,
    });
  }

  return figures;
}

/**
 * Whether the feedback tile has anything to print.
 *
 * The star average, the stance share and the two rank curves are gated
 * separately -- the star question was reworded once, so a reset rating count must
 * not hide answers that are still about the same match. That makes "the tile is
 * empty" a question about five thresholds, and the panel's grid pays for getting
 * it wrong: a band that exists with nothing in it is a blank row, and one that is
 * missing while its data exists hides published answers. It sits beside
 * `collectiveFigures()` so both gates on this payload are read in one place.
 *
 * The `accurateYes + accurateNo` branch is the legacy one, kept so a database
 * that holds only pre-0008 answers still gets its stars and its curves. It is not
 * the figure the tile prints: `topOneMatch()` reads the stance and nothing else.
 */
export function hasFeedbackFigures(feedback: QuizStats["feedback"]): boolean {
  if (!feedback) return false;
  const legacyJudged = feedback.accurateYes + feedback.accurateNo;
  return (
    feedback.total >= MIN_FEEDBACK ||
    legacyJudged >= MIN_FEEDBACK ||
    stanceBreakdown(feedback) !== null ||
    familyRankCurve(feedback) !== null ||
    matchRankCurve(feedback) !== null
  );
}

