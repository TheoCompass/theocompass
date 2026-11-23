import { hasValidAdminCode } from "./roadmap";
import { invalidateStatsCache } from "./quiz-stats";
import {
  familyOfDenomination,
  loadVocabulary,
  lookupDenomination,
  lookupFamily,
  type FeedbackVocabulary,
} from "./vocabulary";

/**
 * Post-quiz feedback, and the queue behind it.
 *
 *   POST  /api/feedback      leave feedback after a run (anonymous, idempotent)
 *   GET   /api/feedback      the queue (moderator code)
 *   PATCH /api/feedback/:id  move a row between new / reviewed / hidden
 *
 * Four things and a sentence: how the quiz felt overall (1-5 stars), how close
 * the top match is to where the reader actually is, which family and which
 * denomination inside it came closest, and an optional note. The card lives at
 * the bottom of the results page, so it is answered right after the result it
 * describes, while the reader still remembers whether it rang true.
 *
 * The match question is two levels of the list the reader is looking at, with
 * the names on the card: pick your own family from the full family list, then
 * your denomination inside it. `family_rank` is that family's place in the
 * family list (0 for "none of these") and `match_rank_pos` the chosen
 * denomination's place in the full results list (0 for "not one of these").
 * Both are positions, so neither asks the reader to translate their result into
 * a bucket; the published figure is the distribution of those places, which is
 * why the card can grow the lists without a migration, and "my denomination is
 * missing" has a control instead of a paragraph.
 *
 * The stance question comes first because it is the only one every reader can
 * answer: "how close is the top match to where you actually are?" -- about
 * right, close but not quite, not close, or *exploring*. That last answer is a
 * first-class answer, not a skip: a curious reader, a seeker and a doubter have
 * no church to compare against, and asking them where "their church" sat turned
 * an unanswerable question into a recorded miss. `fit_stance` is what keeps
 * their answer out of the accuracy denominator instead of deflating it.
 *
 * `accurate` is derived from the stance when there is one: `fit` is a 1, `close`
 * and `off` are a 0, and `exploring` is NULL (judged, but not against a church).
 * Without a stance it falls back to `match_rank_pos`, and without that to the
 * boolean an old bundle sends, so every wording the card has ever used still
 * lands in one column that the queue can read. That column is a *record*, not
 * the published figure: the top-1 percentage is computed on the client from
 * `stanceCounts` (`fit / (fit + close + off)`), because a legacy boolean "yes"
 * cannot be split into "exactly" and "close" and pooling it inflated the number
 * this site prints. A reader who names the #1 match as their church but says the
 * match is `off` is now a miss with a rank of 1: that disagreement -- "the top
 * match describes me better than the church I belong to" -- used to be
 * unrecordable, and it is exactly the signal worth reading.
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

/**
 * How long the two pickers can be *when the data cannot say*.
 *
 * The card offers every family (30 on the current data) and, inside the chosen
 * one, every denomination in it -- both indexed from the top of the list the
 * results page is showing, so the ranks the card sends are the places the reader
 * sees. The handler does not enforce either length: a position is checked against
 * the length of the real list (`vocabulary.ts`), and these constants are only the
 * fallback for a worker whose KV bundle could not be read. `FAMILY_RANK_MAX` is a
 * sanity ceiling comfortably above the real thirty and `MATCH_RANK_POS_MAX`
 * covers the whole 230-denomination list; nothing in the schema depends on either
 * number, because what `/api/stats` publishes is the distribution of the places
 * themselves rather than a fixed set of buckets.
 */
export const FAMILY_RANK_MAX = 64;
export const MATCH_RANK_POS_MAX = 500;

/**
 * A 1-based position, or 0 for the picker's escape hatch. Anything else -- a
 * string, a fraction, a negative, a value outside the range -- is dropped to
 * NULL rather than failing the submission, the same bargain `optionalInt` makes
 * for the rest of the row: a rating and a note are still worth keeping.
 */
export function parseRank(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 0 && value <= max ? value : null;
}

