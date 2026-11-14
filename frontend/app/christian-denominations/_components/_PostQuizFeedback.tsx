"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Check, Star } from "lucide-react";
import { createClientId, submitQuizFeedback } from "../../../lib/api";
import { trackEvent } from "../../../lib/gtag";
import { APP_VERSION } from "../../../lib/site";
import { SHELL_GUTTERS, WIDTHS } from "./_Shell";

/**
 * The card at the bottom of the results page (task 0.9).
 *
 * Three questions, in the order a reader can answer them: how close the match
 * felt (1-5 stars), whether the top match described them (yes / no, or nothing
 * at all), and an optional sentence. It submits with one tap, so a rating alone
 * is a complete answer -- asking for the comment first would cost most of the
 * responses.
 *
 * It sits between the dashboard and the footer rather than in a dialog: a modal
 * would interrupt the result the reader is still reading, and this card waits.
 *
 * Where the text goes: into `feedback.comment`, readable only with the moderator
 * code and never rendered anywhere. The landing page shows a count, an average
 * and a histogram -- no quotes -- which is why there is no consent step here.
 *
 * Where it does not go: analytics. Only the shape travels (rating, yes/no or
 * skipped, whether a comment existed), never the words themselves.
 */

/** Offered only when the POST did not land. */
const CONTACT_EMAIL = "theocompass.project@gmail.com";

const NOTE_MAX = 500;

/**
 * Local memory of which run has been answered, so reloading the same results
 * page says "thank you" instead of asking again. Keyed on the timestamp
 * `persistFinalResults` writes, which changes on a retake and on nothing else.
 */
const STORAGE_KEY = "theocompass.quizFeedback";

type Phase = "idle" | "sending" | "failed";

/** The rating in words, so the choice reads as an opinion and not a score. */
const RATING_LABELS = ["Not close at all", "A little off", "Roughly right", "Close", "That is me"];

function readRunKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("theocompass_final_results");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { timestamp?: unknown };
    return typeof parsed.timestamp === "number" ? `run-${parsed.timestamp}` : null;
  } catch {
    return null;
  }
}

function readSubmittedRun(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { run?: unknown };
    return typeof parsed.run === "string" ? parsed.run : null;
  } catch {
    return null;
  }
}

/** The `storage` event covers a second tab; this tab updates its own phase. */
function subscribeSubmitted(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function rememberSubmitted(run: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ run, at: Date.now() }));
  } catch {
    // Private mode or a full quota: the thank-you is a nicety, not the record.
  }
}

