/**
 * Free-tier D1 quota errors, recognised in one place.
 *
 * A Workers Free account gets a daily allowance of D1 rows read and written.
 * When reads run out, every query on that database throws until 00:00 UTC: the
 * stored data is untouched, the worker simply cannot read it. D1 reports this as
 * an ordinary `D1_ERROR:` message, so without this module the worker answers a
 * generic 500 and the frontend either blames the reader's setup or (worse) says
 * nothing at all while the results view spins.
 *
 * The wording belongs to Cloudflare, so matching is deliberately on the stable
 * fragment of each message rather than the whole sentence: a reworded "free
 * tier" prefix must not take the outage handling down with it. The fragments are
 * pinned by `test/d1-errors.spec.ts` -- if Cloudflare ever changes them, that
 * test is the one to update, and nothing else should need to move.
 */

export type D1QuotaScope = "read" | "write";

/** Documented message: "...exceeded D1's free tier daily row read limit..." */
const READ_LIMIT_FRAGMENT = "daily row read limit";
const WRITE_LIMIT_FRAGMENT = "daily row write limit";

/** The message a value carries, without assuming it is an `Error` instance. */
function messageOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || null;
  if (value && typeof value === "object") {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return null;
}

/**
 * Every string that could hold the D1 message.
 *
 * D1 sometimes attaches the real error as `cause` while `message` stays a
 * generic "D1_ERROR", and bindings in tests may throw a plain string, so the
 * whole chain is inspected. The loop is bounded and cycle-safe: an error that
 * points back at itself must not hang a request.
 */
function errorTexts(error: unknown): string[] {
  const texts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && !seen.has(current) && texts.length < 4) {
    seen.add(current);
    const message = messageOf(current);
    if (message) texts.push(message);
    current = (current as { cause?: unknown }).cause;
  }

  if (typeof error === "object" && error !== null) {
    const text = String(error);
    if (text && !texts.includes(text)) texts.push(text);
  }

  return texts;
}

/**
 * `"read"` / `"write"` when the error is the free-tier daily quota, else null.
 *
 * Reads are what the quiz, roadmap and stats need; writes are what an issue
 * report or a quiz-completion event needs. Both get the same treatment because
 * both leave the reader staring at a failure they cannot do anything about.
 */
export function d1QuotaScope(error: unknown): D1QuotaScope | null {
  for (const text of errorTexts(error)) {
    const haystack = text.toLowerCase();
    if (haystack.includes(READ_LIMIT_FRAGMENT)) return "read";
    if (haystack.includes(WRITE_LIMIT_FRAGMENT)) return "write";
  }
  return null;
}

/** The midnight UTC that follows `now`: the moment the free allowance resets. */
export function nextUtcMidnight(now: Date = new Date()): Date {
  // setUTCHours normalises 24 to the next day's 00:00, so this works at any
  // time of day, including exactly at midnight (which yields tomorrow).
  const reset = new Date(now.getTime());
  reset.setUTCHours(24, 0, 0, 0);
  return reset;
}

/** Seconds until `target`, never below 60: `Retry-After: 0` means "retry now". */
export function secondsUntil(target: Date, now: Date = new Date()): number {
  return Math.max(60, Math.ceil((target.getTime() - now.getTime()) / 1000));
}

/**
 * The 503 the frontend turns into "TheoCompass is paused for today".
 *
 * 503, not 429: the whole deployment is out of allowance until a fixed moment,
 * which is exactly what "temporarily unavailable" means. 429 would claim this
 * one caller is being throttled and invite a fast retry loop; 500 would call it
 * a bug. `Retry-After` carries the reset moment for anything that speaks HTTP,
 * and `resetAt` carries it in the body because `Retry-After` is not a
 * CORS-safelisted response header (it is exposed explicitly in `index.ts`).
 *
 * The reader-facing sentence lives in the frontend (`lib/d1-limit.ts`): the API
 * returns a stable `code`, the scope and the reset time, and the UI owns the
 * wording, the same way it owns every other message in this app.
 */
export function d1QuotaResponse(
  scope: D1QuotaScope,
  headers: Record<string, string>,
  now: Date = new Date()
): Response {
  const resetAt = nextUtcMidnight(now);

  return new Response(
    JSON.stringify({
      error: `D1 free tier daily row ${scope} limit reached`,
      code: "D1_LIMIT_REACHED",
      scope,
      resetAt: resetAt.toISOString(),
    }),
    {
      status: 503,
      headers: {
        ...headers,
        // Never cache an outage: the first request after the reset has to reach
        // D1 again instead of being answered by an edge copy of this 503.
        "Cache-Control": "no-store",
        "Retry-After": String(secondsUntil(resetAt, now)),
      },
    }
  );
}
