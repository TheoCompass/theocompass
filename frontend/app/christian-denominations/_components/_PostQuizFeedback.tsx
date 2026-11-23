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
import { Check, Search, Star } from "lucide-react";
import Link from "next/link";
import { createClientId, submitQuizFeedback, type FeedbackStance } from "../../../lib/api";
import { trackEvent } from "../../../lib/gtag";
import { APP_VERSION } from "../../../lib/site";
import { SHELL_GUTTERS, WIDTHS } from "./_Shell";

/**
 * The card at the bottom of the results page (task 0.9).
 *
 * Two questions, in the order a reader can answer them: how the quiz felt
 * overall (1-5 stars, the question an app store asks), and which denomination on
 * the list is closest to their church (one picker), plus an optional sentence. It
 * submits with one tap, so a rating alone is a complete answer -- asking for the
 * comment first would cost most of the responses.
 *
 * The stance question comes first because it is the only one every reader can
 * answer. The picker asks which denomination is closest to *their* church, which
 * is a question a curious reader, a seeker and a doubter cannot answer: their
 * only exits used to be "none came close" (stored as a miss, which pulled the
 * published accuracy down) or nothing (stored as a skip, which was invisible).
 * "I'm exploring" is a real answer, and the API stores it as one while leaving it
 * out of the accuracy denominator -- so the figure measures the match instead of
 * measuring how many readers happen to have a church.
 *
 * The picker asks for the closest **denomination**, not for "your church",
 * because the list is the database's rows and a row is never a congregation.
 * Under the old wording a reader with First Baptist Church of Scottsbluff did
 * what the label said, found nothing, and answered "not in this list" -- which
 * made the coverage answer the modal one and left the histogram saying more about
 * how the list is spelled than about where readers are. Asking for the nearest
 * denomination puts the ordinary answer back on the list: Baptist, whichever
 * Baptist row is nearest. The escape hatch is then rare and means what it says --
 * none of the 230 are close, because the reader is unaffiliated, of another
 * faith, or in a tradition the database does not hold -- and its bucket is the
 * clearest signal we have about what to add.
 *
 * The family is read off that pick, and never asked. Every denomination in the
 * bundle is filed under exactly one family, that family is a row of the list the
 * dashboard prints, and its place is printed beside the pick the moment it is
 * made. The card has asked for it twice over its life -- first as a second
 * `<select>`, then as a fallback box behind "not in this list" -- and both are
 * gone: the fallback only fired for readers whose church was missing, and the
 * denomination question now answers itself for them ("the nearest Baptist row"),
 * so the box was collecting a fact the card already held from the people least
 * able to spare a tap. A skipped pick sends no family at all, because there is
 * nothing to read it from.
 *
 * The family place still travels and is still stored: it is context in the
 * moderator queue, and the row is the record of the answer. It is not published
 * as a curve of its own any more, because it would be the denomination answer
 * regrouped -- the same readers counted again by the family their row belongs to
 * -- and a figure that moves whenever another one moves is not a second
 * measurement.
 *
 * The list is printed in full -- 230 denominations, in the order the quiz ranked
 * them -- against an old shortlist of five churches and eight families. With the
 * whole database behind the question, a reader can always answer with the nearest
 * row, which is what makes "none are close" mean something.
 *
 * The picker is `PickerBox`: a field, the list it opens, and the answer it holds,
 * all inside one border, narrowing as the reader types. The family control was a
 * native `<select>` once, and a select cannot be typed into on most platforms and
 * cannot report which row is highlighted. 230 options need a way in -- the
 * browser's type-ahead only jumps by prefix, on some keyboards, and says nothing
 * about what it matched -- so the field is the way in, and it filters names with
 * case and accents folded away.
 *
 * The field still only narrows what is *offered*: the value on the wire is a
 * position read off the list, so a name typed here can never become an answer,
 * and a list that matches nothing still ends with the coverage answer. The status
 * line carries the rank it sends ("#9 of 230 denominations this run") underneath,
 * so the number that reaches the API is never a mystery.
 *
 * The keys are the combobox pattern: arrows walk the list, Home and End go to its
 * ends, Escape closes it, and Enter takes the highlighted row. Enter is prevented
 * in every case, because the field is inside a `<form>` -- otherwise a reader who
 * typed a name and pressed Enter would send the card with nothing but a rating on
 * it. Nothing is highlighted until the reader types or arrows, so a stray Enter
 * cannot record whoever happens to be first as their answer.
 *
 * The answer is kept as the option's **id**, not its number. "Active only"
 * renumbers the list under a card that was already answered, and the same
 * denomination should keep its new place rather than the answer sliding onto
 * whatever inherited the old number. A denomination that drops off the list is
 * named in the status line and counted as a skip, which is also what the API does
 * with a position it cannot place.
 *
 * The match question used to be a yes/no about "the top match", then six rank
 * buckets. A bucket was one number for two different things -- how close the
 * *family* list came, and where the reader's own *church* sat in it -- and a
 * "no" could not tell a near miss from a denomination that is not in the
 * database. The picker asks where the closest denomination sits, numbered by what
 * is on screen: its number is its place in the full results list, not its place
 * inside its family.
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
 * the stance, the position or skipped, whether a comment existed), never the
 * words themselves.
 */

