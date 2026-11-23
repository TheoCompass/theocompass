"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Check, Star } from "lucide-react";
import Link from "next/link";
import { createClientId, submitQuizFeedback, type FeedbackStance } from "../../../lib/api";
import { trackEvent } from "../../../lib/gtag";
import { APP_VERSION } from "../../../lib/site";
import { FAMILY_TO_GROUP } from "../../../lib/taxonomy";
import { SHELL_GUTTERS, WIDTHS } from "./_Shell";

/**
 * The card at the bottom of the results page (task 0.9).
 *
 * Four questions, in the order a reader can answer them: how the quiz felt
 * overall (1-5 stars, the question an app store asks), how close the top match
 * is to *where they actually are* (one tap, four answers), where they sit if
 * they want to be precise (two pickers: their own family, then their
 * denomination inside it), and an optional sentence. It submits with one tap, so
 * a rating alone is a complete answer -- asking for the comment first would cost
 * most of the responses.
 *
 * The stance question is first among the match ones because it is the only one
 * every reader can answer. The pickers ask the reader to place *their church*,
 * which is a question a curious reader, a seeker and a doubter cannot answer:
 * their only exits used to be "none came close" (stored as a miss, which pulled
 * the published accuracy down) or nothing (stored as a skip, which was
 * invisible). "I'm exploring" is a real answer, and the API stores it as one
 * while leaving it out of the accuracy denominator -- so the figure measures the
 * match instead of measuring how many readers happen to have a church.
 *
 * The pickers are unchanged in what they ask, and deliberately still offered to
 * everyone: if they only appeared to people who said "not close", the published
 * distribution would become a list of misses and stop describing where readers'
 * churches actually sit. Their escape hatches now mean coverage alone -- "none
 * of these families" / "not in this list" -- because "not close" has its own
 * answer above.
 *
 * Both pickers list the **whole** taxonomy: all thirty families, then every
 * denomination in the chosen one. They used to print the first eight and five,
 * which turned the answer into a bucket -- with 230 churches on the list, "not
 * in this list" was where most readers landed, so the panel could not say
 * whether a reader's church was ninth or two-hundredth. A `<select>` per level
 * is also the honest control for a list that long: thirty buttons with a rank
 * above each name is a wall of text on a phone, and grouping them by tradition
 * (`FAMILY_TO_GROUP`) is what a reader scanning for their own family expects.
 * Both carry the rank they send ("#9 of 30 families this run") underneath, so
 * the number that reaches the API is never a mystery.
 *
 * The match question used to be a yes/no about "the top match", then six rank
 * buckets. A bucket was one number for two different things -- how close the
 * *family* list came, and where the reader's own *church* sat in it -- and a
 * "no" could not tell a near miss from a denomination that is not in the
 * database. The pickers ask the two things in the order they happen, and both
 * number what is on screen: "#2, Anglican" is the second family shown, and the
 * church's number is its place in the full results list, not its place inside
 * the family.
 *
 * The stars are about the experience, not about the result. The match has its
 * own question directly below them and its own figure on the landing page;
 * asking "how close was it?" twice, on two scales, is how a rating stops meaning
 * anything. The API tags every row with `rating_metric = 'experience'` for the
 * same reason: rows written under the old wording are kept out of this average.
 *
 * The heading follows the same rule: "How did that go?" covers the run, not just
 * the match. It used to read "Did that match fit?", which promised a question
 * about the result and then opened with one about the quiz.
 *
 * It sits between the dashboard and the footer rather than in a dialog: a modal
 * would interrupt the result the reader is still reading, and this card waits.
 *
 * Where the text goes: into `feedback.comment`, readable only with the moderator
 * code and never rendered anywhere. The landing page shows a count, an average
 * and a histogram -- no quotes -- which is why there is no consent step here.
 *
 * Where it does not go: analytics. Only the shape travels (rating, its metric,
 * the stance, the two positions or skipped, whether a comment existed), never
 * the words themselves.
 */

/** Offered only when the POST did not land. */
const CONTACT_EMAIL = "theocompass.project@gmail.com";

const NOTE_MAX = 500;

/**
 * The two level pickers share one control: a native `<select>`, because a list of
 * thirty families with a rank above each name is a wall of text on a phone, and
 * a native select is the one list control that already works with a keyboard, a
 * screen reader and a thumb.
 */
const SELECT_CLASS =
  "mt-1.5 w-full max-w-[28rem] border border-rule bg-paper px-2.5 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cerulean-600 disabled:cursor-not-allowed disabled:bg-cerulean-50 disabled:text-ink-muted";

