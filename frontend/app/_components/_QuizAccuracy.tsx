"use client";

import { useEffect, useState } from "react";
import type { QuizStats } from "../../lib/api";
import {
  loadQuizStats,
  MIN_QUIZZES,
  openCollectiveResults,
  topOneMatch,
  type TopOneMatch,
} from "../../lib/quiz-stats";

/**
 * The fifth row of the quiz card: how often the #1 match was the right one.
 *
 * "Exactly right" is the whole point of the wording. The card asks four answers
 * -- that's about where I am / close, but not quite / not close / I'm exploring
 * -- and this figure counts only the first. A reader who said "close" put the
 * top match in the right family and the wrong church, which is not a hit; the
 * old yes/no had nowhere to record that and published it as one, which is how
 * the figure overestimated itself. The near-miss band is printed in the panel
 * this row links to ("another 31% said close", beside the four-answer
 * breakdown) rather than here, because this row has to stay on one line at
 * 375px.
 *
 * The denominator is the readers who compared the match with their own church
 * (`fit + close + off`). `exploring` said there was nothing to compare, and a
 * pre-0008 row answered a boolean that cannot be split into fit and close; both
 * are outside the percentage on purpose and both stay in the table behind it.
 *
 * Written as a `<dl>` row so it belongs to the card's list of facts instead of
 * sitting beside it, and silent until `MIN_JUDGED` answers exist -- a percentage
 * from four ratings is a claim, not a statistic.
 *
 * The denominator is printed inline rather than hidden in a tooltip: "50%" on
 * its own would be the one sentence this site keeps refusing to write. The
 * figure links to the panel below, where the same answers are broken out by
 * stance and by rank, so a reader can check it instead of trusting it. Because
 * of that link the row also waits for `MIN_QUIZZES` runs: below it the panel does
 * not exist, and a figure pointing at nothing is worse than no figure.
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

  const topOne: TopOneMatch | null = topOneMatch(stats.feedback);
  if (!topOne) return null;

  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-ink-muted">Top 1 match exactly right</dt>
      <dd className="num font-mono font-semibold text-ink">
        <a
          href="#collective-results"
          onClick={openCollectiveResults}
          className="underline decoration-rule decoration-1 underline-offset-2 transition-colors hover:text-cerulean-800"
          aria-label={`${topOne.percent}% of ${topOne.judged} readers who compared the match with their own church said the first match is exactly where they are. See the collective results.`}
        >
          {topOne.percent}%
        </a>
        <span className="ml-1.5 font-sans text-2xs font-normal text-ink-muted">
          of {topOne.judged} who compared
        </span>
      </dd>
    </div>
  );
}
