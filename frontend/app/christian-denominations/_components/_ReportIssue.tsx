"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import { Check, Flag } from "lucide-react";
import { DIALOG_BUTTON, Dialog } from "../../_components/_Dialog";
import { createClientId, reportQuestionIssue, type IssueType } from "../../../lib/api";
import { trackEvent } from "../../../lib/gtag";
import { APP_VERSION } from "../../../lib/site";
import { modeLabel } from "../_helpers";
import type { Question } from "../_types";

/**
 * The flag in the question's meta row, and the dialog behind it.
 *
 * Task 0.8. A reader who met a broken question had exactly one option before
 * this: leave the quiz and send an email describing a screen they could no
 * longer see. The flag carries the screen with it -- question id, mode, position,
 * the option they had ticked -- so a report is actionable without a round trip.
 *
 * What it deliberately does not ask for: an email address, a name, or anything
 * that would let a report be traced to a person. One tap on a type chip and
 * "Send" is a complete report; the note is optional. The address on the failure
 * path is the same public contact address the footer already prints, offered
 * only when the POST did not land.
 *
 * The button also remembers (in localStorage, per device) that this question was
 * already reported, so a second visit shows "Reported" instead of inviting the
 * same report again.
 */

/** Where a reader can still write if the API is unreachable. */
const REPORT_EMAIL = "theocompass.project@gmail.com";

const NOTE_MAX = 500;

/** Local-only memory of what this device already reported. */
const STORAGE_KEY = "theocompass.reportedQuestions";

/**
 * Last parsed list, keyed on the raw string.
 *
 * `useSyncExternalStore` requires `getSnapshot` to return a stable reference
 * while nothing changed, so the array is cached rather than rebuilt per read.
 */
let cachedRaw: string | null = null;
let cachedIds: string[] = [];
let cachePrimed = false;

const reportedListeners = new Set<() => void>();

const ISSUE_OPTIONS: Array<{ value: IssueType; label: string; hint: string }> = [
  { value: "typo", label: "Typo or wording", hint: "A misspelling, broken grammar, or a sentence that reads wrongly." },
  { value: "bad_options", label: "Wrong options", hint: "An answer is missing, duplicated, or says the wrong thing." },
  { value: "framing", label: "Loaded framing", hint: "The question assumes something unfair or hostile." },
  { value: "other", label: "Something else", hint: "Anything the three above do not cover." },
];

function readReported(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null; // private mode
  }

  if (cachePrimed && raw === cachedRaw) return cachedIds;

  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedIds = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    cachedIds = [];
  }
  cachedRaw = raw;
  cachePrimed = true;
  return cachedIds;
}

/**
 * Subscribers, so `useSyncExternalStore` can re-read the list.
 *
 * The `storage` event covers a second tab; it does not fire in the tab that
 * wrote the value, so `rememberReported` notifies the listeners itself.
 */