/**
 * Local memory of which run has been answered, so reloading the same results
 * page says "thank you" instead of asking again. Keyed on the timestamp
 * `persistFinalResults` writes, which changes on a retake and on nothing else.
 */
const STORAGE_KEY = "theocompass.quizFeedback";

type Phase = "idle" | "sending" | "failed";

/**
 * The rating in words, so the choice reads as an opinion about the quiz and not
 * as a score for the result. Deliberately about the experience throughout: the
 * match is judged by the two pickers underneath.
 */
const RATING_LABELS = ["Not for me", "Needs work", "It was fine", "Really good", "Loved it"];

/**
 * The stance answers, in the words the reader would use, and in the order the
 * card offers them: from "that is me" down to "I have nothing to compare this
 * with". The last one is not a softer kind of "no" -- it is the answer for a
 * curious reader, a seeker or a doubter, and the API keeps it out of the
 * accuracy denominator rather than counting it as a miss.
 *
 * `value` is the wire value, validated in `parseStance` on the API side; a label
 * here and a value there are the same four answers, which is why this list is
 * typed rather than free-form.
 */
const STANCE_OPTIONS: Array<{ value: FeedbackStance; label: string; hint: string }> = [
  { value: "fit", label: "That's about where I am", hint: "The top match describes me" },
  { value: "close", label: "Close, but not quite", hint: "Right family, wrong church" },
  { value: "off", label: "Not close", hint: "Missed where I actually am" },
  { value: "exploring", label: "I'm exploring", hint: "No church to compare with" },
];

/** The same four answers as a phrase, for the mailto fallback. */
const STANCE_TEXT: Record<FeedbackStance, string> = {
  fit: "about where I am",
  close: "close, but not quite",
  off: "not close",
  exploring: "exploring, with no church to compare against",
};

/**
 * The family list the card prints, as the controller passes it: what the
 * dashboard is showing, so "active only" moves the list and the card together.
 * `allDenominations` is that family's churches in match order, which is the
 * order the second picker lists them in.
 */
export type FeedbackFamily = {
  family: string;
  allDenominations?: Array<{ id: string; name: string }> | null;
};

/** A family as one `<optgroup>` entry, and the churches it contains. */
type FamilyOption = {
  family: string;
  rank: number;
  churches: Array<{ id: string; name: string; pos: number }>;
};

/**
 * The optgroup for a family the cluster map does not know -- the four families
 * that are in the data but not assigned to a tradition in `lib/taxonomy.ts`.
 * They still get a place in the list, in rank order, rather than being dropped.
 */
const OTHER_GROUP = "Other traditions";

/**
 * The answers in words, for the mailto fallback. Spelled out rather than "#1",
 * because the reply may be read without the card in front of it -- and each
 * question is named, since the same number means something different at each
 * level.
 */
function stanceText(fitStance: FeedbackStance | null): string {
  return fitStance === null ? "skipped" : STANCE_TEXT[fitStance];
}

function familyText(familyRank: number | null, familyCount: number): string {
  if (familyRank === null) return "skipped";
  if (familyRank === 0) return "not one of the families on the list";
  return `#${familyRank} of the ${familyCount} families on the list`;
}

function churchText(matchRankPos: number | null): string {
  if (matchRankPos === null) return "skipped";
  if (matchRankPos === 0) return "not in the list";
  return `#${matchRankPos} in the full results list`;
}

/** The pressed/unpressed look the stance answers share with the old bucket row. */
function choiceClass(active: boolean): string {
  return `border px-3 py-1.5 text-left text-xs font-semibold transition-colors ${
    active
      ? "border-cerulean-700 bg-cerulean-100 text-cerulean-900"
      : "border-rule bg-paper text-ink-soft hover:border-rule-strong hover:text-ink"
  }`;
}

/**
 * The GA4 spelling of the accuracy answer, derived here so the event keeps the
 * field an older dashboard already charts while the card gains a question.
 *
 * Stance first, then the church's position: `exploring` is a skip for *this*
 * figure (it is not a judgement about position 1) even though it is a complete
 * answer to the question above.
 */
function accurateLabel(
  fitStance: FeedbackStance | null,
  matchRankPos: number | null
): "yes" | "no" | "skipped" {
  if (fitStance === "fit") return "yes";
  if (fitStance === "close" || fitStance === "off") return "no";
  if (fitStance === "exploring") return "skipped";
  if (matchRankPos === null) return "skipped";
  return matchRankPos === 1 ? "yes" : "no";
}

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

/**
 * The mailto fallback carries the stance and the two positions, never the
 * reader's sentence. Every question is labelled, because the reply may arrive
 * after the card has changed again and one bare number would be ambiguous.
 */
