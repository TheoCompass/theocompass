/**
 * Quiz completion events and the aggregate stats the landing page shows.
 *
 *   POST /api/quiz/events   record one completed quiz (anonymous, idempotent)
 *   GET  /api/stats         aggregate counters for the homepage strip
 *
 * Nothing identifying is stored: no email, IP, user agent or free text -- just
 * the outcome of a run (mode, answer count, top match, tolerance/certainty).
 * The client generates a session id per completed quiz; the UNIQUE index on
 * quiz_events.session_id means a retry records once. Developer "skip to a
 * result" runs never post here: only the normal completion path calls this
 * endpoint, so generated/inspected results do not enter the public counters.
 *
 * `/api/stats` also carries the post-quiz feedback totals (task 0.9). Those rows
 * live in their own table and do contain prose, but only counts and averages
 * cross the boundary: this endpoint never selects a comment, and never will.
 */

const QUIZ_MODES = ["quick", "standard", "deep"] as const;
type QuizMode = (typeof QUIZ_MODES)[number];

type StatsEnv = { DB: D1Database };

const CACHE_TTL_MS = 60_000;
let cachedStats: { payload: string; expiresAt: number } | null = null;

export function invalidateStatsCache(): void {
  cachedStats = null;
}

function jsonError(error: string, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify({ error }), { status, headers });
}

// Handlers first (the public surface of this module), then the validation and
// aggregation helpers they lean on.

export async function handlePostQuizEvent(
  request: Request,
  env: StatsEnv,
  headers: HeadersInit,
  dataVersion: string
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected a JSON body.", 400, headers);
  }

  const parsed = parseQuizEvent(body);
  if (!parsed.ok) {
    return jsonError(parsed.error, 400, headers);
  }

  const event = parsed.value;
  const result = await env.DB.prepare(
    `INSERT INTO quiz_events
       (session_id, mode, top_family, top_match_id, top_match_name, top_match_score,
        answered_count, user_tolerance, user_certainty, data_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO NOTHING`
  )
    .bind(
      event.sessionId,
      event.mode,
      event.topFamily,
      event.topMatchId,
      event.topMatchName,
      event.topMatchScore,
      event.answeredCount,
      event.userTolerance,
      event.userCertainty,
      dataVersion
    )
    .run();

  const recorded = Boolean(result.meta && result.meta.changes > 0);
  if (recorded) invalidateStatsCache();

  return new Response(
    JSON.stringify({ status: "success", data: { recorded, sessionId: event.sessionId } }),
    { headers }
  );
}

type CountRow = { count: number | null };
type GroupRow = { key: string | null; count: number | null };
type DailyRow = { day: string | null; count: number | null };
type HistogramRow = { bucket: number | null; count: number | null };
type SampleRow = {
  family_sample: number | null;
  match_sample: number | null;
  score_sample: number | null;
  distinct_families: number | null;
};
type MedianRow = { median: number | null };
type PostureRow = {
  tolerance: number | null;
  certainty: number | null;
  sample: number | null;
};

/**
 * One row, because the whole feedback aggregate is a single pass over a small
 * table: `rating_1..5` build the histogram without a second GROUP BY, and the
 * `family_*` / `match_*` sums build the two breakdowns the same way.
 *
 * The buckets are ranges on purpose. `family_rank` and `match_rank_pos` are
 * positions in the list the reader saw (0 is that list's escape hatch), so the
 * published buckets are `=1`, `2-3`, `4-8` and everything else -- which stays
 * true if the card ever shows six families instead of eight.
 */
type FeedbackRow = {
  total: number | null;
  average: number | null;
  accurate_yes: number | null;
  accurate_no: number | null;
  rating_1: number | null;
  rating_2: number | null;
  rating_3: number | null;
  rating_4: number | null;
  rating_5: number | null;
  family_top1: number | null;
  family_top3: number | null;
  family_top8: number | null;
  family_beyond: number | null;
  family_judged: number | null;
  match_top1: number | null;
  match_top3: number | null;
  match_top8: number | null;
  match_beyond: number | null;
  match_judged: number | null;
  stance_fit: number | null;
  stance_close: number | null;
  stance_off: number | null;
  stance_exploring: number | null;
  stance_judged: number | null;
};