function subscribeReported(onChange: () => void): () => void {
  reportedListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    reportedListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function rememberReported(questionId: string): void {
  try {
    const next = [questionId, ...readReported().filter((id) => id !== questionId)].slice(0, 100);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode, or storage full: the badge is a nicety, not the record.
  }
  for (const listener of reportedListeners) listener();
}

type Phase = "form" | "sending" | "sent" | "failed";

export function ReportIssueButton({
  question,
  selectedAnswerIds,
  mode,
  questionIndex,
}: {
  question: Question;
  /** The reader's ticks on this question; the first is the primary selection. */
  selectedAnswerIds: string[];
  mode: "quick" | "standard" | "deep";
  questionIndex: number;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [issueType, setIssueType] = useState<IssueType>("typo");
  const [note, setNote] = useState("");
  const [flagId, setFlagId] = useState(() => createClientId());

  const noteId = useId();
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  // localStorage does not exist during the server render, so the server snapshot
  // is always false and the first paint after hydration fills it in.
  const reported = useSyncExternalStore(
    subscribeReported,
    () => readReported().includes(question.id),
    () => false
  );

  const startReport = () => {
    // A finished report starts a new one; a failed one keeps its id, which is
    // what makes "Try again" idempotent instead of a second row.
    if (phase === "sent") {
      setFlagId(createClientId());
      setIssueType("typo");
      setNote("");
      setPhase("form");
    }
    setOpen(true);
  };

  const close = () => setOpen(false);

  const submit = async () => {
    setPhase("sending");

    const outcome = await reportQuestionIssue({
      flagId,
      questionId: question.id,
      issueType,
      answerId: selectedAnswerIds[0] ?? null,
      note: note.trim() ? note.trim() : null,
      mode,
      questionIndex,
      appVersion: APP_VERSION,
    });

    if (outcome === "failed") {
      setPhase("failed");
      return;
    }

    rememberReported(question.id);
    setPhase("sent");
    // Only the two anonymous fields: the note never leaves this app.
    trackEvent("question_issue_reported", { question_id: question.id, issue_type: issueType });
  };

  const mailtoHref = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(
    `Question ${question.id}`
  )}&body=${encodeURIComponent(
    `${question.question}\n\nProblem: ${issueType}\n${
      note.trim() ? `\n${note.trim()}\n` : ""
    }\n(Q${questionIndex + 1}, ${mode} mode)`
  )}`;

  return (
    <>
      <button
        type="button"
        onClick={startReport}
        aria-haspopup="dialog"
        aria-label={`Report a problem with question ${questionIndex + 1}`}
        className={`-my-1.5 inline-flex min-h-6 items-center gap-1.5 border border-rule px-2 py-1 text-2xs font-medium transition-colors hover:border-rule-strong ${
          reported ? "text-sage hover:text-ink" : "text-ink-muted hover:text-accent-ink"
        }`}
      >
        {reported ? (
          <Check aria-hidden="true" className="h-3 w-3" strokeWidth={2.25} />
        ) : (
          <Flag aria-hidden="true" className="h-3 w-3" strokeWidth={1.75} />
        )}
        {reported ? "Reported" : "Report"}
      </button>

      <Dialog
        open={open}
        onClose={close}
        eyebrow="Report"
        title={phase === "sent" ? "Thank you" : "Something wrong here?"}
        initialFocusRef={firstOptionRef}
        footer={
          phase === "sent" ? (
            <button type="button" onClick={close} className={DIALOG_BUTTON.primary}>
              Close
            </button>
          ) : (
            <>
              <button type="button" onClick={close} className={DIALOG_BUTTON.quiet}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={phase === "sending"}
                className={`${DIALOG_BUTTON.primary} ${
                  phase === "sending" ? "cursor-wait opacity-70" : ""
                }`}
              >
                {phase === "sending" ? "Sending…" : phase === "failed" ? "Try again" : "Send report"}
              </button>
            </>
          )
        }
      >
        <ReportContext question={question} mode={mode} questionIndex={questionIndex} />

        {phase === "sent" ? (
          <p className="mt-4">
            Your report is filed. It lands in the same queue as the roadmap tasks and is
            read before the next data update. Nothing about you is stored with it — no
            email address, no account, no location.
          </p>
        ) : (
          <ReportForm
            issueType={issueType}
            onSelectType={setIssueType}
            note={note}
            onChangeNote={setNote}
            noteId={noteId}
            firstOptionRef={firstOptionRef}
            failed={phase === "failed"}
            mailtoHref={mailtoHref}
          />
        )}
      </Dialog>
    </>
  );
}

/** The screen the report is about: enough to act on without a round trip. */
function ReportContext({
  question,
  mode,
  questionIndex,
}: {
  question: Question;
  mode: "quick" | "standard" | "deep";
  questionIndex: number;
}) {
  return (
    <>
      <p className="num font-mono text-3xs uppercase tracking-[0.14em] text-ink-muted">
        Q{questionIndex + 1} · {modeLabel(mode)} · {question.id}
      </p>
      <p className="mt-2 border-l-2 border-cerulean-300 pl-2.5 text-mini italic leading-snug text-ink-soft">
        {question.question}
      </p>
    </>
  );
}

function ReportForm({
  issueType,
  onSelectType,
  note,
  onChangeNote,
  noteId,
  firstOptionRef,
  failed,
  mailtoHref,
}: {
  issueType: IssueType;
  onSelectType: (type: IssueType) => void;
  note: string;
  onChangeNote: (note: string) => void;
  noteId: string;
  firstOptionRef: React.RefObject<HTMLButtonElement | null>;
  failed: boolean;
  mailtoHref: string;
}) {
  return (
    <>
      <div role="radiogroup" aria-label="What is wrong?" className="mt-4 space-y-1">
        {ISSUE_OPTIONS.map((option, index) => {
          const selected = issueType === option.value;
          return (
            <button
              key={option.value}
              ref={index === 0 ? firstOptionRef : undefined}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelectType(option.value)}
              className={`flex w-full items-start gap-2.5 border px-2.5 py-2 text-left transition-colors ${
                selected
                  ? "border-accent bg-accent-soft"
                  : "border-rule hover:bg-muted-soft"
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full border transition-colors ${
                  selected ? "border-accent bg-accent" : "border-rule-strong"
                }`}
              />
              <span className="min-w-0">
                <span className="block text-mini font-medium text-ink">{option.label}</span>
                <span className="mt-0.5 block text-2xs leading-snug text-ink-muted">
                  {option.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <label
        htmlFor={noteId}
        className="mt-4 block font-mono text-3xs uppercase tracking-[0.14em] text-ink-muted"
      >
        Anything else? <span className="normal-case tracking-normal">(optional)</span>
      </label>
      <textarea
        id={noteId}
        rows={3}
        maxLength={NOTE_MAX}
        value={note}
        onChange={(event) => onChangeNote(event.target.value)}
        placeholder="What were you expecting instead?"
        className="mt-1.5 w-full resize-none border border-rule-strong bg-paper-raised px-2.5 py-2 text-mini text-ink placeholder:text-ink-muted"
      />
      <div className="mt-1 flex items-baseline justify-between gap-3 text-2xs text-ink-muted">
        <span>No email address, no account — this note is all we get.</span>
        <span className="num shrink-0 font-mono">
          {note.length}/{NOTE_MAX}
        </span>
      </div>

      {failed && (
        <p
          role="alert"
          className="mt-3 border border-rule-strong bg-muted-soft px-2.5 py-2 text-2xs leading-snug text-ink-soft"
        >
          That did not reach the server.{" "}
          <a href={mailtoHref} className="font-medium text-punch-ink underline">
            Email it instead
          </a>{" "}
          — it opens your mail app with this question already written out.
        </p>
      )}
    </>
  );
}
