"use client";

import { ArrowRight, Check, ChevronLeft, Flag, Info, Minus, X } from "lucide-react";
import type { Question, Answer, UserResponse } from "../_types";
import { ReportIssueButton } from "./_ReportIssue";
import {
  QUIZ_CATEGORY_COLORS,
  QUIZ_CATEGORY_COLORS_DEFAULT,
  QUIZ_CATEGORY_LABELS,
  CERTAINTY_LABELS,
  TOLERANCE_LABELS,
  TOLERANCE_DESCRIPTIONS,
} from "../_constants";

/* Compact tick labels — the full label is shown above the rail. */
const CERTAINTY_SHORT = ["Not sure", "Leaning", "Pretty sure", "Certain"];
const TOLERANCE_SHORT = ["None", "No fellowship", "A few", "Most", "All"];

/**
 * A stepped slider with a painted track, tick marks and a live readout.
 *
 * Restored from the previous design at the user's request: dragging along a
 * scale reads as "more or less" far faster than picking from a list of buttons.
 * The native input stays on top (z-10) so keyboard, screen readers and touch
 * all keep working; the track underneath is purely cosmetic.
 */
export function AxisSlider({
  legend,
  labels,
  shortLabels,
  value,
  onChange,
  hint,
}: {
  legend: string;
  labels: string[];
  shortLabels: string[];
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  const id = `axis-${legend.replace(/[^a-z]+/gi, "-").toLowerCase()}`;
  const max = labels.length - 1;
  const pct = max > 0 ? (value / max) * 100 : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="meta">
          {legend}
        </label>
        <span className="num text-xs font-semibold text-cerulean-900">
          {labels[value]}
        </span>
      </div>

      <div className="relative mt-2 h-9">
        {/* track */}
        <div className="pointer-events-none absolute inset-x-2.5 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-cerulean-100" />
        {/* fill */}
        <div className="pointer-events-none absolute inset-x-2.5 top-1/2 h-1.5 -translate-y-1/2">
          <div
            className="h-full rounded-full bg-cerulean-600 transition-[width] duration-150 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* step ticks */}
        <div className="pointer-events-none absolute inset-x-2.5 top-1/2 flex -translate-y-1/2 justify-between">
          {labels.map((_, index) => (
            <span
              key={index}
              className={`h-2.5 w-0.5 rounded-full transition-colors ${
                index <= value ? "bg-paper" : "bg-cerulean-300"
              }`}
            />
          ))}
        </div>

        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          aria-valuetext={labels[value]}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 z-10 h-9 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-runnable-track]:h-9 [&::-webkit-slider-runnable-track]:bg-transparent
            [&::-webkit-slider-thumb]:mt-2 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-paper
            [&::-webkit-slider-thumb]:bg-cerulean-900 [&::-webkit-slider-thumb]:shadow-none
            [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-track]:h-9 [&::-moz-range-track]:bg-transparent
            [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-paper
            [&::-moz-range-thumb]:bg-cerulean-900 [&::-moz-range-thumb]:shadow-none"
        />
      </div>

      <div className="mt-1 flex justify-between gap-1 text-3xs leading-tight text-ink-muted">
        {shortLabels.map((label, index) => {
          const alignment =
            index === 0 ? "text-left" : index === shortLabels.length - 1 ? "text-right" : "text-center";
          return (
            <span
              key={label}
              className={`flex-1 ${alignment} ${
                index === value ? "font-semibold text-cerulean-900" : ""
              }`}
            >
              {label}
            </span>
          );
        })}
      </div>

      {hint && <p className="mt-2 text-2xs leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}

export interface QuizQuestionViewProps {

  currentQuestion: Question;
  questions: Question[];
  currentQuestionIndex: number;
  totalQuestions: number;
  progressPercentage: number;
  hasPrimaryKeyword: boolean;
  /** Quiz length; shown in the report dialog so a flag carries its screen. */
  mode: "quick" | "standard" | "deep";
  displayAnswers: Answer[];
  /** Every option currently affirmed on this question, in click order. */
  selectedAnswers: string[];
  expandedInfo: string | null;
  isSilenceSelected: boolean;
  silenceType: "apathetic" | "hostile" | null;
  certainty: number;
  tolerance: number;
  hasShownFirstInfoPulse: boolean;
  showShortcutHint: boolean;
  showCategoryTransition: boolean;
  transitionCategoryName: string;
  transitionCategoryCode: string;
  quizAnimKey: number;
  /** Which way the reader is travelling. Back must not animate as forward. */
  quizAnimDir: "next" | "prev";
  userAnswers: Record<string, UserResponse>;
  /**
   * Multi-select is opt-in, per question, and off by default: the list has to
   * read as single choices unless the reader deliberately asks otherwise.
   */
  multiSelectEnabled: boolean;
  /** Hard cap on ticks while multi-select is on (`MAX_MULTI_SELECT`). */
  maxSelections: number;
  /**
   * "None of the above" and the apathetic-silence row share one calculation but
   * are two different answers on screen, so each needs its own lit state.
   */
  noneOfAboveSelected: boolean;
  apatheticSilenceSelected: boolean;
  onToggleAnswer: (answerId: string) => void;
  onToggleInfo: (e: React.MouseEvent, answerId: string) => void;
  onSilenceClick: (type: "apathetic" | "hostile") => void;
  /** The last row of the answer list: "none of these states my position". */
  onSelectNone: () => void;
  /** Opens the disclaimer dialog that turns multi-select on for this question. */
  onOpenMultiSelectMode: () => void;
  /** Back to one answer; the controller collapses the set to a single pick. */
  onDisableMultiSelect: () => void;
  onSetCertainty: (val: number) => void;
  onSetTolerance: (val: number) => void;
  onNext: () => void;
  onBack: () => void;
  onDismissShortcutHint: () => void;
  onDismissCategoryTransition: () => void;
}

export function QuizQuestionView({
  currentQuestion,
  questions,
  currentQuestionIndex,
  totalQuestions,
  hasPrimaryKeyword,
  mode,
  displayAnswers,
  selectedAnswers,
  expandedInfo,
  isSilenceSelected,
  silenceType,
  certainty,
  tolerance,
  hasShownFirstInfoPulse,
  showShortcutHint,
  showCategoryTransition,
  transitionCategoryName,
  quizAnimKey,
  quizAnimDir,
  userAnswers,
  multiSelectEnabled,
  maxSelections,
  noneOfAboveSelected,
  apatheticSilenceSelected,
  onToggleAnswer,
  onToggleInfo,
  onSilenceClick,
  onSelectNone,
  onOpenMultiSelectMode,
  onDisableMultiSelect,
  onSetCertainty,
  onSetTolerance,
  onNext,
  onBack,
  onDismissShortcutHint,
  onDismissCategoryTransition,
}: QuizQuestionViewProps) {
  const colors =
    QUIZ_CATEGORY_COLORS[currentQuestion.category] || QUIZ_CATEGORY_COLORS_DEFAULT;
  const categoryLabel =
    QUIZ_CATEGORY_LABELS[currentQuestion.category] || currentQuestion.category;

  const answeredCount = Object.keys(userAnswers).length;
  const progress =
    totalQuestions > 0 ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0;
  const canAdvance = selectedAnswers.length > 0 || isSilenceSelected;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const showConviction = selectedAnswers.length > 0 && !isSilenceSelected;
  // At the cap the remaining rows stop being offers. The controller refuses a
  // fourth tick as well; this is the visible half of the same rule.
  const selectionAtCap =
    multiSelectEnabled && selectedAnswers.length >= maxSelections;

  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-[64rem] flex-grow flex-col px-5 py-8 md:px-8 md:py-10 lg:px-10"
    >
      {/* ── Progress: one thin rule, not 30 dots ──────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="h-[2px] flex-1 bg-rule" role="presentation">
          <div
            className="h-full bg-ink transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(progress, 2)}%` }}
          />
        </div>
        <span className="meta num shrink-0">
          <span
            key={currentQuestionIndex}
            className="inline-block animate-number-tick"
          >
            {String(currentQuestionIndex + 1).padStart(2, "0")}
          </span>{" "}
          / {totalQuestions}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule pb-2">
        <span className="meta flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${colors.dot}`}
          />
          {categoryLabel}
        </span>
        {/* The flag lives at the end of the meta row: on every question, and
            never competing with the answers for attention. */}
        <div className="flex items-center gap-3">
          <span className="meta num">{answeredCount} answered</span>
          <ReportIssueButton
            question={currentQuestion}
            selectedAnswerIds={selectedAnswers}
            mode={mode}
            questionIndex={currentQuestionIndex}
          />
        </div>
      </div>

      <div
        key={quizAnimKey}
        className={`flex flex-grow flex-col ${
          quizAnimDir === "prev" ? "animate-slide-in-left" : "animate-slide-in-right"
        }`}
      >
        {/* Keyboard hint — first question only */}
        {currentQuestionIndex === 0 && showShortcutHint && (
          <div className="mt-3 flex items-start justify-between gap-3 border border-rule bg-muted-soft px-3 py-2 animate-fade-in">
            <div className="meta flex flex-wrap gap-x-3 gap-y-1 normal-case tracking-normal">
              <span>
                <kbd className="border border-rule-strong bg-paper-raised px-1 font-mono text-3xs">1</kbd>
                –
                <kbd className="border border-rule-strong bg-paper-raised px-1 font-mono text-3xs">4</kbd>{" "}
                {multiSelectEnabled ? "toggle" : "select"}
              </span>
              <span>
                <kbd className="border border-rule-strong bg-paper-raised px-1 font-mono text-3xs">Enter</kbd>{" "}
                confirm
              </span>
              <span>
                <kbd className="border border-rule-strong bg-paper-raised px-1 font-mono text-3xs">N</kbd>{" "}
                none
              </span>
              <span>
                <kbd className="border border-rule-strong bg-paper-raised px-1 font-mono text-3xs">S</kbd>{" "}
                apathetic
              </span>
              <span>
                <kbd className="border border-rule-strong bg-paper-raised px-1 font-mono text-3xs">H</kbd>{" "}
                hostile
              </span>
              {/* The flag is the one control in this view that does not look
                  like a control until you already know it is one, so the hint
                  bar -- which is read once, on the first question -- says where
                  it is. */}
              <span className="flex items-center gap-1 text-ink-muted">
                <Flag aria-hidden="true" className="h-3 w-3" strokeWidth={1.75} />
                Something wrong here? Use Report.
              </span>
            </div>
            <button
              type="button"
              onClick={onDismissShortcutHint}
              aria-label="Dismiss keyboard shortcuts"
              className="shrink-0 text-ink-muted transition-colors hover:text-ink"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Section-change banner */}
        {showCategoryTransition && (
          <div className="mt-3 flex items-center justify-between gap-3 border-l-2 border-cerulean-600 bg-cerulean-50 py-2 pl-3 pr-2 animate-slide-down-in">
            <div className="min-w-0">
              <div className="meta">New section</div>
              <div className="truncate text-sm font-medium text-ink">
                {transitionCategoryName}
              </div>
            </div>
            <button
              type="button"
              onClick={onDismissCategoryTransition}
              aria-label="Dismiss section notice"
              className="shrink-0 text-ink-muted transition-colors hover:text-ink"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}


        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8">
          {/* ── Question + answers ─────────────────────────────────── */}
          <div className="min-w-0">
            <h1 className="mt-6 font-display text-[clamp(1.25rem,2.6vw,1.7rem)] leading-[1.25] text-ink">
              {currentQuestion.question}
            </h1>

            {/* Single choice is the rule, so it is stated plainly. The door to
                multi-select sits beside it: quiet enough not to invite the
                mode, visible enough to find when a reader holds two options.
                The counter confirms the toggle actually took. */}
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-2xs leading-snug text-ink-muted">
              {multiSelectEnabled ? (
                <>
                  <span>
                    Tick up to {maxSelections} options you affirm — this question only.
                  </span>
                  <span
                    aria-live="polite"
                    className="shrink-0 border border-cerulean-300 bg-cerulean-50 px-1.5 py-0.5 font-semibold text-cerulean-900"
                  >
                    <span className="num">{selectedAnswers.length}</span>
                    <span className="num"> / {maxSelections}</span> selected
                  </span>
                  <button
                    type="button"
                    onClick={onDisableMultiSelect}
                    className="shrink-0 underline decoration-dotted underline-offset-2 transition-colors hover:text-ink"
                  >
                    Back to one
                  </button>
                </>
              ) : (
                <>
                  <span>Pick the one option closest to what you hold.</span>
                  <button
                    type="button"
                    onClick={onOpenMultiSelectMode}
                    className="shrink-0 border border-rule-strong bg-paper-raised px-1.5 py-0.5 font-semibold text-cerulean-800 transition-colors hover:border-cerulean-400 hover:bg-cerulean-50"
                  >
                    Hold more than one?
                  </button>
                </>
              )}
            </div>

            {selectionAtCap && (
              <p className="mt-1.5 text-2xs leading-snug text-ink-muted">
                {maxSelections} is the limit — untick one to choose another.
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2">
              {displayAnswers.map((ans) => {
                const isSelected = selectedAnswers.includes(ans.id);
                const isInfoOpen = expandedInfo === ans.id;
                // At the cap an unticked row is no longer an offer; the
                // controller would refuse it anyway, so it must not look live.
                const isBlocked = selectionAtCap && !isSelected;

                return (
                  <div
                    key={ans.id}
                    /* Silence dims the options you did not take; the "None of
                       the above" row keeps full contrast because it is the row
                       that is now selected. */
                    className={`transition-opacity duration-200 ${
                      isSilenceSelected || isBlocked ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-stretch gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!isBlocked) onToggleAnswer(ans.id);
                        }}
                        aria-pressed={isSelected}
                        aria-disabled={isBlocked}
                        className={`group relative flex min-w-0 flex-1 items-center gap-2.5 border py-2.5 pl-2.5 pr-3 text-left transition-colors sm:py-3 ${
                          isSelected
                            ? "border-cerulean-600 bg-cerulean-50 ring-1 ring-cerulean-600"
                            : isBlocked
                              ? "cursor-not-allowed border-rule bg-paper-raised"
                              : "border-rule bg-paper-raised hover:border-cerulean-400 hover:bg-cerulean-50/60"
                        }`}
                      >
                        {/* The tap acknowledges itself: 2px of accent running
                            down the inside edge, then the tick pops. A colour
                            change alone was too quiet to register on a phone. */}
                        {isSelected && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-y-0 left-0 w-[2px] origin-top animate-keyline-in bg-cerulean-600"
                          />
                        )}
                        {/* Affordance follows the mode: a round radio while
                            one answer is the rule, a square checkbox only once
                            the reader has opted into multi-select. */}
                        <span
                          aria-hidden="true"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-colors ${
                            multiSelectEnabled ? "rounded-[3px]" : "rounded-full"
                          } ${
                            isSelected
                              ? "border-cerulean-600 bg-cerulean-600"
                              : isBlocked
                                ? "border-rule-strong"
                                : "border-rule-strong group-hover:border-cerulean-400"
                          }`}
                        >
                          {isSelected && (
                            <Check
                              className="h-3 w-3 animate-tick-pop text-white"
                              strokeWidth={3}
                            />
                          )}
                        </span>
                        <span
                          className={`min-w-0 flex-1 text-mini leading-snug ${
                            isSelected ? "font-semibold text-ink" : "text-ink-soft"
                          }`}
                        >
                          {ans.text}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={(event) => onToggleInfo(event, ans.id)}
                        aria-expanded={isInfoOpen}
                        aria-label="Further context for this answer"
                        className={`flex shrink-0 items-center gap-1 border px-2 text-2xs font-medium transition-colors ${
                          isInfoOpen
                            ? "border-cerulean-900 bg-cerulean-900 text-white"
                            : "border-rule bg-paper-raised text-ink-muted hover:border-cerulean-400 hover:text-cerulean-800"
                        } ${
                          !hasShownFirstInfoPulse && currentQuestionIndex === 0
                            ? "ring-1 ring-punch/40"
                            : ""
                        }`}
                      >
                        <Info aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
                        <span className="hidden sm:inline">
                          {isInfoOpen ? "Hide" : "Context"}
                        </span>
                      </button>
                    </div>

                    {isInfoOpen && (
                      <div className="mt-2 border border-cerulean-200 bg-cerulean-50 p-3 text-sm leading-relaxed text-ink-soft">
                        <span className="meta block">Further context</span>
                        <p className="mt-1">{ans.desc}</p>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* ── None of the above ───────────────────────────────────
                  Its own answer, not a footnote on the silence row: it reads as
                  the last entry of the list, and only this row lights when it
                  is chosen. Which calculation it feeds is a developer detail
                  (see `handleNoneOfTheAbove`), not something to explain here. */}
              <button
                type="button"
                onClick={onSelectNone}
                aria-pressed={noneOfAboveSelected}
                className={`mt-1 flex items-center gap-2.5 border py-2.5 pl-2.5 pr-3 text-left transition-colors ${
                  noneOfAboveSelected
                    ? "border-cerulean-600 bg-cerulean-50 ring-1 ring-cerulean-600"
                    : "border-rule bg-paper-raised hover:border-cerulean-400 hover:bg-cerulean-50/60"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    noneOfAboveSelected
                      ? "border-cerulean-600 bg-cerulean-600"
                      : "border-rule-strong"
                  }`}
                >
                  {noneOfAboveSelected ? (
                    <Check className="h-3 w-3 animate-tick-pop text-white" strokeWidth={3} />
                  ) : (
                    <Minus className="h-3 w-3 text-ink-muted" strokeWidth={3} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-mini font-medium leading-tight text-ink">
                    None of the above
                  </span>
                  <span className="mt-0.5 block text-2xs leading-snug text-ink-muted">
                    Nothing here is what I hold
                  </span>
                </span>
                <kbd className="ml-auto hidden shrink-0 border border-rule-strong bg-paper-raised px-1 font-mono text-3xs text-ink-muted sm:block">
                  N
                </kbd>
              </button>
            </div>


            {/* ── Silence ───────────────────────────────────────────── */}
            <div className="mt-7 border-t border-rule pt-4">
              <div className="meta">Or declare the question out of scope</div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {/* Same radio affordance as the answers above: these are two
                    more choices, not an aside. The glyph inside the radio says
                    which kind of silence it is - dash = irrelevant, X = reject.
                    This row is lit only when silence was declared *here*, not
                    via the list's "None of the above" entry. */}
                <button
                  type="button"
                  onClick={() => onSilenceClick("apathetic")}
                  aria-pressed={apatheticSilenceSelected}
                  className={`flex items-center gap-2.5 border py-2.5 pl-2.5 pr-3 text-left transition-colors ${
                    apatheticSilenceSelected
                      ? "border-cerulean-600 bg-cerulean-50 ring-1 ring-cerulean-600"
                      : "border-rule bg-paper-raised hover:border-cerulean-400 hover:bg-cerulean-50/60"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      apatheticSilenceSelected
                        ? "border-cerulean-600 bg-cerulean-600"
                        : "border-rule-strong"
                    }`}
                  >
                    <Minus
                      className={`h-3 w-3 ${apatheticSilenceSelected ? "text-white" : "text-ink-muted"}`}
                      strokeWidth={3}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-mini font-medium leading-tight text-ink">
                      Apathetic silence
                    </span>
                    <span className="mt-0.5 block text-2xs leading-snug text-ink-muted">
                      Not theologically relevant to me
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onSilenceClick("hostile")}
                  aria-pressed={silenceType === "hostile"}
                  className={`flex items-center gap-2.5 border py-2.5 pl-2.5 pr-3 text-left transition-colors ${
                    silenceType === "hostile"
                      ? "border-punch-700 bg-punch-soft ring-1 ring-punch-700"
                      : "border-rule bg-paper-raised hover:border-punch-300 hover:bg-punch-soft/60"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      silenceType === "hostile"
                        ? "border-punch-700 bg-punch-700"
                        : "border-rule-strong"
                    }`}
                  >
                    <X
                      className={`h-3 w-3 ${silenceType === "hostile" ? "text-white" : "text-ink-muted"}`}
                      strokeWidth={3}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-mini font-medium leading-tight text-ink">
                      Hostile silence
                    </span>
                    <span className="mt-0.5 block text-2xs leading-snug text-ink-muted">
                      I reject the framing of this question
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>


          {/* ── Conviction rail (desktop sticky / mobile inline) ─────── */}
          <aside className="mt-8 lg:mt-6 lg:sticky lg:top-24">
            {showConviction ? (
              <div className="card animate-fade-in-up p-4 sm:p-5">
                <AxisSlider
                  legend="How sure are you?"
                  labels={CERTAINTY_LABELS}
                  shortLabels={CERTAINTY_SHORT}
                  value={certainty}
                  onChange={onSetCertainty}
                />

                <div className="rule my-5" />

                <AxisSlider
                  legend="How many views are acceptable?"
                  labels={TOLERANCE_LABELS}
                  shortLabels={TOLERANCE_SHORT}
                  value={tolerance}
                  onChange={onSetTolerance}
                  hint={
                    hasPrimaryKeyword
                      ? "How many of the other options are acceptable alternatives to your primary view?"
                      : TOLERANCE_DESCRIPTIONS[tolerance]
                  }
                />
              </div>
            ) : (
              <p className="border-l-2 border-cerulean-300 py-2 pl-3 text-2xs leading-snug text-ink-muted">
                Pick an answer (or declare silence) and you can weight how sure you
                are. Sensible defaults are pre-filled, so you can also just continue.
              </p>
            )}
          </aside>
        </div>

        {/* ── Nav: always reachable ─────────────────────────────────── */}
        <div className="sticky bottom-0 z-10 -mx-5 mt-auto flex items-center justify-between gap-3 border-t border-rule bg-paper/95 px-5 py-2.5 backdrop-blur md:-mx-8 md:px-8 lg:static lg:mx-0 lg:mt-10 lg:border-t lg:bg-transparent lg:px-0 lg:py-4">
          <button
            type="button"
            onClick={onBack}
            className={`group inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-ink ${
              currentQuestionIndex === 0 ? "invisible" : ""
            }`}
          >
            <ChevronLeft
              aria-hidden="true"
              className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
              strokeWidth={1.75}
            />
            Back
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={!canAdvance}
            className={`group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-[background-color,transform] duration-150 active:translate-y-px ${
              canAdvance
                ? "bg-accent text-white hover:bg-accent-deep"
                : "cursor-not-allowed bg-blue-100 text-ink-muted"
            }`}
          >
            {isLastQuestion ? "See results" : "Next"}
            <ArrowRight
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${
                canAdvance ? "group-hover:translate-x-0.5" : ""
              }`}
              strokeWidth={1.75}
            />
          </button>
        </div>
      </div>
    </main>
  );
}