const DAILY_DAYS = 14;
const HISTOGRAM_BUCKETS = 20;

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberFrom(row: CountRow | undefined | null): number {
  return numeric(row?.count);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function groupsFrom(rows: GroupRow[] | undefined): Array<{ name: string; count: number }> {
  if (!rows) return [];
  return rows
    .filter((row) => row.key)
    .map((row) => ({ name: String(row.key), count: numberFrom(row) }));
}

/**
 * UTC day keys, oldest first, ending today. D1's `date('now')` and
 * `date(created_at)` are UTC, so the zero-fill has to be built on the same
 * clock or the last bar would be a day out for anyone east of Greenwich.
 */
function lastUtcDays(count: number): string[] {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: count }, (_, index) =>
    new Date(today - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10)
  );
}

function dailyFrom(rows: DailyRow[] | undefined): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    if (row.day) counts.set(row.day, numeric(row.count));
  }
  return lastUtcDays(DAILY_DAYS).map((date) => ({ date, count: counts.get(date) ?? 0 }));
}

function histogramFrom(rows: HistogramRow[] | undefined): number[] {
  const histogram = new Array<number>(HISTOGRAM_BUCKETS).fill(0);
  for (const row of rows ?? []) {
    const bucket = row.bucket;
    if (typeof bucket !== "number" || !Number.isInteger(bucket)) continue;
    if (bucket < 0 || bucket >= histogram.length) continue;
    histogram[bucket] = numeric(row.count);
  }
  return histogram;
}

/**
 * Counts, an average and a five-bucket histogram -- and nothing else.
 *
 * `total` is the number of *experience* ratings, not the number of rows: it is
 * the denominator printed beside `averageRating`, so it has to match the
 * average and the histogram. Rows from before the stars changed question carry
 * `rating_metric = 'fit'` and are left out of all five numbers. Their rank
 * answers are not left out -- "where was the best match?" is the same question
 * the yes/no was asking.
 *
 * There are four figures here and four denominators, and none of them is the
 * row count:
 *
 *   stanceJudged the stance (0008): fit / close / off / exploring, four
 *                mutually exclusive buckets. The only denominator that
 *                includes `exploring`, and the only one that is not a subset
 *                of the accuracy split.
 *   familyRanks  the family the reader picked, including 0 for "none of these"
 *                familyJudged = the four buckets, i.e. the rows that named one
 *   matchRanks   where their denomination sat, 0 for "not one of these"
 *                matchJudged  = the four buckets
 *   accurateYes/accurateNo
 *                every judged row, including the pre-0007 yes/no answers that
 *                never named a position. That is the figure the panel has
 *                published since before the positions existed, so its
 *                denominator has to keep spanning both wordings. `exploring`
 *                rows are absent from it on purpose: they are not a judgement
 *                about position 1.
 *
 * The escape hatch counts as an answer in both breakdowns: "none of these
 * fitted" is a judgement about the list, not a shrug. A skipped question is NULL
 * and sits in no bucket and in no denominator.
 *
 * `accurateShare` is deliberately not computed here: the panel already owns
 * `share()` and divides yes by the readers who actually answered, so the two
 * numbers it prints come from the same place as every other percentage in it.
 */
function feedbackFrom(row: FeedbackRow | undefined) {
  const total = numeric(row?.total);
  const average = row?.average;
  return {
    total,
    averageRating: typeof average === "number" ? round1(average) : null,
    accurateYes: numeric(row?.accurate_yes),
    accurateNo: numeric(row?.accurate_no),
    ratingHistogram: [
      numeric(row?.rating_1),
      numeric(row?.rating_2),
      numeric(row?.rating_3),
      numeric(row?.rating_4),
      numeric(row?.rating_5),
    ],
    // Always every key, zeros included: the client formats each bucket and a
    // missing key would render as "undefined%" instead of "0%".
    familyJudged: numeric(row?.family_judged),
    familyRanks: {
      top1: numeric(row?.family_top1),
      top3: numeric(row?.family_top3),
      top8: numeric(row?.family_top8),
      beyond: numeric(row?.family_beyond),
    },
    matchJudged: numeric(row?.match_judged),
    matchRanks: {
      top1: numeric(row?.match_top1),
      top3: numeric(row?.match_top3),
      top8: numeric(row?.match_top8),
      beyond: numeric(row?.match_beyond),
    },
    // The stance (0008): one population, four buckets, `exploring` included.
    // It is the only figure here whose denominator is *not* a subset of
    // `accurateYes + accurateNo` -- it is larger, because `exploring` rows are
    // answers to this question and NULL in the accuracy column.
    stanceJudged: numeric(row?.stance_judged),
    stanceCounts: {
      fit: numeric(row?.stance_fit),
      close: numeric(row?.stance_close),
      off: numeric(row?.stance_off),
      exploring: numeric(row?.stance_exploring),
    },
  };
}