/** Offered only when the POST did not land. */
const CONTACT_EMAIL = "theocompass.project@gmail.com";

const NOTE_MAX = 500;

/**
 * The pickers' box: the one control the card cannot get from a native element.
 * The field, the list it opens and the answer it holds share a border, so typing
 * to find and picking from the list are the same block rather than a search box
 * above a separate list. The focus ring sits on the box because the field inside
 * it has no border of its own.
 */
const PICKER_BOX_CLASS =
  "mt-1.5 max-w-[28rem] border border-rule bg-paper focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-cerulean-600";

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
 * match is judged by the questions underneath.
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
  {
    value: "close",
    label: "Close, but not quite",
    hint: "Right tradition, wrong denomination",
  },
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
 * One tradition on this run's list, as the controller passes it: what the
 * dashboard is showing, so "active only" moves the denominator and the card
 * together. The card uses it only for the place it prints beside the pick -- the
 * picker itself is the full results list, not a family's contents.
 */
export type FeedbackFamily = {
  family: string;
};

/**
 * One row in the picker.
 *
 * `id` is what the answer remembers, and it has to survive the list moving under
 * it: "active only" renumbers the results list under a card that was already
 * answered, and a remembered `22` would then point at whatever denomination had
 * become twenty-second -- the id does not move. `pos` is its place on the list as
 * printed, read off the list when the card renders and when it submits. `family`
 * is the family the row is filed under, which is where the tradition line beneath
 * the pick comes from.
 */
type PickerOption = {
  id: string;
  name: string;
  pos: number;
  family?: string;
};

/**
 * The coverage answer, carried as an option like any other so one list can hold
 * it: a position would invent a denomination and a free-typed name would be
 * checked against the bundle and dropped. It sits at the end of the list whatever
 * is typed, because a query that matches nothing still has to leave an answer.
 */
const COVERAGE_ID = "__coverage__";

/**
 * What "none of the listed denominations are close" is called. Deliberately not
 * "not in this list": the list is the database's rows, not the reader's church,
 * so the answer is about distance, not about a list they failed to find.
 */
const CHURCH_COVERAGE = "None of these are close";

/**
 * What a picker holds.
 *
 * A position alone would not survive the list moving under it, so the answer is
 * the option's **id**, and its place is read off the list when the card renders
 * and when it submits. The coverage answer has no row behind it and is kept as
 * itself.
 */
type PickerAnswer = { kind: "pick"; id: string; name: string } | { kind: "none" };

/**
 * Where a family sits on this run's list: its place among the traditions the
 * dashboard is showing, so "active only" moves the card's denominator with it.
 */
type FamilyPlace = { name: string; pos: number };

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
  if (familyRank === 0) return "not one of the traditions on the list";
  return `#${familyRank} of the ${familyCount} traditions on the list, read from the denomination I picked`;
}

/**
 * The family answer the card sends: the family of the denomination the reader
 * picked, and nothing else.
 *
 * There is no second question behind it. The denomination list carries each row's
 * family, the family list carries each family's place, so naming a denomination
 * answers both at once and the two numbers cannot disagree. A skipped pick sends
 * no family -- there is nothing to read it from -- and a denomination whose
 * family is hidden by "active only" leaves it null too: the card says nothing
 * rather than guessing a place.
 */