/** The mailto fallback carries the rating, never the reader's sentence. */
function fallbackHref(rating: number | null, accurate: boolean | null): string {
  const lines = [
    "Quiz feedback",
    "",
    `Rating: ${rating === null ? "not given" : `${rating}/5`}`,
    `Top match felt accurate: ${accurate === true ? "yes" : accurate === false ? "no" : "skipped"}`,
    "",
    "(The feedback form could not reach the server, so this is the fallback.)",
  ];
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Quiz feedback")}&body=${encodeURIComponent(
    lines.join("\n")
  )}`;
}

export function PostQuizFeedback({
  mode,
  topMatchId,
  topMatchName,
  answeredCount,
  enabled = true,
}: {
  mode: "quick" | "standard" | "deep";
  topMatchId: string | null;
  topMatchName: string | null;
  answeredCount: number;
  /**
   * False only for a results view with no match to judge, one still
   * calculating, or one whose calculation failed. Deliberately *not* a
   * "real completion" check: moderator/dev "skip to a result" runs keep the
   * card, because that is how the form gets inspected at all. Those runs stay
   * out of the figures through `quiz_complete` and `/api/quiz/events`, not
   * through the card.
   */
  enabled?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sentHere, setSentHere] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [accurate, setAccurate] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  /** One id per card: a retry after a dropped response is the same submission. */
  const [sessionId] = useState(() => createClientId());
  const [runKey] = useState<string | null>(() => readRunKey());

  const starRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const confirmationRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();
  const ratingId = useId();
  const noteId = useId();
  const helpId = useId();

  // The server and hydration snapshots are both `null`, so the first paint is
  // the form and the stored answer then flips it to the thank-you. Reading
  // localStorage during render instead would trip a hydration mismatch.
  const submittedRun = useSyncExternalStore(subscribeSubmitted, readSubmittedRun, () => null);
  const alreadySent = runKey !== null && submittedRun === runKey;

  // A submit removes the button that had focus, so focus moves to the answer.
  // Only for a submit made here: on a reload the card is already a thank-you,
  // and stealing focus would jump the reader to the bottom of the page.
  useEffect(() => {
    if (sentHere) confirmationRef.current?.focus();
  }, [sentHere]);

  function selectRating(value: number): void {
    setRating(Math.min(5, Math.max(1, value)));
  }

  function onStarsKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const current = rating ?? 0;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = current >= 5 ? 1 : current + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = current <= 1 ? 5 : current - 1;
    else if (event.key === "Home") next = 1;
    else if (event.key === "End") next = 5;
    if (next === null) return;
    event.preventDefault();
    setRating(next);
    starRefs.current[next - 1]?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (phase === "sending" || rating === null) return;
    setPhase("sending");

    const trimmed = comment.trim();
    const outcome = await submitQuizFeedback({
      sessionId,
      rating,
      accurate,
      comment: trimmed === "" ? null : trimmed,
      mode,
      topMatchId,
      topMatchName,
      answeredCount,
      appVersion: APP_VERSION,
    });

    if (outcome === "failed") {
      setPhase("failed");
      return;
    }

    if (runKey !== null) rememberSubmitted(runKey);
    // Shapes only: the comment never leaves the request body.
    trackEvent("quiz_feedback_submitted", {
      quiz_mode: mode,
      rating,
      accurate: accurate === true ? "yes" : accurate === false ? "no" : "skipped",
      has_comment: trimmed !== "",
      outcome,
    });
    setPhase("idle");
    // The stored run key normally drives the thank-you; a run with no key
    // (storage cleared between the run and this card) needs the local flag.
    setSentHere(true);
  }

  if (!enabled) return null;
  const sent = alreadySent || sentHere;

  return (
    /*
     * The card lives outside `<main>` (one main landmark per page: `Shell` owns
     * it), so it takes its own page-width column -- but from the same two
     * constants `Shell` uses, so the panel's left edge lands on the gutter the
     * dashboard above it starts from. A centred 64rem box under a left-aligned
     * 84rem dashboard read as a different page.
     *
     * Spacing: `mt-8` under the dashboard's closing rule, `pb-12` into the
     * footer's own border. The old `pb-24` doubled that and pushed the card
     * into the footer, which is why it was easy to miss.
     */
    <div className={`mx-auto w-full ${WIDTHS.page} ${SHELL_GUTTERS} pb-12`}>
      <section
        id="feedback"
        aria-labelledby={headingId}
        className="mt-8 max-w-[64rem] border border-rule bg-paper-raised p-5 md:p-7"
      >
        <header>
          <p className="meta text-cerulean-800">Your feedback</p>
          <h2 id={headingId} className="mt-1 font-serif text-xl font-bold text-ink md:text-2xl">
            Did that match fit?
          </h2>
          <p className="mt-2 text-2xs leading-relaxed text-ink-soft">
            Anonymous. It joins an average, not a feed: nothing you type is published, and there is
            no email or account behind it.
          </p>
        </header>

        {sent ? (
          <div
            ref={confirmationRef}
            role="status"
            tabIndex={-1}
            className="mt-6 flex items-start gap-3 border border-rule bg-paper p-4 focus:outline-none"
          >
            <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-cerulean-800" />
            <div>
              <p className="text-sm font-semibold text-ink">Thank you — that is recorded.</p>
              <p className="mt-1 text-2xs leading-relaxed text-ink-soft">
                It is counted in the collective results, anonymously. Nothing else is asked of you.
              </p>
            </div>
          </div>
        ) : phase === "failed" ? (
          <div className="mt-6 border border-punch-500/40 bg-punch-50 p-4">
            <p className="text-sm font-semibold text-ink">That did not go through.</p>
            <p className="mt-1.5 text-2xs leading-relaxed text-ink-soft">
              Your result is untouched and nothing was lost by trying. Send it again, or write to{" "}
              <a href={fallbackHref(rating, accurate)} className="underline hover:text-ink">
                {CONTACT_EMAIL}
              </a>{" "}
              if it keeps failing.
            </p>
            <button
              type="button"
              onClick={() => setPhase("idle")}
              className="mt-3 inline-flex items-center border border-cerulean-600 bg-cerulean-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cerulean-800"
            >
              Try again
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-6">
            <div>
              <span id={ratingId} className="meta block">
                How close did it feel?
              </span>
              <div
                role="radiogroup"
                aria-labelledby={ratingId}
                aria-describedby={helpId}
                onKeyDown={onStarsKeyDown}
                className="mt-1 flex items-center gap-1"
              >
                {[1, 2, 3, 4, 5].map((value) => {
                  const filled = rating !== null && value <= rating;
                  const selected = rating === value;
                  return (
                    <button
                      key={value}
                      ref={(element) => {
                        starRefs.current[value - 1] = element;
                      }}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${value} out of 5 — ${RATING_LABELS[value - 1]}`}
                      tabIndex={selected || (rating === null && value === 1) ? 0 : -1}
                      onClick={() => selectRating(value)}
                      className="rounded p-1 transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerulean-600"
                    >
                      <Star
                        aria-hidden="true"
                        strokeWidth={1.5}
                        className={`h-7 w-7 ${
                          filled ? "fill-current text-cerulean-800" : "text-rule-strong"
                        }`}
                      />
                    </button>
                  );
                })}
                <span className="ml-2 text-2xs text-ink-soft" aria-live="polite">
                  {rating === null ? "Pick 1 to 5" : RATING_LABELS[rating - 1]}
                </span>
              </div>
              <span id={helpId} className="sr-only">
                Five stars is the closest fit. Arrow keys move between the stars.
              </span>
            </div>

            <fieldset>
              <legend className="meta">Did the top match describe you?</legend>
              <p className="mt-1 text-2xs leading-relaxed text-ink-muted">
                {topMatchName ? (
                  <>
                    Your closest match was{" "}
                    <strong className="font-semibold text-ink-soft">{topMatchName}</strong>.
                  </>
                ) : (
                  "This run had no closest match to judge."
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { value: true, label: "Yes, close enough" },
                  { value: false, label: "Not really" },
                ].map((option) => {
                  const active = accurate === option.value;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setAccurate(active ? null : option.value)}
                      className={`border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? "border-cerulean-700 bg-cerulean-100 text-cerulean-900"
                          : "border-rule bg-paper text-ink-soft hover:border-rule-strong hover:text-ink"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-3xs text-ink-muted">
                Optional. Choosing the same answer again clears it, and a blank answer is not
                counted as a no.
              </p>
            </fieldset>

            <div>
              <label htmlFor={noteId} className="meta block">
                Anything else? (optional)
              </label>
              <textarea
                id={noteId}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={3}
                maxLength={NOTE_MAX}
                placeholder="One line is plenty — what felt off, or what felt right."
                className="mt-1 w-full border border-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cerulean-600"
              />
              <p className="mt-1 flex flex-wrap justify-between gap-2 text-3xs text-ink-muted">
                <span>Read by a moderator. Never published, never attached to a name.</span>
                <span className="num font-mono">
                  {comment.length}/{NOTE_MAX}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={rating === null || phase === "sending"}
                className="inline-flex items-center gap-2 border border-cerulean-600 bg-cerulean-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cerulean-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {phase === "sending" ? "Sending…" : "Send feedback"}
              </button>
              <span className="text-2xs text-ink-muted">
                {rating === null
                  ? "A rating is the only thing required."
                  : "No sign-up, no follow-up email."}
              </span>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