export async function handleGetStats(env: StatsEnv, headers: HeadersInit): Promise<Response> {
  const now = Date.now();
  if (cachedStats && cachedStats.expiresAt > now) {
    return new Response(cachedStats.payload, {
      headers: { ...headers, "Cache-Control": "public, max-age=300" },
    });
  }

  const [
    totals,
    today,
    last7,
    byMode,
    families,
    matches,
    scores,
    daily,
    histogram,
    samples,
    median,
    posture,
    feedback,
  ] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS count, MIN(created_at) AS since FROM quiz_events"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM quiz_events WHERE date(created_at) = date('now')"),
    // Calendar days, not a rolling 7x24h window, so this always equals the last
    // seven bars of `daily` and the sparkline's "last 7" label is literally true.
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM quiz_events WHERE date(created_at) >= date('now', '-6 days')"
    ),
    env.DB.prepare("SELECT mode AS key, COUNT(*) AS count FROM quiz_events GROUP BY mode"),
    env.DB.prepare(
      `SELECT top_family AS key, COUNT(*) AS count FROM quiz_events
       WHERE top_family IS NOT NULL AND top_family <> ''
       GROUP BY top_family ORDER BY count DESC, top_family ASC LIMIT 5`
    ),
    env.DB.prepare(
      `SELECT top_match_name AS key, COUNT(*) AS count FROM quiz_events
       WHERE top_match_name IS NOT NULL AND top_match_name <> ''
       GROUP BY top_match_name ORDER BY count DESC, top_match_name ASC LIMIT 5`
    ),
    env.DB.prepare(
      "SELECT AVG(top_match_score) AS average FROM quiz_events WHERE top_match_score IS NOT NULL"
    ),
    env.DB.prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count FROM quiz_events
       WHERE date(created_at) >= date('now', '-13 days')
       GROUP BY day ORDER BY day ASC`
    ),
    // 20 buckets: bucket 0 is 0-4.9, bucket 19 is 95-100. The CAST truncates
    // toward zero; scores are clamped to 0-100 on insert, so MIN/MAX only guard
    // legacy rows.
    env.DB.prepare(
      `SELECT MIN(19, MAX(0, CAST(top_match_score / 5 AS INTEGER))) AS bucket,
              COUNT(*) AS count
       FROM quiz_events
       WHERE top_match_score IS NOT NULL
       GROUP BY bucket ORDER BY bucket ASC`
    ),
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM quiz_events
           WHERE top_family IS NOT NULL AND top_family <> '') AS family_sample,
         (SELECT COUNT(*) FROM quiz_events
           WHERE top_match_name IS NOT NULL AND top_match_name <> '') AS match_sample,
         (SELECT COUNT(*) FROM quiz_events
           WHERE top_match_score IS NOT NULL) AS score_sample,
         (SELECT COUNT(DISTINCT top_family) FROM quiz_events
           WHERE top_family IS NOT NULL AND top_family <> '') AS distinct_families`
    ),
    // Median via the two middle ranks: for an odd count both expressions are
    // the same row, for an even count they are the pair that gets averaged.
    env.DB.prepare(
      `WITH ranked AS (
         SELECT top_match_score AS score,
                ROW_NUMBER() OVER (ORDER BY top_match_score) AS rn,
                COUNT(*) OVER () AS n
         FROM quiz_events
         WHERE top_match_score IS NOT NULL
       )
       SELECT AVG(score) AS median
       FROM ranked
       WHERE rn IN ((n + 1) / 2, (n + 2) / 2)`
    ),
    // Only runs that answered both sliders count: otherwise the two averages
    // would come from different populations and read as a paired result.
    env.DB.prepare(
      `SELECT AVG(user_tolerance) AS tolerance,
              AVG(user_certainty) AS certainty,
              COUNT(*) AS sample
       FROM quiz_events
       WHERE user_tolerance IS NOT NULL AND user_certainty IS NOT NULL`
    ),
    // Post-quiz feedback (task 0.9). `status <> 'hidden'` is the reviewer's one
    // lever on the public numbers: a spam row can be kept as evidence without
    // polluting the average the landing page publishes. The comment column is not
    // selected -- this endpoint is aggregate-only by construction, and the queue
    // at /api/feedback is the only reader that ever sees a comment.
    //
    // One rating, two metrics (0006). The star figures count only
    // `rating_metric = 'experience'` rows, because the stars used to ask a
    // different question and an average over both would measure neither. The
    // accuracy terms keep their original scope -- every rated, non-hidden row --
    // so the percentage a reader sees is unaffected by that reset.
    //
    // The two position sums (0007) are scoped to non-hidden rows too, for the
    // same reason: hiding a row has to move every published figure, or the panel
    // would show a breakdown that disagrees with its own headline. They are
    // independent of `rating_metric` -- the position question is new, and the
    // rows that predate it are excluded by being NULL rather than by their
    // metric.
    //
    // `family_rank = 0` and `match_rank_pos = 0` are the two escape hatches, and
    // they belong in the `beyond` bucket rather than outside the sample: "none
    // of these fitted" is an answer about the list. The `judged` sums therefore
    // equal the four buckets, and are what the bars divide by.
    env.DB.prepare(
      `SELECT SUM(CASE WHEN rating_metric = 'experience' THEN 1 ELSE 0 END) AS total,
              AVG(CASE WHEN rating_metric = 'experience' THEN rating END) AS average,
              SUM(CASE WHEN accurate = 1 THEN 1 ELSE 0 END) AS accurate_yes,
              SUM(CASE WHEN accurate = 0 THEN 1 ELSE 0 END) AS accurate_no,
              SUM(CASE WHEN rating_metric = 'experience' AND rating = 1 THEN 1 ELSE 0 END) AS rating_1,
              SUM(CASE WHEN rating_metric = 'experience' AND rating = 2 THEN 1 ELSE 0 END) AS rating_2,
              SUM(CASE WHEN rating_metric = 'experience' AND rating = 3 THEN 1 ELSE 0 END) AS rating_3,
              SUM(CASE WHEN rating_metric = 'experience' AND rating = 4 THEN 1 ELSE 0 END) AS rating_4,
              SUM(CASE WHEN rating_metric = 'experience' AND rating = 5 THEN 1 ELSE 0 END) AS rating_5,
              SUM(CASE WHEN family_rank = 1 THEN 1 ELSE 0 END) AS family_top1,
              SUM(CASE WHEN family_rank BETWEEN 2 AND 3 THEN 1 ELSE 0 END) AS family_top3,
              SUM(CASE WHEN family_rank BETWEEN 4 AND 8 THEN 1 ELSE 0 END) AS family_top8,
              SUM(CASE WHEN family_rank = 0 OR family_rank > 8 THEN 1 ELSE 0 END) AS family_beyond,
              SUM(CASE WHEN family_rank IS NOT NULL THEN 1 ELSE 0 END) AS family_judged,
              SUM(CASE WHEN match_rank_pos = 1 THEN 1 ELSE 0 END) AS match_top1,
              SUM(CASE WHEN match_rank_pos BETWEEN 2 AND 3 THEN 1 ELSE 0 END) AS match_top3,
              SUM(CASE WHEN match_rank_pos BETWEEN 4 AND 8 THEN 1 ELSE 0 END) AS match_top8,
              SUM(CASE WHEN match_rank_pos = 0 OR match_rank_pos > 8 THEN 1 ELSE 0 END) AS match_beyond,
              SUM(CASE WHEN match_rank_pos IS NOT NULL THEN 1 ELSE 0 END) AS match_judged,
              -- The stance (0008), four mutually exclusive answers. Unlike the two
              -- position sums this one also counts 'exploring', and stance_judged
              -- is the sum of the four: it is a different population from
              -- accurate_yes + accurate_no, because 'exploring' rows are judged
              -- here and NULL in the accuracy column.
              SUM(CASE WHEN fit_stance = 'fit' THEN 1 ELSE 0 END) AS stance_fit,
              SUM(CASE WHEN fit_stance = 'close' THEN 1 ELSE 0 END) AS stance_close,
              SUM(CASE WHEN fit_stance = 'off' THEN 1 ELSE 0 END) AS stance_off,
              SUM(CASE WHEN fit_stance = 'exploring' THEN 1 ELSE 0 END) AS stance_exploring,
              SUM(CASE WHEN fit_stance IS NOT NULL THEN 1 ELSE 0 END) AS stance_judged
       FROM feedback
       WHERE rating IS NOT NULL AND status <> 'hidden'`
    ),
  ]);

  const totalRow = (totals.results?.[0] ?? {}) as CountRow & { since?: string | null };
  const modeCounts: Record<QuizMode, number> = { quick: 0, standard: 0, deep: 0 };
  for (const row of (byMode.results ?? []) as GroupRow[]) {
    if (isQuizMode(row.key)) modeCounts[row.key] = numberFrom(row);
  }

  const average = ((scores.results?.[0] ?? {}) as { average?: number | null }).average;
  const sampleRow = (samples.results?.[0] ?? {}) as SampleRow;
  const medianRow = (median.results?.[0] ?? {}) as MedianRow;
  const postureRow = (posture.results?.[0] ?? {}) as PostureRow;
  const feedbackRow = (feedback.results?.[0] ?? {}) as FeedbackRow;

  const payload = JSON.stringify({
    status: "success",
    data: {
      totalQuizzes: numberFrom(totalRow),
      today: numberFrom((today.results?.[0] ?? {}) as CountRow),
      last7Days: numberFrom((last7.results?.[0] ?? {}) as CountRow),
      trackingSince: totalRow.since ?? null,
      byMode: modeCounts,
      topFamilies: groupsFrom((families.results ?? []) as GroupRow[]),
      topMatches: groupsFrom((matches.results ?? []) as GroupRow[]),
      avgTopMatch: typeof average === "number" ? round1(average) : null,
      medianTopMatch: typeof medianRow.median === "number" ? round1(medianRow.median) : null,
      daily: dailyFrom((daily.results ?? []) as DailyRow[]),
      scoreHistogram: histogramFrom((histogram.results ?? []) as HistogramRow[]),
      scoreSample: numeric(sampleRow.score_sample),
      familySample: numeric(sampleRow.family_sample),
      matchSample: numeric(sampleRow.match_sample),
      distinctFamilies: numeric(sampleRow.distinct_families),
      posture: {
        tolerance: typeof postureRow.tolerance === "number" ? round1(postureRow.tolerance) : null,
        certainty: typeof postureRow.certainty === "number" ? round1(postureRow.certainty) : null,
        sample: numeric(postureRow.sample),
      },
      feedback: feedbackFrom(feedbackRow),
    },
    updatedAt: new Date().toISOString(),
  });

  cachedStats = { payload, expiresAt: now + CACHE_TTL_MS };
  return new Response(payload, {
    headers: { ...headers, "Cache-Control": "public, max-age=300" },
  });
}