function familyFor(
  churchAnswer: PickerAnswer | null,
  church: PickerOption | null,
  familyPlaces: FamilyPlace[]
): { rank: number | null; name: string | null } {
  if (churchAnswer?.kind !== "pick") return { rank: null, name: null };
  const family = church?.family
    ? familyPlaces.find((place) => place.name === church.family) ?? null
    : null;
  return family === null
    ? { rank: null, name: null }
    : { rank: family.pos, name: family.name };
}

function churchText(matchRankPos: number | null): string {
  if (matchRankPos === null) return "skipped";
  if (matchRankPos === 0) return "none of the listed denominations were close";
  return `#${matchRankPos} in the full results list`;
}

/**
 * Case- and accent-insensitive, so "zwingli" finds "Zwinglian" and "presb"
 * finds "Presbyterian". Punctuation is left alone: a name's "&" is still an "&".
 */
function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * What the picker says underneath itself: the answer when there is one,
 * otherwise how many denominations the field is offering. A filter that matches
 * nothing still leaves "None of these are close" as the truthful answer, so the
 * message says so rather than looking like a dead end -- and an answer that fell
 * off the list (a family hidden by "active only") says it is a skip now instead
 * of disappearing quietly.
 */
function churchStatus(
  matchRankPos: number | null,
  resultCount: number,
  shown: number,
  query: string,
  dropped: string | null
): string {
  if (resultCount === 0) return "No denominations on this run's list.";
  if (dropped !== null) {
    return `"${dropped}" is not on this run's list any more, so the answer counts as a skip.`;
  }
  if (matchRankPos === 0) return "Recorded as a gap in our database, not as a miss.";
  if (matchRankPos !== null) return `#${matchRankPos} of ${resultCount} on the full results list.`;
  const needle = query.trim();
  if (needle === "") {
    return `${resultCount} denominations this run, in the order the quiz ranked them.`;
  }
  if (shown === 0) {
    return `No denomination matches "${needle}". "None of these are close" is still the answer if none fit.`;
  }
  return `${shown} of ${resultCount} denominations match "${needle}".`;
}

/**
 * The picker: the field, the list it opens, the answer it holds and the line that
 * says what will be sent, all inside one border.
 *
 * The card used to carry two controls for two questions -- a native `<select>` for
 * the family and a combobox beside it for the church. A select cannot be typed
 * into on most platforms, cannot report which row is highlighted, and made the two
 * answers look like different kinds of data. With one question left there is one
 * control: one way in, one set of keys, and one place where the line underneath is
 * computed.
 *
 * The field only narrows what is *offered*: the value on the wire is a position
 * read off the list, so a name typed here can never become an answer, and a list
 * that matches nothing still ends with the coverage answer.
 *
 * The keys are the combobox pattern: arrows walk the list, Home and End go to its
 * ends, Escape closes it, and Enter takes the highlighted row. Enter is prevented
 * in every case, because the field is inside a `<form>` -- otherwise a reader who
 * typed a name and pressed Enter would send the card with nothing but a rating on
 * it. Nothing is highlighted until the reader types or arrows, so a stray Enter
 * cannot record whoever happens to be first as their answer.
 */
