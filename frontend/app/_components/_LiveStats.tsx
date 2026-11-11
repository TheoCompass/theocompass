"use client";

import { useEffect, useState } from "react";
import { fetchQuizStats, type QuizStats } from "../../lib/api";
import { formatDay } from "../../lib/roadmap";

/** Below this the numbers are too small to mean anything, and they read as sad. */
const MIN_QUIZZES = 10;

/**
 * How many quizzes have been completed, once there are enough to be worth
 * showing.
 *
 * Two things this deliberately is not: it is not a live ticker (one fetch per
 * page view, no polling), and it is not a leaderboard (no per-person data
 * exists to rank). It renders nothing at all until MIN_QUIZZES runs are on
 * record or if the request fails, so the landing page never waits on the API
 * and never shows a "0 quizzes taken" badge.
 */
export function LiveStats() {
  const [stats, setStats] = useState<QuizStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchQuizStats()
      .then((next) => {
        if (!cancelled) setStats(next);
      })
      .catch(() => {
        /* the strip simply does not appear */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats || stats.totalQuizzes < MIN_QUIZZES) return null;

  const since = formatDay(stats.trackingSince);
  const topFamily = stats.topFamilies[0]?.name;

  return (
    <div className="mt-4 border-t border-rule pt-4">
      <p className="meta">Collective results</p>
      <p className="mt-1 text-2xs leading-relaxed text-ink-soft">
        <span className="num font-mono font-semibold text-ink">
          {stats.totalQuizzes.toLocaleString("en-GB")}
        </span>{" "}
        quizzes completed{since ? ` since ${since}` : ""}
        {topFamily && (
          <>
            {" "}
            &middot; most common family{" "}
            <span className="font-semibold text-ink">{topFamily}</span>
          </>
        )}
        {stats.avgTopMatch !== null && (
          <>
            {" "}
            &middot; average top match{" "}
            <span className="num font-mono font-semibold text-ink">
              {stats.avgTopMatch}%
            </span>
          </>
        )}
      </p>
    </div>
  );
}
