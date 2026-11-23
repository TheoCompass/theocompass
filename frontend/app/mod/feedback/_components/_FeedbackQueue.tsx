"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import {
  fetchFeedbackQueue,
  isCodeRefused,
  setFeedbackStatus,
  type FeedbackCounts,
  type FeedbackFilter,
  type FeedbackQueue,
  type FeedbackRow,
  type FeedbackStatus,
} from "../../../../lib/api";
import { D1_LIMIT_HEADING, d1LimitMessage, isD1LimitError } from "../../../../lib/d1-limit";
import { forgetModCode, readModCode, rememberModCode } from "../../../../lib/mod-code";
import { ModHeader } from "./_ModHeader";

/**
 * The moderator's half of the feedback card: the notes readers chose to write,
 * newest first, with one control per row.
 *
 * Two things this page refuses to do. It never shows a rating without its
 * context (which question it answered, the match it was about, what they said
 * about it, which build), and it never edits the words -- the body of a PATCH is
 * a status and nothing else.
 *
 * `hidden` is the one action with a public consequence: the aggregate endpoint
 * filters those rows out, so the average and the accuracy figure on the landing
 * page move when a row is hidden. The notice after the click says so, rather
 * than leaving the moderator to discover it later.
 */

/** The queue's ceiling. The worker caps `limit` at 200, and so do we. */
const QUEUE_LIMIT = 200;

const FILTERS: Array<{ value: FeedbackFilter; label: string }> = [
  { value: "commented", label: "With a note" },
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "hidden", label: "Hidden" },
  { value: "all", label: "All" },
];

const STATUSES: Array<{ value: FeedbackStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "hidden", label: "Hidden" },
];

function countFor(filter: FeedbackFilter, counts: FeedbackCounts): number {
  if (filter === "commented") return counts.commented;
  if (filter === "all") return counts.new + counts.reviewed + counts.hidden;
  return counts[filter];
}

/**
 * Where the reader actually is, in the moderator's words (0008). Printed first
 * because it is the answer the published accuracy follows, and because
 * "exploring" is the sentence a reader with no church could not say before.
 */
function stancePart(stance: FeedbackRow["fitStance"]): string | null {
  if (stance === "fit") return "match is about where they are";
  if (stance === "close") return "close, but not quite";
  if (stance === "off") return "not close to where they are";
  if (stance === "exploring") return "exploring, no church to compare against";
  return null;
}

/**
 * Where the reader's church sat, in the moderator's words.
 *
 * Both positions are printed, in the order the card asked them, because they
 * answer different questions: the family rank says where the reader's *own*
 * family sat in the family list, the church rank where their own denomination sat
 * in the full results list. A row can carry one and not the other -- naming a
 * family commits the reader to nothing further -- so each part is optional.
 *
 * `0` is the card's escape hatch at each level ("none of these families", "not
 * in this list") and is an answer about coverage, not a gap: it is printed as
 * one. A row with neither position is either a skip or a submission from before
 * the pickers existed, and the `accurate` boolean is all that can be said about
 * it; a legacy "no" gets its own wording rather than a guessed position, because
 * the queue must not invent how far off the match was.
 */
function familyPart(rank: FeedbackRow["familyRank"]): string | null {
  if (rank === 0) return "none of the families listed";
  if (typeof rank === "number") return `their family was #${rank}`;
  return null;
}

function churchPart(pos: FeedbackRow["matchRankPos"]): string | null {
  if (pos === 0) return "their church was not in the list";
  if (typeof pos === "number") return `their church was #${pos} in the list`;
  return null;
}

/**
 * The match answer as one line. The stance comes first and the positions follow
 * it as the detail, because the stance is the question every reader could
 * answer: a row that says "not close" and names #1 is the disagreement worth
 * reading, and it used to be indistinguishable from a plain hit.
 */
function matchLabel(row: FeedbackRow): string {
  const stance = stancePart(row.fitStance);
  const family = familyPart(row.familyRank);
  const church = churchPart(row.matchRankPos);
  const position = family && church ? `${family}, ${church}` : family ?? church;
  if (stance && position) return `${stance}; ${position}`;
  if (stance) return stance;
  if (position) return position;
  if (row.accurate === true) return "#1 was the best match";
  if (row.accurate === false) return "no match fitted (stance and position not given)";
  return "skipped the match questions";
}

/**
 * Which question the stars answered. The card used to ask how close the match
 * felt; it now asks how the quiz felt overall. A number from the queue is
 * otherwise ambiguous, and a missing value means the row predates the change
 * (or the API has not been redeployed yet), so it is labelled as the old one.
 */
function ratingMetricLabel(metric: FeedbackRow["ratingMetric"]): string {
  return metric === "experience" ? "quiz experience" : "match fit";
}

