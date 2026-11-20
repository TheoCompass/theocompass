"use client";

import { useEffect, useState } from "react";
import type { QuizStats } from "../../lib/api";
import {
  loadQuizStats,
  MIN_QUIZZES,
  topOneAccuracy,
  type QuizAccuracy as Accuracy,
} from "../../lib/quiz-stats";

/**
 * The fifth row of the quiz card: how often the #1 match was the right one.
 *
 * Written as a `<dl>` row so it belongs to the card's list of facts instead of
 * sitting beside it, and silent until `MIN_JUDGED` answers exist -- a percentage
 * from four ratings is a claim, not a statistic.
 *
 * The label says "#1" out loud. The question behind the number is the stance the
 * card asks directly since 0008 -- how close the top match is to where the reader
 * actually is -- and readers who said "exploring" (no church to compare against)
 * are left out of the denominator rather than counted as a miss. The visible
 * wording is unchanged on purpose: the figure still means "the first match was
 * the right one", and it now says so about readers who could judge it.
 *
 * The denominator is printed inline rather than hidden in a tooltip: "82%" on
 * its own would be the one sentence this site keeps refusing to write. The
 * figure links to the panel below, where the same answers are broken out by
 * rank, so a reader can check it instead of trusting it. Because of that link
 * the row also waits for `MIN_QUIZZES` runs: below it the panel does not exist,
 * and a figure pointing at nothing is worse than no figure.
 *
 * The fetch is shared with that panel through `loadQuizStats()`, so this row
 * does not add a request to the page view.
 */
export function QuizAccuracy() {
  const [stats, setStats] = useState<QuizStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadQuizStats()
      .then((next) => {
        if (!cancelled) setStats(next);
      })
      .catch(() => {
        /* the row simply does not appear */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats || stats.totalQuizzes < MIN_QUIZZES) return null;

  const accuracy: Accuracy | null = topOneAccuracy(stats.feedback);
  if (!accuracy) return null;

  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-ink-muted">Top 1 match accuracy</dt>
      <dd className="num font-mono font-semibold text-ink">
        <a
          href="#collective-results"
          className="underline decoration-rule decoration-1 underline-offset-2 transition-colors hover:text-cerulean-800"
          aria-label={`The first match was the best one for ${accuracy.percent}% of ${accuracy.judged} readers with a church to compare. See the collective results.`}
        >
          {accuracy.percent}%
        </a>
        <span className="ml-1.5 font-sans text-2xs font-normal text-ink-muted">
          of {accuracy.judged} answers
        </span>
      </dd>
    </div>
  );
}