function isQuizMode(value: unknown): value is QuizMode {
  return typeof value === "string" && (QUIZ_MODES as readonly string[]).includes(value);
}

/** Integers only, inside a range. Anything else becomes null (optional field dropped). */
function optionalInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function optionalScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const clamped = Math.min(100, Math.max(0, value));
  return Math.round(clamped * 10) / 10;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

type QuizEventInput = {
  sessionId: string;
  mode: QuizMode;
  answeredCount: number;
  topFamily: string | null;
  topMatchId: string | null;
  topMatchName: string | null;
  topMatchScore: number | null;
  userTolerance: number | null;
  userCertainty: number | null;
};

type ParseResult = { ok: true; value: QuizEventInput } | { ok: false; error: string };

export function parseQuizEvent(body: unknown): ParseResult {
  const payload = (body ?? {}) as Record<string, unknown>;

  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) {
    return { ok: false, error: "sessionId must be 8-64 characters of [A-Za-z0-9_-]." };
  }

  if (!isQuizMode(payload.mode)) {
    return { ok: false, error: "mode must be one of: quick, standard, deep." };
  }

  const answeredCount = optionalInt(payload.answeredCount, 1, 200);
  if (answeredCount === null) {
    return { ok: false, error: "answeredCount must be an integer between 1 and 200." };
  }

  return {
    ok: true,
    value: {
      sessionId,
      mode: payload.mode,
      answeredCount,
      topFamily: optionalText(payload.topFamily, 80),
      topMatchId: optionalText(payload.topMatchId, 120),
      topMatchName: optionalText(payload.topMatchName, 120),
      topMatchScore: optionalScore(payload.topMatchScore),
      userTolerance: optionalInt(payload.userTolerance, 0, 100),
      userCertainty: optionalInt(payload.userCertainty, 0, 100),
    },
  };
}