function PickerBox({
  label,
  placeholder,
  coverageName,
  options,
  answer,
  onChange,
  status,
  helpId,
}: {
  label: string;
  placeholder: string;
  /** What this list calls "the list did not cover me". Always its last row. */
  coverageName: string;
  /** The rows, in the order the list prints them, without the coverage row. */
  options: PickerOption[];
  answer: PickerAnswer | null;
  onChange: (next: PickerAnswer | null) => void;
  /** The line underneath, told how many rows match and what is typed. */
  status: (shown: number, query: string) => string;
  helpId: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [activeTouched, setActiveTouched] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLInputElement | null>(null);
  const fieldId = useId();
  const labelId = useId();
  const listId = useId();
  const statusId = useId();

  /** The rows on offer: what the query matches, then the coverage answer. */
  const choices = useMemo<PickerOption[]>(() => {
    const needle = foldName(query.trim());
    const matches =
      needle === "" ? options : options.filter((option) => foldName(option.name).includes(needle));
    return [...matches, { id: COVERAGE_ID, name: coverageName, pos: 0 }];
  }, [coverageName, options, query]);

  /**
   * The list is only there while there is something to list: an empty list
   * disables the field, and a list of nothing but the coverage answer is a
   * question with no options rather than a picker.
   */
  const listOpen = open && options.length > 0;

  /*
   * The highlight, and the row Enter takes. It stays empty until the reader arrows
   * into the list or types, so an Enter in an untouched field cannot record
   * whoever happens to be first as their answer.
   */
  const activeIndex =
    listOpen && (activeTouched || query.trim() !== "") && choices.length > 0
      ? Math.min(Math.max(active, 0), choices.length - 1)
      : -1;

  /** Follow the highlight: arrowing past the fold would otherwise leave it off-screen. */
  useEffect(() => {
    if (activeIndex < 0) return;
    const item = document.getElementById(`${listId}-o${activeIndex}`);
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId]);

  function commit(choice: PickerOption): void {
    onChange(
      choice.pos === 0
        ? { kind: "none" }
        : { kind: "pick", id: choice.id, name: choice.name }
    );
    setQuery("");
    setOpen(false);
    setActive(-1);
    setActiveTouched(false);
  }

  function clear(): void {
    onChange(null);
    setQuery("");
    setOpen(false);
    setActive(-1);
    setActiveTouched(false);
  }

  function changeQuery(value: string): void {
    setQuery(value);
    setOpen(true);
    setActive(value.trim() === "" ? -1 : 0);
    setActiveTouched(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      setActiveTouched(true);
      setActive((current) => {
        const next = current < 0 ? (step === 1 ? 0 : choices.length - 1) : current + step;
        return Math.min(Math.max(next, 0), choices.length - 1);
      });
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (options.length === 0) return;
      setOpen(true);
      setActiveTouched(true);
      setActive(event.key === "Home" ? 0 : choices.length - 1);
    } else if (event.key === "Enter") {
      // The field is inside a `<form>`: an Enter that is not about this list would
      // send the card with only a rating on it.
      event.preventDefault();
      if (!listOpen) {
        setOpen(true);
        return;
      }
      const choice = choices[activeIndex];
      if (choice) commit(choice);
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
      } else if (query !== "") {
        event.preventDefault();
        setQuery("");
      }
    }
  }

  return (
    <div>
      <label htmlFor={fieldId} id={labelId} className="block text-2xs font-semibold text-ink-soft">
        {label}
      </label>
      <div className={PICKER_BOX_CLASS}>
        <div
          className="flex items-center gap-1.5 px-2.5"
          // The icon and the padding read as part of the field, so a click there
          // should put the caret in it -- but a click that already landed on the
          // field is left alone, or it would stop the reader placing the caret by
          // hand. Either way the press asks for the list: after a pick the field is
          // empty and still focused, so a plain focus event would not come.
          onMouseDown={(event) => {
            if (event.target === fieldRef.current) return;
            event.preventDefault();
            fieldRef.current?.focus();
            setOpen(true);
          }}
        >
          <Search aria-hidden="true" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          <input
            id={fieldId}
            ref={fieldRef}
            type="text"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex < 0 ? undefined : `${listId}-o${activeIndex}`}
            aria-describedby={`${helpId} ${statusId}`}
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
            // A press inside the field asks for the list too: after a pick it is
            // empty and still focused, so no focus event arrives and the reader
            // would have to type to see it.
            onClick={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            disabled={options.length === 0}
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            className="w-full bg-transparent py-1.5 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-none disabled:cursor-not-allowed"
          />
        </div>

        {/* The answer, inside the same box: the field finds, this line says what
            was found, and Clear puts it back to a skip. */}
        {answer !== null && (
          <div className="flex items-center gap-2 border-t border-rule bg-cerulean-50 px-2.5 py-1.5">
            <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-cerulean-800" />
            <span className="min-w-0 flex-1 truncate text-2xs font-semibold text-ink-soft">
              {answer.kind === "none" ? coverageName : answer.name}
            </span>
            <button
              type="button"
              onClick={clear}
              aria-label={`Clear ${label.toLowerCase()}`}
              className="shrink-0 text-3xs font-semibold text-ink-muted underline decoration-rule-strong underline-offset-2 hover:text-ink"
            >
              Clear
            </button>
          </div>
        )}

        {/* The list, in that same border: it is on screen while the field has
            focus, so what is offered and what is typed are never two different
            places on the page. */}
        {listOpen && (
          <div
            id={listId}
            ref={listRef}
            role="listbox"
            aria-labelledby={labelId}
            className="max-h-56 overflow-y-auto border-t border-rule"
          >
            {choices.map((option, index) => {
              const isActive = index === activeIndex;
              const selected =
                answer !== null &&
                (option.pos === 0
                  ? answer.kind === "none"
                  : answer.kind === "pick" && answer.id === option.id);
              return (
                <div
                  key={option.id}
                  id={`${listId}-o${index}`}
                  role="option"
                  aria-selected={selected}
                  // A `mousedown` would blur the field, and blur closes the
                  // list: the pick would land on a list that had already gone.
                  // The click still commits.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(option)}
                  onMouseEnter={() => {
                    setActive(index);
                    setActiveTouched(true);
                  }}
                  className={`flex cursor-pointer items-baseline gap-2 px-2.5 py-1.5 text-xs ${
                    isActive ? "bg-cerulean-100 text-cerulean-900" : "text-ink-soft"
                  }`}
                >
                  <span className="num w-8 shrink-0 text-right font-mono text-3xs text-ink-muted">
                    {option.pos === 0 ? "—" : `#${option.pos}`}
                  </span>
                  <span className="min-w-0 flex-1">{option.name}</span>
                  {selected && (
                    <Check aria-hidden="true" className="h-3 w-3 shrink-0 text-cerulean-800" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p id={statusId} role="status" className="mt-1 text-3xs text-ink-muted">
        {status(choices.length - 1, query)}
      </p>
    </div>
  );
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
 * The mailto fallback carries the stance and both positions, never the reader's
 * sentence. Every question is labelled, because the reply may arrive after the
 * card has changed again and one bare number would be ambiguous. The family line
 * says where it came from (the denomination the reader picked), so a reply cannot
 * be read as a family the reader chose by hand.
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
    `Closest denomination's tradition: ${familyText(familyRank, familyCount)}`,
    `Closest denomination on the list: ${churchText(matchRankPos)}`,
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
   * The family list on screen, from the top. The card indexes it only to read the
   * place of the family that the picked denomination belongs to; "active only"
   * filters it, so a hidden tradition leaves the family rank null rather than an
   * old number.
   */
  familyMatches: FeedbackFamily[];
  /**
   * The full list on screen, in order: a denomination's position is its index
   * here, and the name travels beside it because that is what the worker checks
   * the position against (`matchName`). `family` is the family the denomination is
   * filed under -- context the card reads the family place from, never a second
   * question.
   */
  results: Array<{ id: string; name: string; family?: string }>;
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
  /** The pick: a denomination by id, the coverage answer, or nothing (skip). */
  const [answer, setAnswer] = useState<PickerAnswer | null>(null);
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

  // The server and hydration snapshots are both `null`, so the first paint is
  // the form and the stored answer then flips it to the thank-you. Reading
  // localStorage during render instead would trip a hydration mismatch.
  const submittedRun = useSyncExternalStore(subscribeSubmitted, readSubmittedRun, () => null);
  const alreadySent = runKey !== null && submittedRun === runKey;

  /*
   * The two lists the card indexes into, built from what the dashboard is
   * showing.
   *
   * Denominations are numbered by their place in `results` -- every row on screen,
   * whichever family it belongs to -- and each carries the family it is filed
   * under, which is what makes the family answer a reading of the list rather than
   * a second question. `familyPlaces` is the same list one level up: each family's
   * place among the traditions on screen, which is what the line under the pick
   * prints.
   *
   * Nothing is truncated. The count is what the card prints underneath the control,
   * so the rank is never a number without a denominator.
   */
  const familyPlaces = useMemo<FamilyPlace[]>(
    () => familyMatches.map((family, index) => ({ name: family.family, pos: index + 1 })),
    [familyMatches]
  );

  const churches = useMemo<PickerOption[]>(
    () =>
      results.map((denom, index) => ({
        id: denom.id,
        name: denom.name,
        pos: index + 1,
        family: denom.family,
      })),
    [results]
  );

  /*
   * The answer, read back off the list it was picked from. Keeping the id rather
   * than the number is what makes "active only" harmless: the same denomination
   * keeps whichever place it now has, and one that fell off the list is named in the
   * status line instead of quietly becoming something else.
   */
  const chosenChurch =
    answer?.kind === "pick" ? churches.find((church) => church.id === answer.id) ?? null : null;

  const churchPos =
    answer === null ? null : answer.kind === "none" ? 0 : chosenChurch?.pos ?? null;

  /** Set only when the answer is a denomination this run's list no longer holds. */
  const droppedChurch = answer?.kind === "pick" && chosenChurch === null ? answer.name : null;

  /**
   * The family of the pick, and its place on this run's family list -- read, never
   * asked. A skipped pick, or one whose family the list has hidden, sends nothing:
   * the card does not guess a place.
   */
  const familySent = familyFor(answer, chosenChurch, familyPlaces);

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
   * One tap, same toggle rule as the stars and the picker: pressing the chosen
   * answer again clears it, and a blank stance is a skip rather than a miss.
   * Nothing below is reset -- the stance and the pick answer different questions,
   * and a reader who says "not close" may still name the nearest denomination.
   */
  function selectStance(value: FeedbackStance): void {
    setFitStance(fitStance === value ? null : value);
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
     * The names travel with the positions they label.
     *
     * The API stores the numbers, never the labels, so these are context: a
     * position is a place in a list, and the name is what says *which* list. The
     * worker checks each name against the bundle it serves, which is the same
     * document that built the dashboard above -- so a tab left open across a
     * re-seed cannot have its old list counted as if it were the current one.
     * What is checked is that each name is in the bundle, that `matchName` sits at
     * `matchRankPos` in this run's list, and that `results.length` -- the length of
     * the list that position was counted in -- is not smaller than the position
     * itself.
     */
    const outcome = await submitQuizFeedback({
      sessionId,
      rating,
      fitStance,
      familyRank: familySent.rank,
      familyName: familySent.name,
      matchRankPos: churchPos,
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
      // The tradition the pick landed in, and its place on this run's list. It is
      // context for the export: the row's real answer is `match_rank_pos`, and the
      // family is that answer regrouped.
      family_rank: familySent.rank ?? "skipped",
      match_rank_pos: churchPos ?? "skipped",
      // Derived, under the name the event used before the pickers, so a GA4
      // exploration built on `accurate` keeps working across the change: the
      // stance decides it when present, the position otherwise, and `exploring` is
      // neither a yes nor a no.
      accurate: accurateLabel(fitStance, churchPos),
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
                href={fallbackHref(
                  rating,
                  fitStance,
                  familySent.rank,
                  churchPos,
                  familyPlaces.length
                )}
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
                below: first how close it is to where you actually are, then which denomination is
                closest to your church. Arrow keys move between the stars.
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
              <legend className="meta">Which denomination is closest to your church?</legend>
              <p className="mt-1 text-2xs leading-relaxed text-ink-muted">
                {topMatchName ? (
                  <>
                    Optional. Pick the nearest denomination, not a congregation; #1 means the top match
                    was right.
                  </>
                ) : (
                  "This run had no match to judge."
                )}
              </p>
              <span id={matchHelpId} className="sr-only">
                One optional answer about the denomination closest to your church, numbered the way
                the dashboard above numbers it. Typing narrows the list but is never submitted; arrow
                keys walk it, Enter takes the highlighted denomination, and Escape closes it.
                &ldquo;None of these are close&rdquo; means none of the listed denominations are —
                unaffiliated, another faith, or a tradition the database does not hold — which is a
                gap in the data and not a miss. How close the match felt is the question above.
              </span>

              {churches.length === 0 ? (
                <p className="mt-2 text-2xs leading-relaxed text-ink-muted">
                  This run has no ranked list to judge.
                </p>
              ) : (
                <div className="mt-3">
                  <PickerBox
                    label="Closest denomination"
                    placeholder="Type a few letters, e.g. bapt"
                    coverageName={CHURCH_COVERAGE}
                    options={churches}
                    answer={answer}
                    onChange={setAnswer}
                    status={(shown, query) =>
                      churchStatus(churchPos, results.length, shown, query, droppedChurch)
                    }
                    helpId={matchHelpId}
                  />
                  {/* What the pick answers without being asked: the tradition it is
                      filed under, read off the two lists. */}
                  {familySent.name !== null && familySent.rank !== null && (
                    <p className="mt-2 text-3xs leading-relaxed text-ink-muted">
                      Filed under{" "}
                      <strong className="font-semibold text-ink-soft">{familySent.name}</strong> —{" "}
                      <span className="num font-mono">#{familySent.rank}</span> of {familyPlaces.length}{" "}
                      traditions this run.
                    </p>
                  )}
                </div>
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

