"use client";

import { useEffect, useState } from "react";
import type { QuizStats } from "../../lib/api";
import {
  loadQuizStats,
  MIN_QUIZZES,
  quizAccuracy,
  type QuizAccuracy as Accuracy,
} from "../../lib/quiz-stats";

/**
 * The fifth row of the quiz card: how often readers said the top match
 * described them.
 *
 * Written as a `<dl>` row so it belongs to the card's list of facts instead of
 * sitting beside it, and silent until `MIN_JUDGED` answers exist -- a percentage
 * from four ratings is a claim, not a statistic.
 *
 * The denominator is printed inline rather than hidden in a tooltip: "82%" on
 * its own would be the one sentence this site keeps refusing to write. The
 * figure links to the panel below, where the same answers are broken out, so a
 * reader can check it instead of trusting it. Because of that link the row also
 * waits for `MIN_QUIZZES` runs: below it the panel does not exist, and a figure
 * pointing at nothing is worse than no figure.
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

  const accuracy: Accuracy | null = quizAccuracy(stats.feedback);
  if (!accuracy) return null;

  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-ink-muted">Match accuracy</dt>
      <dd className="num font-mono font-semibold text-ink">
        <a
          href="#collective-results"
          className="underline decoration-rule decoration-1 underline-offset-2 transition-colors hover:text-cerulean-800"
          aria-label={`${accuracy.percent}% of ${accuracy.judged} answers said the top match described them. See the collective results.`}
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
