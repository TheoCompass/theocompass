import { hasValidAdminCode } from "./roadmap";
import { invalidateStatsCache } from "./quiz-stats";

/**
 * Post-quiz feedback, and the queue behind it.
 *
 *   POST  /api/feedback      leave feedback after a run (anonymous, idempotent)
 *   GET   /api/feedback      the queue (moderator code)
 *   PATCH /api/feedback/:id  move a row between new / reviewed / hidden
 *
 * Three things and a sentence: how the quiz felt overall (1-5 stars), whether
 * the top match described the reader (yes / no / skipped), and an optional note.
 * The card lives at the bottom of the results page, so it is answered right
 * after the result it describes, while the reader still remembers whether it
 * rang true.
 *
 * The stars changed question once. They used to ask how close the match felt,
 * and rows written then carry `rating_metric = 'fit'`; everything this handler
 * writes is `'experience'`. The column exists so those two measurements never
 * meet in an average -- `/api/stats` publishes the experience ratings only --
 * and so a re-read of the queue can still tell which question a number answers.
 *
 * `sessionId` is generated once per card and acts as the idempotency key: the
 * UNIQUE index on `feedback.session_id` plus `ON CONFLICT DO NOTHING` means a
 * retry after a dropped response is the same submission, not a second rating.
 * `recorded: false` therefore means "already have it", never "failed".
 *
 * Storage only, on purpose. A report is one actionable defect a handful of times
 * a day; feedback arrives after every quiz, and a mail per row would be a second
 * inbox nobody reads. The plumbing for notifications exists (`FLAG_EMAIL`,
 * `FLAG_WEBHOOK_URL`, see `issue-reports.ts`) and should be pointed at a daily
 * digest -- or at `rating <= 2` only -- if it is ever turned on. It is off now.
 *
 * The comment is the reader's own words, capped at NOTE_MAX and never sent to
 * analytics. No aggregate is derived from it either: `/api/stats` publishes a
 * count, an average and a five-bucket histogram, and no prose leaves this table
 * except through the moderator queue.
 */

export const FEEDBACK_STATUSES = ["new", "reviewed", "hidden"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

const QUIZ_MODES = ["quick", "standard", "deep"] as const;
type QuizMode = (typeof QUIZ_MODES)[number];

/** Room for one paragraph of context, not for an essay. Matches the report note. */
const NOTE_MAX = 500;

/**
 * Hourly ceiling across the whole table.
 *
 * One rating per completed quiz is plausible; a hundred an hour from one place
 * is not, and this endpoint has no Turnstile. The session id stops a *retry*
 * duplicating, this stops a *script*. Sized well above a good day so it never
 * fires on real traffic.
 */
const HOURLY_CAP = 120;

/** Session ids and match ids are all short and URL-safe; anything else is not ours. */
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

type FeedbackEnv = { DB: D1Database; ADMIN_CODE?: string };

function jsonError(error: string, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify({ error }), { status, headers });
}

function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

function isQuizMode(value: unknown): value is QuizMode {
  return typeof value === "string" && (QUIZ_MODES as readonly string[]).includes(value);
}

/** Optional ids: trimmed, and only kept when they look like one of ours. */
function optionalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : null;
}

function optionalInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= min && rounded <= max ? rounded : null;
}

function optionalLabel(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * Free text, with control characters removed (they only ever arrive from a
 * paste) and truncated rather than rejected: a long note is still feedback.
 */
function optionalNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, NOTE_MAX);
}

/**
 * Yes / no / skipped.
 *
 * The card lets a reader clear their answer, so "skipped" is a real state and
 * maps onto NULL rather than onto `0` -- otherwise a shrug would be counted as
 * a disagreement. Both the boolean and 0/1 spellings are accepted; anything
 * else is dropped instead of failing the whole submission.
 */
export function parseAccurate(value: unknown): 0 | 1 | null {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  return null;
}

export type FeedbackInput = {
  sessionId: string;
  rating: number;
  accurate: 0 | 1 | null;
  comment: string | null;
  mode: QuizMode | null;
  topMatchId: string | null;
  topMatchName: string | null;
  answeredCount: number | null;
  appVersion: string | null;
};

type ParseResult = { ok: true; value: FeedbackInput } | { ok: false; error: string };

/**
 * Two fields are required -- the idempotency key and the rating, because a
 * submission with neither is not feedback. Everything else is context the
 * client happens to know; a junk optional field is dropped rather than rejected,
 * the same bargain `parseIssueReport` makes.
 */
