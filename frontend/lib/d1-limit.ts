/**
 * What the free-tier D1 outage looks like in the browser.
 *
 * TheoCompass runs on an account with a daily allowance of database rows. When
 * that allowance is gone, the API answers 503 with `code: "D1_LIMIT_REACHED"`
 * (see `theocompass-api/src/d1-errors.ts`) and every screen loses its data at
 * once. Without this module the reader would see "Could not load questions. Make
 * sure your database API is running." -- advice that cannot help them -- or a
 * spinner, because a failed calculation had nowhere to report itself.
 *
 * This file owns the wording and the clock formatting; the worker owns only the
 * facts (scope, reset moment). Keeping them apart means a copy change never
 * needs a deploy of the API, and the API stays useful to any other client.
 */

/** The `code` the worker puts on a quota response. */
export const D1_LIMIT_CODE = "D1_LIMIT_REACHED";

/** Used as the headline anywhere the outage is explained. */
export const D1_LIMIT_HEADING = "TheoCompass is paused for today";

export type D1QuotaScope = "read" | "write";

export interface D1LimitDetails {
  scope: D1QuotaScope;
  /** When the allowance resets, if the server said; otherwise null. */
  resetAt: Date | null;
  /** `Retry-After` in seconds, when the header survived CORS. */
  retryAfterSeconds: number | null;
}

/**
 * A quota failure, distinguishable from every other error by `instanceof`.
 *
 * `message` is plain and time-free on purpose: it is what a UI shows when it has
 * no room for the full explanation (a toast, a log line). Screens that can
 * afford a sentence use `d1LimitMessage`, which adds the reset time.
 */
export class D1LimitError extends Error {
  readonly scope: D1QuotaScope;
  readonly resetAt: Date | null;
  readonly retryAfterSeconds: number | null;

  constructor(details: D1LimitDetails) {
    super("TheoCompass has used its free daily database allowance.");
    this.name = "D1LimitError";
    this.scope = details.scope;
    this.resetAt = details.resetAt;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

export function isD1LimitError(error: unknown): error is D1LimitError {
  return error instanceof D1LimitError;
}

/** `Retry-After` is either delta-seconds or an HTTP date; both are accepted. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds);

  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.round((date - Date.now()) / 1000));
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The quota error carried by a failed response, or null for anything else.
 *
 * Matching on `code` rather than on status keeps a deploy-time 503 or a proxy
 * error from being explained as a quota outage. The header is read here as well
 * as the body so a client that only stores headers still gets the reset time.
 */
export function d1LimitErrorFromBody(
  body: unknown,
  retryAfterHeader: string | null = null
): D1LimitError | null {
  if (!body || typeof body !== "object") return null;

  const payload = body as { code?: unknown; scope?: unknown; resetAt?: unknown };
  if (payload.code !== D1_LIMIT_CODE) return null;

  return new D1LimitError({
    scope: payload.scope === "write" ? "write" : "read",
    resetAt: parseDate(payload.resetAt),
    retryAfterSeconds: parseRetryAfter(retryAfterHeader),
  });
}

/** The midnight UTC that follows `now`: the daily counter's reset moment. */
function nextUtcMidnight(now: Date): Date {
  const reset = new Date(now.getTime());
  reset.setUTCHours(24, 0, 0, 0);
  return reset;
}

/**
 * "Sun 00:00 (00:00 UTC)" -- the reset in the reader's own clock, with UTC in
 * brackets because that is the only version the worker can promise.
 *
 * Called from an event handler, never during render: "your time" depends on the
 * browser's locale and zone, and computing it while rendering would produce a
 * different string on the server than in the browser. An unknown reset moment
 * falls back to the next UTC midnight, which is when it actually happens.
 */
export function d1LimitResetLabel(resetAt: Date | null, now: Date = new Date()): string {
  const target = resetAt ?? nextUtcMidnight(now);

  const local = target.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const utc = target.toLocaleString(undefined, {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return `${local} (${utc} UTC)`;
}

/**
 * The full explanation for a screen that can show one.
 *
 * No blame and no jargon: the allowance is ours, not the reader's, and the only
 * useful facts are that the data is safe and when it comes back. "Write" is
 * worded separately because a failed save should never say "nothing can be
 * loaded" -- on that path loading still works.
 */
export function d1LimitMessage(error: D1LimitError, now: Date = new Date()): string {
  const resetsAt = d1LimitResetLabel(error.resetAt, now);

  return error.scope === "write"
    ? `The free daily database allowance for saving is used up, so new answers cannot be stored right now. It resets at ${resetsAt}.`
    : `The free daily database allowance for this site is used up, so nothing can be loaded right now. It resets at ${resetsAt}.`;
}

/**
 * The quiz-specific reassurance: progress is autosaved after every answer, so a
 * quota failure costs the reader a wait, not their answers.
 */
export const D1_LIMIT_QUIZ_NOTE =
  "Your answers are saved in this browser, so nothing is lost — come back after the reset and the quiz picks up where you stopped.";
