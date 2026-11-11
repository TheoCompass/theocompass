"use client";

import { ArrowRight, Check, ChevronLeft, Info, Minus, X } from "lucide-react";
import type { Question, Answer, UserResponse } from "../_types";
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
  displayAnswers: Answer[];
  selectedAnswer: string | null;
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
  onStandardAnswerClick: (answerId: string) => void;
  onToggleInfo: (e: React.MouseEvent, answerId: string) => void;
  onSilenceClick: (type: "apathetic" | "hostile") => void;
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
  displayAnswers,
  selectedAnswer,
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
  onStandardAnswerClick,
  onToggleInfo,
  onSilenceClick,
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
  const canAdvance = Boolean(selectedAnswer) || isSilenceSelected;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const showConviction = Boolean(selectedAnswer) && !isSilenceSelected;

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
        <span className="meta num">{answeredCount} answered</span>
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
                select
              </span>
              <span>
                <kbd className="border border-rule-strong bg-paper-raised px-1 font-mono text-3xs">Enter</kbd>{" "}
                confirm
              </span>
              <span>
                <kbd className="border border-rule-strong bg-paper-raised px-1 font-mono text-3xs">S</kbd>{" "}
                apathetic
              </span>
              <span>
                <kbd className="border border-rule-strong bg-paper-raised px-1 font-mono text-3xs">H</kbd>{" "}
                hostile
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

            <div
              className={`mt-6 flex flex-col gap-2 transition-opacity duration-200 ${
                isSilenceSelected ? "opacity-40" : ""
              }`}
            >
              {displayAnswers.map((ans) => {
                const isSelected = selectedAnswer === ans.id;
                const isInfoOpen = expandedInfo === ans.id;

                return (
                  <div key={ans.id}>
                    <div className="flex items-stretch gap-2">
                      <button
                        type="button"
                        onClick={() => onStandardAnswerClick(ans.id)}
                        aria-pressed={isSelected}
                        className={`group relative flex min-w-0 flex-1 items-center gap-2.5 border py-2.5 pl-2.5 pr-3 text-left transition-colors sm:py-3 ${
                          isSelected
                            ? "border-cerulean-600 bg-cerulean-50 ring-1 ring-cerulean-600"
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
                        {/* Radio affordance — the row must look clickable. */}
                        <span
                          aria-hidden="true"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            isSelected
                              ? "border-cerulean-600 bg-cerulean-600"
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
            </div>


            {/* ── Silence ───────────────────────────────────────────── */}
            <div className="mt-7 border-t border-rule pt-4">
              <div className="meta">Or declare the question out of scope</div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {/* Same radio affordance as the answers above: these are two
                    more choices, not an aside. The glyph inside the radio says
                    which kind of silence it is - dash = irrelevant, X = reject. */}
                <button
                  type="button"
                  onClick={() => onSilenceClick("apathetic")}
                  aria-pressed={silenceType === "apathetic"}
                  className={`flex items-center gap-2.5 border py-2.5 pl-2.5 pr-3 text-left transition-colors ${
                    silenceType === "apathetic"
                      ? "border-cerulean-600 bg-cerulean-50 ring-1 ring-cerulean-600"
                      : "border-rule bg-paper-raised hover:border-cerulean-400 hover:bg-cerulean-50/60"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      silenceType === "apathetic"
                        ? "border-cerulean-600 bg-cerulean-600"
                        : "border-rule-strong"
                    }`}
                  >
                    <Minus
                      className={`h-3 w-3 ${silenceType === "apathetic" ? "text-white" : "text-ink-muted"}`}
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