/**
 * How many rows were in the church list when the position beside it was counted.
 *
 * This is the length of a list, not a place in one, so it is never 0: the
 * escape hatch ("not in this list") says nothing about the list. Junk is dropped
 * rather than the submission, and dropping it leaves the position's own bounds
 * in charge -- a nonsense scope must not throw away a credible position. It is
 * also bounded by the data's own list length, because no card this worker served
 * could have printed more rows than the bundle holds.
 */
export function parseScope(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1 && value <= max ? value : null;
}

/**
 * How close the top match is to where the reader actually is (0008).
 *
 * Four answers, in the reader's words on the card:
 *
 *   fit        "That's about where I am"
 *   close      "Close, but not quite"
 *   off        "Not close"
 *   exploring  "I'm exploring -- I don't have a church to compare against"
 *
 * `exploring` is the reason the column exists. Before it, a reader with no
 * church had two options: the pickers' escape hatch (stored as a *miss*, which
 * deflates the published accuracy) or a skip (stored as NULL, invisible). It is
 * a real answer about the quiz, so it is stored -- and excluded from the
 * accuracy denominator, because it is not a judgement about position 1.
 *
 * Validated here rather than by a CHECK constraint, the same bargain the other
 * migrations make: an unknown value is dropped to NULL and the rest of the row
 * is still worth keeping.
 */
export const FEEDBACK_STANCES = ["fit", "close", "off", "exploring"] as const;
export type FeedbackStance = (typeof FEEDBACK_STANCES)[number];

export function parseStance(value: unknown): FeedbackStance | null {
  return typeof value === "string" && (FEEDBACK_STANCES as readonly string[]).includes(value)
    ? (value as FeedbackStance)
    : null;
}

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

type FeedbackEnv = { DB: D1Database; ADMIN_CODE?: string; THEOCOMPASS_CACHE?: KVNamespace };

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
 * Yes / no / skipped, the question the card asked before it named the positions.
 *
 * Still exported and still honoured: a tab running an old bundle sends only this
 * field, and its answer is the same answer. New rows send `matchRankPos` instead
 * and this boolean is derived from it, so the two columns can never disagree.
 * Both spellings (boolean and 0/1) are accepted; anything else is dropped
 * instead of failing the whole submission.
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
  fitStance: FeedbackStance | null;
  familyRank: number | null;
  matchRankPos: number | null;
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
 *
 * `vocabulary` is optional and is only ever used to *narrow*: with it, a position
 * is tied to a real row of a real list (see `vocabulary.ts`); without it, the
 * numeric bounds are the only check, which is what this handler did before the
 * names existed and what it still does when the KV bundle cannot be read.
 */
