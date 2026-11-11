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