/**
 * SQLite's `datetime('now')` is `YYYY-MM-DD HH:MM:SS` in UTC, which Safari will
 * not parse. Turning it into a real ISO string first is the difference between a
 * date and "Invalid Date" on half the phones this is read on.
 */
function formatWhen(value: string | null): string {
  if (!value) return "no timestamp";
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The tallies, with the current view marked so the list has a denominator too. */
function Summary({
  filter,
  counts,
  shown,
}: {
  filter: FeedbackFilter;
  counts: FeedbackCounts;
  shown: number;
}) {
  const total = countFor(filter, counts);
  return (
    <section
      aria-label="Queue summary"
      className="mt-5 border border-rule bg-paper-raised p-4 md:p-5"
    >
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-2xs">
        {FILTERS.map((option) => (
          <div key={option.value} className="flex items-baseline gap-1.5">
            <dt className="text-ink-muted">{option.label}</dt>
            <dd className="num font-mono font-semibold text-ink">
              {countFor(option.value, counts)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-3xs leading-relaxed text-ink-muted">
        Showing <span className="num font-mono font-semibold text-ink-soft">{shown}</span>
        {total > shown ? (
          <>
            {" "}
            of <span className="num font-mono font-semibold text-ink-soft">{total}</span> — older
            rows are past the {QUEUE_LIMIT}-row limit.
          </>
        ) : (
          " of the queue."
        )}{" "}
        Hiding a row takes it out of the published average, the top-1 figure and the rank
        breakdown; the note itself is never published.
      </p>
    </section>
  );
}

function ErrorPanel({
  heading,
  message,
  onRetry,
}: {
  heading: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="mt-6 border border-punch-500/40 bg-punch-50 p-4 md:p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-punch-ink">
        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        {heading}
      </p>
      <p className="mt-2 text-2xs leading-relaxed text-ink-soft">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 border border-rule-strong px-2.5 py-1.5 text-2xs font-medium text-ink-soft transition-colors hover:bg-muted-soft hover:text-ink"
      >
        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
        Try again
      </button>
    </div>
  );
}

/**
 * The gate.
 *
 * The code is never checked in the browser: the attempt *is* a queue request, so
 * a wrong code fails for the same reason a wrong PATCH fails, and there is no
 * second endpoint to keep in step with this one.
 *
 * The development hint is the same one the README gives -- `ADMIN_CODE` is unset
 * locally, so the worker falls back to `mod`. It is compiled out of a production
 * build, where it would be actively unhelpful.
 */
function Gate({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (code: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [code, setCode] = useState("");

  return (
    <main className="mx-auto w-full max-w-md px-5 py-12 md:py-16">
      <p className="meta text-cerulean-800">Moderator</p>
      <h1 className="mt-1 font-serif text-2xl font-bold text-ink md:text-3xl">The feedback queue</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        The notes left at the end of a quiz, newest first, with the rating and the match they were
        about. Same code as the roadmap.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(code.trim());
        }}
        className="mt-6"
      >
        <label htmlFor="mod-code" className="meta">
          Access code
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="mod-code"
            type="password"
            autoComplete="off"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="min-w-0 flex-1 border border-rule-strong bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-cerulean-900"
          />
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="shrink-0 border border-cerulean-900 bg-cerulean-900 px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-cerulean-800 disabled:opacity-60"
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-2xs font-medium text-punch-ink">
          {error}
        </p>
      )}

      {process.env.NODE_ENV === "development" && (
        <p className="mt-4 text-3xs text-ink-muted">
          Local code: <code className="font-mono text-ink-soft">mod</code> — the worker&rsquo;s
          fallback when <code className="font-mono text-ink-soft">ADMIN_CODE</code> is unset.
        </p>
      )}

      <p className="mt-8 border-t border-rule pt-3 text-3xs leading-relaxed text-ink-muted">
        This page is a speed bump, not authentication: the code keeps a stranger out of the queue,
        and nothing here is personal data. It lasts for this tab, and the roadmap accepts the same
        one.
      </p>
    </main>
  );
}

/** One row: what they said, in their words, then the tri-state control. */
function FeedbackCard({
  row,
  busy,
  saving,
  onStatus,
}: {
  row: FeedbackRow;
  /** A write is in flight somewhere in the queue; every control waits for it. */
  busy: boolean;
  /** The write in flight is this row's. */
  saving: boolean;
  onStatus: (row: FeedbackRow, status: FeedbackStatus) => void;
}) {
  const context = [
    row.mode ? row.mode : null,
    row.answeredCount === null ? null : `${row.answeredCount} answered`,
    row.appVersion ? `app ${row.appVersion}` : null,
    row.dataVersion ? `data ${row.dataVersion}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="border border-rule bg-paper-raised p-4 md:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-2xs text-ink-soft">
          <span className="num font-mono text-sm font-semibold text-ink">
            {row.rating === null ? "—" : row.rating}
            <span className="text-3xs text-ink-muted">/5</span>
          </span>
          <span className="text-3xs text-ink-muted">{ratingMetricLabel(row.ratingMetric)}</span>
          <span aria-hidden="true">&middot;</span>
          <span>{matchLabel(row)}</span>
          {row.topMatchName && (
            <>
              <span aria-hidden="true">&middot;</span>
              <span>{row.topMatchName}</span>
            </>
          )}
        </p>
        <p className="meta">{formatWhen(row.createdAt)}</p>
      </header>

      {row.comment ? (
        <blockquote className="mt-3 border-l-2 border-rule pl-3 font-serif text-base leading-relaxed whitespace-pre-wrap text-ink">
          {row.comment}
        </blockquote>
      ) : (
        <p className="mt-3 text-2xs italic text-ink-muted">No note &mdash; a rating only.</p>
      )}

      <footer className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-rule pt-3">
        <p className="text-3xs text-ink-muted" aria-busy={saving}>
          <span className="num font-mono">#{row.id}</span>
          {context ? ` · ${context}` : ""}
          {saving && <span className="ml-1.5">· saving&hellip;</span>}
        </p>

        <div
          role="group"
          aria-label={`Status for feedback ${row.id}`}
          className="flex flex-wrap gap-1.5"
        >
          {STATUSES.map((option) => {
            const active = row.status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onStatus(row, option.value)}
                disabled={active || busy}
                aria-pressed={active}
                className={`border px-2 py-1 text-3xs font-semibold uppercase tracking-wider transition-colors disabled:cursor-default ${
                  active
                    ? "border-cerulean-900 bg-cerulean-900 text-paper"
                    : "border-rule text-ink-soft hover:bg-muted-soft hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </footer>
    </article>
  );
}

export function FeedbackQueuePage() {
  const [code, setCode] = useState<string | null>(null);
  const [queue, setQueue] = useState<FeedbackQueue | null>(null);
  const [loading, setLoading] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);
  /** A heading and a body, like the roadmap: a quota outage is not a broken queue. */
  const [error, setError] = useState<{ heading: string; message: string } | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedbackFilter>("commented");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  /**
   * Set when the gate has already fetched the first page. Without it, unlocking
   * would request the same page twice: once to check the code, once because
   * `code` changed and the effect below re-reads the queue.
   */
  const gateFetched = useRef(false);

  const load = useCallback(async (activeCode: string, activeFilter: FeedbackFilter) => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchFeedbackQueue(activeCode, {
        filter: activeFilter,
        limit: QUEUE_LIMIT,
      });
      setQueue(next);
      setCode(activeCode);
      setGateError(null);
    } catch (err) {
      if (isCodeRefused(err)) {
        forgetModCode();
        setQueue(null);
        setCode(null);
        setGateError("That code is no longer accepted.");
        return;
      }
      // The API already turned a depleted allowance into a D1LimitError; saying
      // "could not load the queue" would blame the wrong thing entirely.
      setError(
        isD1LimitError(err)
          ? { heading: D1_LIMIT_HEADING, message: d1LimitMessage(err) }
          : {
              heading: "Could not load the feedback queue",
              message: err instanceof Error ? err.message : "Could not load the feedback queue.",
            }
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // A stored code is taken at face value and tried once: the queue request is the
  // check, so a bad code costs one 401 rather than an extra round trip.
  useEffect(() => {
    const stored = readModCode();
    if (stored) setCode(stored);
  }, []);

  /**
   * One request per code/filter pair. The filter is the worker's job
   * (`?commented=1`, `?status=`), not a local `.filter()`: a client-side filter
   * over one page would hide notes that live past the limit.
   */
  useEffect(() => {
    if (!code) return;
    if (gateFetched.current) {
      gateFetched.current = false;
      return;
    }
    void load(code, filter);
  }, [code, filter, load]);

  const unlock = async (candidate: string) => {
    if (!candidate || gateBusy) return;
    setGateBusy(true);
    setGateError(null);
    try {
      const next = await fetchFeedbackQueue(candidate, { filter, limit: QUEUE_LIMIT });
      rememberModCode(candidate);
      gateFetched.current = true;
      setQueue(next);
      setError(null);
      setNotice(null);
      setCode(candidate);
    } catch (err) {
      setGateError(
        isCodeRefused(err)
          ? "That code was not accepted."
          : isD1LimitError(err)
            ? d1LimitMessage(err)
            : err instanceof Error
              ? err.message
              : "Could not reach the API."
      );
    } finally {
      setGateBusy(false);
    }
  };

  const lock = () => {
    forgetModCode();
    setCode(null);
    setQueue(null);
    setError(null);
    setNotice(null);
    setGateError(null);
  };

  const changeStatus = async (row: FeedbackRow, status: FeedbackStatus) => {
    if (!code || savingId !== null) return;
    setSavingId(row.id);
    setNotice(null);
    try {
      const updated = await setFeedbackStatus(row.id, status, code);
      // Move the row first so the click lands, then re-read the queue: the
      // counts and the membership of a filtered view are the worker's answers.
      setQueue((current) =>
        current
          ? {
              ...current,
              feedback: current.feedback.map((item) => (item.id === updated.id ? updated : item)),
            }
          : current
      );
      setNotice({
        tone: "ok",
        text:
          status === "hidden"
            ? `Feedback ${row.id} is hidden. It no longer counts towards the published figures.`
            : `Feedback ${row.id} marked ${status}.`,
      });
      await load(code, filter);
    } catch (err) {
      if (isCodeRefused(err)) {
        lock();
        setGateError("That code is no longer accepted.");
        return;
      }
      setNotice({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not update that row.",
      });
    } finally {
      setSavingId(null);
    }
  };

  if (!code) {
    return (
      <div className="min-h-screen bg-paper">
        <ModHeader unlocked={false} />
        <Gate onSubmit={unlock} busy={gateBusy} error={gateError} />
      </div>
    );
  }

  const checking = loading && queue === null;

  return (
    <div className="min-h-screen bg-paper">
      <ModHeader unlocked onLock={lock} />
      <main className="mx-auto w-full max-w-3xl px-5 py-8 md:px-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="meta text-cerulean-800">Moderator</p>
            <h1 className="mt-1 font-serif text-2xl font-bold text-ink md:text-3xl">
              Feedback queue
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void load(code, filter)}
            disabled={loading}
            className="flex items-center gap-1.5 border border-rule-strong px-2.5 py-1.5 text-2xs font-medium text-ink-soft transition-colors hover:bg-muted-soft hover:text-ink disabled:opacity-60"
          >
            <RotateCcw
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              strokeWidth={1.75}
            />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <p className="mt-2 max-w-prose text-2xs leading-relaxed text-ink-muted">
          Every row is one reader&rsquo;s answer to the card at the end of a quiz. The counts and
          the average are published; the words never are, and nothing here is tied to a person.
          The stars now rate the quiz experience &mdash; rows marked{" "}
          <strong className="font-semibold text-ink-soft">match fit</strong> answered the older
          question and stay out of that average, though their yes/no still counts.
        </p>

        {queue && <Summary filter={filter} counts={queue.counts} shown={queue.feedback.length} />}

        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter the queue">
          {FILTERS.map((option) => {
            const active = filter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option.value)}
                className={`flex items-center gap-1.5 border px-2 py-1 text-3xs font-semibold uppercase tracking-wider transition-colors ${
                  active
                    ? "border-cerulean-900 bg-cerulean-900 text-paper"
                    : "border-rule text-ink-soft hover:bg-muted-soft hover:text-ink"
                }`}
              >
                {option.label}
                {queue && (
                  <span
                    className={`num font-mono font-semibold ${
                      active ? "text-paper/70" : "text-ink-muted"
                    }`}
                  >
                    {countFor(option.value, queue.counts)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {notice && (
          <p
            role="status"
            aria-live="polite"
            className={`mt-4 border p-2.5 text-2xs ${
              notice.tone === "ok"
                ? "border-cerulean-900/30 bg-cerulean-50 text-cerulean-900"
                : "border-punch-500/40 bg-punch-50 text-punch-ink"
            }`}
          >
            {notice.text}
          </p>
        )}

        {error ? (
          <ErrorPanel
            heading={error.heading}
            message={error.message}
            onRetry={() => void load(code, filter)}
          />
        ) : checking ? (
          <p className="mt-6 text-2xs text-ink-muted">Loading the queue&hellip;</p>
        ) : queue && queue.feedback.length === 0 ? (
          <p className="mt-6 border border-rule bg-paper-raised p-4 text-2xs text-ink-soft">
            {filter === "commented" ? "Nobody has left a note yet." : "Nothing in this pile."}
          </p>
        ) : queue ? (
          <div className="mt-4 space-y-3" aria-busy={loading}>
            {queue.feedback.map((row) => (
              <FeedbackCard
                key={row.id}
                row={row}
                busy={savingId !== null}
                saving={savingId === row.id}
                onStatus={changeStatus}
              />
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}