export function parseFeedback(
  body: unknown,
  vocabulary: FeedbackVocabulary | null = null
): ParseResult {
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

  // The lengths come from the same document the results page was built from, so
  // a position is checked against a list that exists; the constants are only for
  // a worker that cannot read the bundle. An index that knows no names cannot
  // judge a name either, so an empty vocabulary validates nothing at all.
  const familiesKnown = Boolean(vocabulary && vocabulary.families.size > 0);
  const churchesKnown = Boolean(vocabulary && vocabulary.denominations.size > 0);
  const familyMax = vocabulary && vocabulary.families.size > 0 ? vocabulary.families.size : FAMILY_RANK_MAX;
  const matchMax =
    vocabulary && vocabulary.denominations.size > 0 ? vocabulary.denominations.size : MATCH_RANK_POS_MAX;

  // The names are not stored: they are here so a position can be tied to the
  // list it was counted in. A tab left open across a re-seed, or a body that was
  // never a card, prints a name this data does not have -- and then the position
  // beside it is not a place in any list this worker can publish. Only the
  // position goes; the rating and the note are still worth keeping, and a body
  // with no names at all (every card written before the names) loses nothing.
  const familyName = lookupFamily(vocabulary, payload.familyName);
  const matchName = lookupDenomination(vocabulary, payload.matchName);

  let familyRank = parseRank(payload.familyRank, familyMax);
  let matchRankPos = parseRank(payload.matchRankPos, matchMax);

  if (familiesKnown && payload.familyName != null && familyName === null) familyRank = null;
  if (churchesKnown && payload.matchName != null && matchName === null) matchRankPos = null;

  // The card sends the length of the list it printed, so a position past the end
  // of that list is not a position: it is a body that was never on the card.
  // `0` is the escape hatch and stays whatever the scope says.
  const scope = parseScope(payload.matchRankScope, matchMax);
  if (matchRankPos !== null && matchRankPos > 0 && scope !== null && matchRankPos > scope) {
    matchRankPos = null;
  }

  // The two levels have to agree. A church named under a family it does not sit
  // in did not come from this card; the family's own place in the family list is
  // a separate statement and survives, while the church's position does not.
  const matchFamily = matchName === null ? null : familyOfDenomination(vocabulary, matchName);
  if (familyName !== null && matchFamily !== null && matchFamily !== familyName) {
    if (matchRankPos !== null && matchRankPos > 0) matchRankPos = null;
  }

  // Derived, never asked twice, and in the order the questions were asked:
  // stance (0008) first, then the denomination's position (0007), then the
  // boolean an old bundle still sends. The current card sends `fitStance` and
  // the two positions; a tab running the bundle before 0007 sends only
  // `accurate`; every one of them ends up in the same two columns.
  // `exploring` is judged but not against a church, so it leaves `accurate`
  // NULL -- which is also how a skip is stored, and that is fine: the stance
  // column is what tells the two apart.
  const fitStance = parseStance(payload.fitStance);

  const accurate: 0 | 1 | null =
    fitStance === "exploring"
      ? null
      : fitStance === "fit"
        ? 1
        : fitStance !== null
          ? 0
          : matchRankPos === null
            ? parseAccurate(payload.accurate)
            : matchRankPos === 1
              ? 1
              : 0;

  return {
    ok: true,
    value: {
      sessionId,
      rating: payload.rating,
      accurate,
      fitStance,
      familyRank,
      matchRankPos,
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

  // The list names on the card are only used to check the positions beside them,
  // so the vocabulary is read here, once per isolate, and never stored. It is
  // read *before* the parse because the parse is what narrows with it; a body
  // with no positions still pays one cached KV read, which is the price of not
  // splitting the validation across two functions that could drift apart.
  const vocabulary = await loadVocabulary(env);

  const parsed = parseFeedback(body, vocabulary);
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
       (session_id, rating, accurate, fit_stance, family_rank, match_rank_pos, comment, mode,
        top_match_id, top_match_name, answered_count, app_version, data_version, status,
        rating_metric)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'experience')
     ON CONFLICT(session_id) DO NOTHING`
  )
    .bind(
      feedback.sessionId,
      feedback.rating,
      feedback.accurate,
      feedback.fitStance,
      feedback.familyRank,
      feedback.matchRankPos,
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
  fit_stance: string | null;
  family_rank: number | null;
  match_rank_pos: number | null;
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

const FEEDBACK_COLUMNS = `id, rating, accurate, fit_stance, family_rank, match_rank_pos, comment,
                          mode, top_match_id, top_match_name, answered_count, app_version,
                          data_version, status, rating_metric, created_at`;

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
    // The stance the reader picked (0008), re-validated on the way out: a
    // hand-inserted value that never came through parseStance reads as NULL
    // rather than as a fifth answer the frontend has no label for. NULL is also
    // every row written before the question existed.
    fitStance: parseStance(row.fit_stance),
    // The two positions behind `accurate`, kept for the queue: they say *where*
    // the reader's church actually was, where the boolean only says that #1 was
    // not it. Null means the question was skipped -- and, for `familyRank`,
    // also every row written before the two-level card existed, because those
    // never saw a family list at all.
    familyRank: typeof row.family_rank === "number" ? row.family_rank : null,
    matchRankPos: typeof row.match_rank_pos === "number" ? row.match_rank_pos : null,
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