function fallbackHref(
  rating: number | null,
  fitStance: FeedbackStance | null,
  familyRank: number | null,
  matchRankPos: number | null,
  familyCount: number
): string {
  const lines = [
    "Quiz feedback",
    "",
    `Quiz experience: ${rating === null ? "not given" : `${rating}/5`}`,
    `Where the match sits for me: ${stanceText(fitStance)}`,
    `My family on the list: ${familyText(familyRank, familyCount)}`,
    `My church on the list: ${churchText(matchRankPos)}`,
    "",
    "(The feedback form could not reach the server, so this is the fallback.)",
  ];
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Quiz feedback")}&body=${encodeURIComponent(
    lines.join("\n")
  )}`;
}

export function PostQuizFeedback({
  mode,
  familyMatches,
  results,
  topMatchId,
  topMatchName,
  answeredCount,
  enabled = true,
}: {
  mode: "quick" | "standard" | "deep";
  /**
   * The family list on screen, from the top, and the full results list: both
   * pickers index into exactly these, so the positions they send are the places
   * the reader sees. "Active only" filters both, so a hidden tradition keeps no
   * rank.
   */
  familyMatches: FeedbackFamily[];
  /** The full list on screen, in order: a church's position is its index here. */
  results: Array<{ id: string }>;
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
  const [fitStance, setFitStance] = useState<FeedbackStance | null>(null);
  const [familyRank, setFamilyRank] = useState<number | null>(null);
  const [matchRankPos, setMatchRankPos] = useState<number | null>(null);
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
  const stanceHelpId = useId();
  const matchHelpId = useId();
  const familyId = useId();
  const churchId = useId();

  // The server and hydration snapshots are both `null`, so the first paint is
  // the form and the stored answer then flips it to the thank-you. Reading
  // localStorage during render instead would trip a hydration mismatch.
  const submittedRun = useSyncExternalStore(subscribeSubmitted, readSubmittedRun, () => null);
  const alreadySent = runKey !== null && submittedRun === runKey;

  /*
   * The two pickers, built from the lists the dashboard is showing.
   *
   * `posOf` is what turns the full list into the numbers the card sends: a
   * church's position on the page, not its position inside the family. A
   * denomination that is on screen nowhere (a family kept by the active filter
   * whose runner-up was not) is left out rather than given an invented rank --
   * "not in this list" is still there, and it is the truthful answer.
   *
   * Nothing is truncated any more: the whole family list, and every church in the
   * chosen one. The count is what the card prints underneath each control, so the
   * rank is never a number without a denominator.
   */
  const families = useMemo<FamilyOption[]>(() => {
    const posOf = new Map(results.map((denom, index) => [denom.id, index + 1]));
    return familyMatches.map((family, index) => ({
      family: family.family,
      rank: index + 1,
      churches: (family.allDenominations ?? [])
        .map((denom) => ({ id: denom.id, name: denom.name, pos: posOf.get(denom.id) }))
        .filter(
          (denom): denom is { id: string; name: string; pos: number } =>
            typeof denom.pos === "number"
        ),
    }));
  }, [familyMatches, results]);

  /*
   * The families folded into the seven traditions the dashboard already colours
   * by, in rank order inside each one. A `<select>` with thirty flat options is a
   * scroll; grouped, a reader looking for their own family has a heading to aim
   * at. Four families in the data belong to no cluster and land in `OTHER_GROUP`
   * rather than disappearing.
   */
  const familyGroups = useMemo(() => {
    const order: string[] = [];
    const grouped = new Map<string, FamilyOption[]>();
    for (const option of families) {
      const group = FAMILY_TO_GROUP[option.family] ?? OTHER_GROUP;
      const bucket = grouped.get(group);
      if (bucket) bucket.push(option);
      else {
        grouped.set(group, [option]);
        order.push(group);
      }
    }
    return order.map((group) => ({ group, options: grouped.get(group) ?? [] }));
  }, [families]);

  const chosenFamily =
    familyRank === null ? null : families.find((family) => family.rank === familyRank) ?? null;

  // A submit removes the button that had focus, so focus moves to the answer.
  // Only for a submit made here: on a reload the card is already a thank-you,
  // and stealing focus would jump the reader to the bottom of the page.
  useEffect(() => {
    if (sentHere) confirmationRef.current?.focus();
  }, [sentHere]);

  function selectRating(value: number): void {
    setRating(Math.min(5, Math.max(1, value)));
  }

  /**
   * One tap, same toggle rule as the stars and the pickers: pressing the chosen
   * answer again clears it, and a blank stance is a skip rather than a miss.
   * Nothing below is reset -- the stance and the pickers answer different
   * questions, and a reader who says "not close" may still name where their
   * church sits.
   */
  function selectStance(value: FeedbackStance): void {
    setFitStance(fitStance === value ? null : value);
  }

  /**
   * A different family is a different list, so a position inside the old one
   * means nothing afterwards: choosing a family clears the church. An empty
   * value is the control's own placeholder, i.e. the question is back to "no
   * answer", which is a skip and not a miss.
   */
  function chooseFamily(value: string): void {
    setFamilyRank(value === "" ? null : Number(value));
    setMatchRankPos(null);
  }

  /** The second level belongs to the chosen family, so it only changes itself. */
  function chooseChurch(value: string): void {
    setMatchRankPos(value === "" ? null : Number(value));
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
    /*
     * The two names travel with the positions they label.
     *
     * The API stores the numbers, never the labels, so these are context: a
     * position is a place in a list, and the name is what says *which* list. The
     * worker checks the pair against the bundle it serves, which is the same
     * document that built the dashboard above -- so a tab left open across a
     * re-seed cannot have its old list counted as if it were the current one.
     *
     * `chosenFamily` is the family whose churches are on screen (the second
     * picker lists that family's churches and nothing else), and `results.length`
     * is the length of the list a church's position was counted in: a position
     * can never be past it.
     */
    const chosenChurch =
      chosenFamily?.churches.find((church) => church.pos === matchRankPos) ?? null;

    const outcome = await submitQuizFeedback({
      sessionId,
      rating,
      fitStance,
      familyRank,
      familyName: chosenFamily?.family ?? null,
      matchRankPos,
      matchName: chosenChurch?.name ?? null,
      matchRankScope: results.length,
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
      // Which question the stars answered: without it, a GA4 average would mix
      // this rating with the match-closeness rows collected before the change.
      rating_metric: "experience",
      // The question every reader can answer (0008). `exploring` travels as its
      // own value, so an export can tell "the match was wrong" from "there is no
      // church to compare it with" without joining the table.
      fit_stance: fitStance ?? "skipped",
      family_rank: familyRank ?? "skipped",
      match_rank_pos: matchRankPos ?? "skipped",
      // Derived, under the name the event used before the pickers, so a GA4
      // exploration built on `accurate` keeps working across the change: the
      // stance decides it when present, the church's position otherwise, and
      // `exploring` is neither a yes nor a no.
      accurate: accurateLabel(fitStance, matchRankPos),
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
            How did that go?
          </h2>
          <p className="mt-2 text-2xs leading-relaxed text-ink-soft">
            Anonymous. It joins an average, not a feed: nothing you type is published, and there is
            no email or account behind it.
          </p>
        </header>

        {sent ? (
          <>
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
            {/* Outside the live region: the link is not part of what was just
                recorded, and inside `role="status"` it would be re-announced as
                if it were. Only after submitting, too — before that it competes
                with the form for the one thing this card asks for. */}
            <p className="mt-3 text-2xs leading-relaxed text-ink-muted">
              This is an open beta and it changes most weeks —{" "}
              <Link
                href="/changelog"
                className="underline decoration-rule-strong underline-offset-2 hover:text-ink"
              >
                see what changed
              </Link>
              .
            </p>
          </>
        ) : phase === "failed" ? (
          <div className="mt-6 border border-punch-500/40 bg-punch-50 p-4">
            <p className="text-sm font-semibold text-ink">That did not go through.</p>
            <p className="mt-1.5 text-2xs leading-relaxed text-ink-soft">
              Your result is untouched and nothing was lost by trying. Send it again, or write to{" "}
              <a
                href={fallbackHref(rating, fitStance, familyRank, matchRankPos, families.length)}
                className="underline hover:text-ink"
              >
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
                How was the quiz overall?
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
                Five stars is the best experience. The match itself is judged by the two questions
                below: first how close it is to where you actually are, then the two pickers, which
                ask for your own family and where your own church sat. Arrow keys move between
                the stars.
              </span>
            </div>

            {topMatchName && (
              <fieldset>
                <legend className="meta">
                  How close is the top match to where you actually are?
                </legend>
                <p className="mt-1 text-2xs leading-relaxed text-ink-muted">
                  The quiz put{" "}
                  <strong className="font-semibold text-ink-soft">{topMatchName}</strong> first.
                  Anyone can answer this — including readers who are not Christian, or are not
                  looking for a church.
                </p>
                <div
                  role="group"
                  aria-label="How close the top match is"
                  aria-describedby={stanceHelpId}
                  className="mt-2 flex flex-wrap gap-2"
                >
                  {STANCE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={fitStance === option.value}
                      onClick={() => selectStance(option.value)}
                      className={choiceClass(fitStance === option.value)}
                    >
                      <span className="block">{option.label}</span>
                      <span className="mt-0.5 block text-3xs font-normal text-ink-muted">
                        {option.hint}
                      </span>
                    </button>
                  ))}
                </div>
                <span id={stanceHelpId} className="sr-only">
                  Four answers, one tap. I&rsquo;m exploring means there is no church to compare
                  the match against; it is counted as its own answer, not as a wrong match. Pressing
                  an answer again clears it.
                </span>
                <p className="mt-2 text-3xs text-ink-muted">
                  Optional. A blank answer is not counted as a miss.
                </p>
              </fieldset>
            )}

            <fieldset>
              <legend className="meta">If you want to be precise: where do you sit?</legend>
              <p className="mt-1 text-2xs leading-relaxed text-ink-muted">
                {topMatchName ? (
                  <>
                    Two optional pickers, for readers who do belong to a church: your own family,
                    then your church inside it — #1 in both means the top match was right. Every
                    family on the run&rsquo;s list is offered, and every church in the one you pick.
                  </>
                ) : (
                  "This run had no match to judge."
                )}
              </p>
              <span id={matchHelpId} className="sr-only">
                Two steps. First your own family, from the whole family list: none of these families
                means no family on the list fits your church. Then your own denomination inside that
                family: not in this list means it is not among the churches listed for that family,
                or is not in the database at all. Both are about coverage, not about how close the
                match felt — that question is answered above.
              </span>

              {families.length === 0 ? (
                <p className="mt-2 text-2xs leading-relaxed text-ink-muted">
                  This run has no ranked list to judge.
                </p>
              ) : (
                <>
                  <div className="mt-3">
                    <label
                      htmlFor={familyId}
                      className="block text-2xs font-semibold text-ink-soft"
                    >
                      Your family
                    </label>
                    <select
                      id={familyId}
                      value={familyRank === null ? "" : String(familyRank)}
                      onChange={(event) => chooseFamily(event.target.value)}
                      aria-describedby={matchHelpId}
                      className={SELECT_CLASS}
                    >
                      <option value="">Choose your family…</option>
                      {familyGroups.map((group) => (
                        <optgroup key={group.group} label={group.group}>
                          {group.options.map((option) => (
                            <option key={option.rank} value={option.rank}>
                              #{option.rank} — {option.family}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <option value="0">None of these families</option>
                    </select>
                    <p className="mt-1 text-3xs text-ink-muted">
                      {familyRank === null
                        ? `${families.length} families on this run's list, in the order the quiz ranked them.`
                        : familyRank === 0
                          ? "Recorded as a coverage gap, not as a miss."
                          : `#${familyRank} of ${families.length} families this run.`}
                    </p>
                  </div>

                  <div className="mt-4">
                    <label
                      htmlFor={churchId}
                      className="block text-2xs font-semibold text-ink-soft"
                    >
                      Your church{chosenFamily ? ` in ${chosenFamily.family}` : ""}
                    </label>
                    <select
                      id={churchId}
                      value={matchRankPos === null ? "" : String(matchRankPos)}
                      onChange={(event) => chooseChurch(event.target.value)}
                      disabled={!chosenFamily || chosenFamily.churches.length === 0}
                      aria-describedby={matchHelpId}
                      className={SELECT_CLASS}
                    >
                      <option value="">Choose your church…</option>
                      {(chosenFamily?.churches ?? []).map((church) => (
                        <option key={church.id} value={church.pos}>
                          #{church.pos} — {church.name}
                        </option>
                      ))}
                      <option value="0">Not in this list</option>
                    </select>
                    <p className="mt-1 text-3xs text-ink-muted">
                      {!chosenFamily
                        ? "Pick a family first: the list holds that family's churches only."
                        : chosenFamily.churches.length === 0
                          ? "No churches from this family are on this run's list."
                          : matchRankPos === null
                            ? `${chosenFamily.churches.length} churches from this family, numbered by their place on the full results list.`
                            : matchRankPos === 0
                              ? "Recorded as a coverage gap, not as a miss."
                              : `#${matchRankPos} of ${results.length} on the full results list.`}
                    </p>
                  </div>
                  <p className="mt-2 text-3xs text-ink-muted">
                    Optional precision. &ldquo;None of these families&rdquo; and &ldquo;not in this
                    list&rdquo; only say the list did not cover you.
                  </p>
                </>
              )}
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

