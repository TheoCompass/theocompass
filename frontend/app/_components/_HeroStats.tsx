"use client";

import { useEffect, useState } from "react";
import type { QuizStats } from "../../lib/api";
import {
  collectiveFigures,
  loadQuizStats,
  MIN_QUIZZES,
  openCollectiveResults,
} from "../../lib/quiz-stats";

/**
 * The collective results, in one line between the intro and the two buttons.
 *
 * The panel further down the page is thorough and quietly placed: a reader who
 * never scrolls reads the pitch and leaves without ever learning that other
 * people have already taken the quiz. This strip is the same payload stated once,
 * where the decision to take the quiz is actually made -- three figures and a
 * link to the counting behind them.
 *
 * It quotes `collectiveFigures()`, which is where the gates live, so the strip
 * cannot show a number the panel is still withholding: no median before
 * BREAKDOWN_RUNS, no star average before MIN_FEEDBACK ratings. The denominators
 * ("since ...", "over ... scored runs") stay in the panel's summary row -- here
 * the labels are shortened to keep the line intact, and the link is the promise
 * that the arithmetic is one click down.
 *
 * Nothing is rendered below MIN_QUIZZES or when the request fails, but the slot
 * keeps its height either way: the buttons below must not be pushed down by a
 * fetch that lands after the reader has started aiming at them.
 */
export function HeroStats() {
  const [stats, setStats] = useState<QuizStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadQuizStats()
      .then((next) => {
        if (!cancelled) setStats(next);
      })
      .catch(() => {
        // The panel below already handles a failure by staying closed. A silent
        // strip says the same thing without a second error message on a hero.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const figures = stats && stats.totalQuizzes >= MIN_QUIZZES ? collectiveFigures(stats) : [];

  return (
    <div className="mt-4 flex min-h-9 w-full items-center justify-center sm:min-h-5">
      {figures.length > 0 && (
        <a
          href="#collective-results"
          onClick={openCollectiveResults}
          className="group flex animate-fade-in-up flex-wrap items-baseline justify-center gap-x-2 gap-y-1"
          style={{ animationFillMode: "both" }}
        >
          {figures.map((figure, index) => (
            <span key={figure.key} className="inline-flex items-baseline gap-1.5">
              {index > 0 && (
                <span aria-hidden="true" className="mr-0.5 text-cerulean-300/60">
                  ·
                </span>
              )}
              <span className="num font-mono text-xs font-semibold text-paper">
                {figure.value}
              </span>
              <span className="text-2xs text-cerulean-100">{figure.short}</span>
            </span>
          ))}
          <span className="sr-only text-2xs text-cerulean-200 underline decoration-cerulean-300/40 underline-offset-4 transition-colors group-hover:text-paper group-hover:decoration-cerulean-300 sm:not-sr-only">
            See how that&rsquo;s counted
          </span>
        </a>
      )}
    </div>
  );
}