export function parseFeedback(body: unknown): ParseResult {
  const payload = (body ?? {}) as Record<string, unknown>;

  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
  if (!ID_PATTERN.test(sessionId)) {
    return { ok: false, error: "sessionId must be 8-64 characters of [A-Za-z0-9_-]." };
  }

  if (typeof payload.rating !== "number" || !Number.isInteger(payload.rating)) {
    return { ok: false, error: "rating must be an integer between 1 and 5." };
  }
  if (payload.rating < 1 || payload.rating > 5) {
    return { ok: false, error: "rating must be an integer between 1 and 5." };
  }

  return {
    ok: true,
    value: {
      sessionId,
      rating: payload.rating,
      accurate: parseAccurate(payload.accurate),
      comment: optionalNote(payload.comment),
      mode: isQuizMode(payload.mode) ? payload.mode : null,
      topMatchId: optionalId(payload.topMatchId),
      topMatchName: optionalLabel(payload.topMatchName, 120),
      answeredCount: optionalInt(payload.answeredCount, 1, 200),
      appVersion: optionalLabel(payload.appVersion, 24),
    },
  };
}

async function countRecentFeedback(env: FeedbackEnv): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM feedback WHERE created_at > datetime('now', '-1 hour')`
  ).first<{ count: number | null }>();
  return Number(row?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Handlers (the public surface of this module).
// ---------------------------------------------------------------------------

/**
 * Stores one submission.
 *
 * Returns 200 with `recorded: false` when this session id is already stored --
 * a retry or a double tap, not a failure -- so the card can say thank you either
 * way. A 429 means feedback is arriving faster than people complete a quiz; the
 * card offers the mailto fallback instead of pretending it landed.
 */
export async function handlePostFeedback(
  request: Request,
  env: FeedbackEnv,
  headers: HeadersInit,
  dataVersion: string
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected a JSON body.", 400, headers);
  }

  const parsed = parseFeedback(body);
  if (!parsed.ok) {
    return jsonError(parsed.error, 400, headers);
  }

  const feedback = parsed.value;

  const recent = await countRecentFeedback(env);
  if (recent >= HOURLY_CAP) {
    return jsonError("Too much feedback in the last hour. Please try again later.", 429, headers);
  }

  const result = await env.DB.prepare(
    `INSERT INTO feedback
       (session_id, rating, accurate, comment, mode, top_match_id, top_match_name,
        answered_count, app_version, data_version, status, rating_metric)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'experience')
     ON CONFLICT(session_id) DO NOTHING`
  )
    .bind(
      feedback.sessionId,
      feedback.rating,
      feedback.accurate,
      feedback.comment,
      feedback.mode,
      feedback.topMatchId,
      feedback.topMatchName,
      feedback.answeredCount,
      feedback.appVersion,
      dataVersion
    )
    .run();

  const recorded = Boolean(result.meta && result.meta.changes > 0);
  // The landing-page panel reads these aggregates through /api/stats, which has
  // its own 60s cache: without this a new rating can take a minute to appear.
  if (recorded) invalidateStatsCache();

  return new Response(
    JSON.stringify({ status: "success", data: { recorded, sessionId: feedback.sessionId } }),
    { headers }
  );
}

type FeedbackRow = {
  id: number;
  rating: number | null;
  accurate: number | null;
  comment: string | null;
  mode: string | null;
  top_match_id: string | null;
  top_match_name: string | null;
  answered_count: number | null;
  app_version: string | null;
  data_version: string | null;
  status: string;
  rating_metric: string;
  created_at: string | null;
};

const FEEDBACK_COLUMNS = `id, rating, accurate, comment, mode, top_match_id, top_match_name,
                          answered_count, app_version, data_version, status, rating_metric,
                          created_at`;

function feedbackFrom(row: FeedbackRow) {
  return {
    id: Number(row.id),
    rating: row.rating,
    // Which question the stars answered: 'experience' for every row this handler
    // writes, 'fit' for the match-closeness rows from before the card changed.
    // The queue prints it, because the same number means two things.
    ratingMetric: row.rating_metric,
    // Tri-state, so "skipped" stays distinguishable from "no" in the queue --
    // the average never needs it, but reading the comments does.
    accurate: row.accurate === 1 ? true : row.accurate === 0 ? false : null,
    comment: row.comment,
    mode: row.mode,
    topMatchId: row.top_match_id,
    topMatchName: row.top_match_name,
    answeredCount: row.answered_count,
    appVersion: row.app_version,
    dataVersion: row.data_version,
    status: row.status,
    createdAt: row.created_at,
  };
}

/**
 * The feedback queue.
 *
 * Same lock as the roadmap editor and the report queue: `X-Admin-Code`, which
 * falls back to "mod" so a fresh clone can read its own data. It is a speed bump
 * -- these rows hold no personal data -- not authentication.
 */
export async function handleGetFeedback(
  request: Request,
  env: FeedbackEnv,
  headers: HeadersInit
): Promise<Response> {
  if (!hasValidAdminCode(request, env)) {
    return jsonError("Invalid access code.", 401, headers);
  }

  const params = new URL(request.url).searchParams;
  const statusParam = params.get("status");
  const status = isFeedbackStatus(statusParam) ? statusParam : null;
  // `?commented=1` is the view that matters: the rating and the session id are a
  // tally, the note is the part a person reads. A filter rather than a sort, so
  // the limit cannot push notes off the end behind newer bare ratings.
  const commented = /^(1|true|yes)$/i.test(params.get("commented") ?? "");

  const rawLimit = Number(params.get("limit") ?? "");
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(200, Math.trunc(rawLimit)) : 50;

  const filters: string[] = [];
  const bindings: (string | number)[] = [];
  if (status) {
    filters.push("status = ?");
    bindings.push(status);
  }
  if (commented) filters.push("comment IS NOT NULL");
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const [rows, counts] = await Promise.all([
    env.DB.prepare(
      `SELECT ${FEEDBACK_COLUMNS} FROM feedback ${where} ORDER BY created_at DESC, id DESC LIMIT ?`
    )
      .bind(...bindings, limit)
      .all<FeedbackRow>(),
    // Per-status tallies, plus how many rows said something at all. `commented`
    // is not a status, so it is summed across every one of them -- it has to
    // agree with the unfiltered `?commented=1` list it sits above.
    env.DB.prepare(
      `SELECT status, COUNT(*) AS count,
              SUM(CASE WHEN comment IS NOT NULL THEN 1 ELSE 0 END) AS commented
         FROM feedback GROUP BY status`
    ).all<{ status: string; count: number; commented: number | null }>(),
  ]);

  const byStatus: Record<string, number> = {};
  for (const name of FEEDBACK_STATUSES) byStatus[name] = 0;
  let commentedCount = 0;
  for (const row of counts.results ?? []) {
    byStatus[String(row.status)] = Number(row.count ?? 0);
    commentedCount += Number(row.commented ?? 0);
  }
  byStatus.commented = commentedCount;

  return new Response(
    JSON.stringify({
      status: "success",
      data: { counts: byStatus, feedback: (rows.results ?? []).map(feedbackFrom) },
    }),
    { headers }
  );
}

/**
 * Move one row between `new`, `reviewed` and `hidden`.
 *
 * `hidden` is the only status with a public consequence: `handleGetStats`
 * filters `status <> 'hidden'`, so hiding a row takes it out of the average
 * (when it was an experience rating) and out of the accuracy split on the
 * landing page. That is why the aggregate cache is dropped here rather than
 * waiting out its TTL -- the number should move when the button is pressed.
 *
 * The body is `{ status }` and nothing else: the note itself is never editable,
 * because rewriting a reader's words would turn a quote into something it is not.
 */
export async function handlePatchFeedback(
  request: Request,
  env: FeedbackEnv,
  headers: HeadersInit,
  id: number
): Promise<Response> {
  if (!hasValidAdminCode(request, env)) {
    return jsonError("Invalid access code.", 401, headers);
  }
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError("Expected a numeric feedback id.", 400, headers);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected a JSON body.", 400, headers);
  }

  const status = (body as { status?: unknown } | null)?.status;
  if (!isFeedbackStatus(status)) {
    return jsonError(`status must be one of: ${FEEDBACK_STATUSES.join(", ")}`, 400, headers);
  }

  const result = await env.DB.prepare("UPDATE feedback SET status = ? WHERE id = ?")
    .bind(status, id)
    .run();
  if (Number(result.meta?.changes ?? 0) === 0) {
    return jsonError(`No feedback with id ${id}.`, 404, headers);
  }

  invalidateStatsCache();

  const row = await env.DB.prepare(`SELECT ${FEEDBACK_COLUMNS} FROM feedback WHERE id = ?`)
    .bind(id)
    .first<FeedbackRow>();

  return new Response(
    JSON.stringify({
      status: "success",
      data: row ? feedbackFrom(row) : { id, status },
    }),
    { headers }
  );
}
