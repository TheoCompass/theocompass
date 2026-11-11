"use client";

import { useEffect, useState } from "react";
import { fetchQuizStats, type QuizStats } from "../../lib/api";
import { FALLBACK_GROUP_BASE, TIER_STEPS } from "../../lib/palette";
import { formatDay } from "../../lib/roadmap";
import { FAMILY_COLORS } from "../../lib/taxonomy";

/** Below this the numbers are too small to mean anything, and they read as sad. */
const MIN_QUIZZES = 10;

/** Family shares, the score distribution and posture averages need a sample. */
const BREAKDOWN_RUNS = 50;

/** Until this many runs, the panel says so rather than implying a trend. */
const EARLY_RUNS = 200;

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function share(part: number, total: number): string {
  if (total <= 0) return "—";
  const pct = (part / total) * 100;
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

function shortDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Aggregate results from completed quizzes. One anonymous fetch per page view,
 * no polling, no per-person data, and nothing at all until MIN_QUIZZES runs are
 * on record or if the request fails.
 *
 * Every figure carries its own denominator. That is the point of the panel: a
 * percentage without "of how many runs" is a claim, not a statistic.
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
        /* the panel simply does not appear */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats) return null;
  return <LiveStatsPanel stats={stats} />;
}

/**
 * Presentational half, exported so the 10–49, 50–199 and 200+ states can be
 * rendered without a live database (and so the fetch wrapper stays trivial).
 */
export function LiveStatsPanel({ stats }: { stats: QuizStats }) {
  if (stats.totalQuizzes < MIN_QUIZZES) return null;

  const total = stats.totalQuizzes;
  const daily = stats.daily ?? [];
  const histogram = stats.scoreHistogram ?? [];
  const detailed = total >= BREAKDOWN_RUNS;
  const early = total < EARLY_RUNS;

  return (
    <div className="reveal-static mx-auto mt-10 max-w-3xl">
      <section
        aria-labelledby="collective-results"
        className="border border-rule bg-paper-raised p-5 md:p-7"
      >
        <header>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="meta text-cerulean-800">Collective results</p>
              <h3
                id="collective-results"
                className="mt-1 font-serif text-xl font-bold text-ink md:text-2xl"
              >
                What everyone&rsquo;s answers add up to
              </h3>
            </div>
            {early && (
              <span
                className="inline-flex items-center gap-1.5 border border-rule-strong bg-paper px-2 py-1 text-3xs font-semibold uppercase tracking-[0.14em] text-ink-muted"
                title={`Detailed breakdowns unlock at ${BREAKDOWN_RUNS} runs; this label clears at ${EARLY_RUNS}.`}
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cerulean-600" />
                Early data
              </span>
            )}
          </div>
          <p className="mt-2 text-2xs leading-relaxed text-ink-soft">
            Anonymous &middot; updated every few minutes. Every figure is an aggregate from completed
            runs; nothing is tied to a person.
          </p>
        </header>

        <div className={`mt-6 grid gap-5 ${detailed ? "md:grid-cols-2" : ""}`}>
          <VolumeTile stats={stats} daily={daily} />
          {detailed ? (
            <>
              <ClosenessTile stats={stats} histogram={histogram} />
              <FamiliesTile stats={stats} />
              <PostureTile stats={stats} />
            </>
          ) : (
            <UnlockPanel total={total} />
          )}
        </div>

        <MethodDetails stats={stats} />
      </section>
    </div>
  );
}

function VolumeTile({
  stats,
  daily,
}: {
  stats: QuizStats;
  daily: Array<{ date: string; count: number }>;
}) {
  const since = formatDay(stats.trackingSince);
  const max = Math.max(1, ...daily.map((day) => day.count));
  const first = daily[0];
  const last = daily[daily.length - 1];

  return (
    <article className="flex h-full flex-col border border-rule bg-paper p-4 md:p-5">
      <h4 className="meta">Runs recorded</h4>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="num font-mono text-3xl font-semibold leading-none text-ink">
          {formatCount(stats.totalQuizzes)}
        </span>
        {since && <span className="text-2xs text-ink-muted">since {since}</span>}
      </p>

      {daily.length > 0 && (
        <figure className="mt-4">
          <figcaption className="sr-only">
            Runs recorded on each of the last {daily.length} UTC calendar days.
          </figcaption>
          <div
            role="img"
            aria-label={`Runs per day over the last ${daily.length} UTC days: ${daily
              .map((day) => `${shortDay(day.date)} ${day.count}`)
              .join(", ")}`}
            className="flex h-16 items-end gap-1"
          >
            {daily.map((day, index) => {
              const isToday = index === daily.length - 1;
              const height =
                day.count === 0 ? "2px" : `${Math.max(6, Math.round((day.count / max) * 100))}%`;
              const color =
                day.count === 0 ? "bg-rule-strong" : isToday ? "bg-cerulean-900" : "bg-cerulean-500";
              return (
                <div
                  key={day.date}
                  className="flex h-full flex-1 items-end"
                  title={`${shortDay(day.date)}: ${formatCount(day.count)} run${day.count === 1 ? "" : "s"}`}
                >
                  <div
                    aria-hidden="true"
                    className={`w-full rounded-t-[1px] ${color}`}
                    style={{ height }}
                  />
                </div>
              );
            })}
          </div>
          {first && last && (
            <div className="mt-1 flex justify-between text-3xs text-ink-muted">
              <span>{shortDay(first.date)}</span>
              <span>{shortDay(last.date)}</span>
            </div>
          )}
        </figure>
      )}

      <p className="mt-auto pt-3 text-2xs leading-relaxed text-ink-soft">
        <span className="num font-mono font-semibold text-ink">
          {formatCount(stats.last7Days)}
        </span>{" "}
        in the last 7 days &middot;{" "}
        <span className="num font-mono font-semibold text-ink">{formatCount(stats.today)}</span>{" "}
        today
      </p>
    </article>
  );
}

function FamiliesTile({ stats }: { stats: QuizStats }) {
  const families = stats.topFamilies ?? [];
  const hasSample = typeof stats.familySample === "number" && stats.familySample > 0;
  const sample = stats.familySample ?? 0;
  const topTotal = families.reduce((sum, family) => sum + family.count, 0);
  const other = hasSample ? Math.max(0, sample - topTotal) : 0;

  const rows = [
    ...families.map((family) => ({
      name: family.name,
      count: family.count,
      color: FAMILY_COLORS[family.name] ?? FALLBACK_GROUP_BASE,
    })),
    ...(other > 0
      ? [{ name: "Other families", count: other, color: FALLBACK_GROUP_BASE }]
      : []),
  ];
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <article className="flex h-full flex-col border border-rule bg-paper p-4 md:p-5">
      <h4 className="meta">Where results land</h4>
      <p className="mt-1 text-2xs text-ink-muted">Share by tradition family</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-2xs text-ink-soft">Family shares are updating.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <li key={row.name}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-2xs font-medium text-ink" title={row.name}>
                  {row.name}
                </span>
                <span className="num shrink-0 font-mono text-2xs font-semibold text-ink">
                  {hasSample ? share(row.count, sample) : "—"}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-cerulean-100">
                  <div
                    aria-hidden="true"
                    className="h-full rounded-full animate-bar-grow"
                    style={{
                      // Encode share of the sample, not share of the leader: the
                      // number beside the bar says 31%, so the bar must too.
                      width: `${
                        hasSample
                          ? Math.max(1, Math.round((row.count / sample) * 1000) / 10)
                          : Math.round((row.count / max) * 100)
                      }%`,
                      backgroundColor: row.color,
                    }}
                  />
                </div>
                <span className="num w-10 shrink-0 text-right font-mono text-3xs text-ink-muted">
                  {formatCount(row.count)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-auto pt-3 text-3xs leading-relaxed text-ink-muted">
        {hasSample ? (
          <>
            Share of {formatCount(sample)} runs with a family
            {typeof stats.distinctFamilies === "number"
              ? ` · ${formatCount(stats.distinctFamilies)} families`
              : ""}
          </>
        ) : (
          "Share data is updating."
        )}
      </p>
    </article>
  );
}

type TierCount = { label: string; range: string; hex: string; count: number };

/** Fold the 20 five-point histogram buckets into the five tiers the results page uses. */
function tierCountsFrom(histogram: number[]): TierCount[] {
  const counts = TIER_STEPS.map(() => 0);
  histogram.forEach((count, bucket) => {
    const lowerBound = bucket * 5;
    const index = TIER_STEPS.findIndex((step) => lowerBound >= step.min);
    if (index >= 0) counts[index] += count;
  });
  return TIER_STEPS.map((step, index) => ({
    label: step.label,
    range: step.range,
    hex: step.hex,
    count: counts[index],
  }));
}

function ClosenessTile({ stats, histogram }: { stats: QuizStats; histogram: number[] }) {
  const median = typeof stats.medianTopMatch === "number" ? stats.medianTopMatch : null;
  const mean = typeof stats.avgTopMatch === "number" ? stats.avgTopMatch : null;
  const headline = median ?? mean;
  const sample = stats.scoreSample ?? 0;
  const hasDistribution =
    sample > 0 && histogram.length === 20 && histogram.some((count) => count > 0);
  const tierCounts = hasDistribution ? tierCountsFrom(histogram) : [];
  const topMatch = stats.topMatches?.[0];
  const matchSample = stats.matchSample ?? 0;

  return (
    <article className="flex h-full flex-col border border-rule bg-paper p-4 md:p-5">
      <h4 className="meta">How close</h4>

      {headline === null ? (
        <p className="mt-4 text-2xs text-ink-soft">Closest-match scores are updating.</p>
      ) : (
        <>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="num font-mono text-3xl font-semibold leading-none text-ink">
              {formatScore(headline)}
              <span className="text-lg font-normal text-ink-muted">%</span>
            </span>
            <span className="text-2xs text-ink-soft">
              {median !== null ? "median closest match" : "average closest match"}
            </span>
          </p>
          {median !== null && mean !== null && (
            <p className="mt-1 text-2xs text-ink-muted">
              Mean <span className="num font-mono text-ink-soft">{formatScore(mean)}%</span>
              {sample > 0 ? ` over ${formatCount(sample)} scored runs` : ""}
            </p>
          )}
        </>
      )}

      {hasDistribution ? (
        <>
          <div
            role="img"
            aria-label={`Closest-match tiers: ${tierCounts
              .map((tier) => `${tier.label} ${share(tier.count, sample)}`)
              .join(", ")}`}
            className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-cerulean-100 animate-bar-grow"
          >
            {tierCounts.map((tier) =>
              tier.count > 0 ? (
                <span
                  key={tier.label}
                  style={{
                    width: `${(tier.count / sample) * 100}%`,
                    backgroundColor: tier.hex,
                  }}
                />
              ) : null
            )}
          </div>
          <ul className="mt-3 space-y-1">
            {tierCounts.map((tier) => (
              <li key={tier.label} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tier.hex }}
                />
                <span className="min-w-0 flex-1 truncate text-2xs text-ink-soft">
                  {tier.label} <span className="text-ink-muted">{tier.range}</span>
                </span>
                <span className="num w-9 text-right font-mono text-2xs font-semibold text-ink">
                  {share(tier.count, sample)}
                </span>
                <span className="num w-10 text-right font-mono text-3xs text-ink-muted">
                  {formatCount(tier.count)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : sample === 0 ? (
        <p className="mt-3 text-2xs text-ink-muted">Score distribution is updating.</p>
      ) : null}

      {topMatch && (
        <p className="mt-auto border-t border-rule pt-2 text-2xs leading-relaxed text-ink-soft">
          Most often closest to <span className="font-semibold text-ink">{topMatch.name}</span>
          {matchSample > 0 && (
            <span className="whitespace-nowrap text-ink-muted">
              {" "}
              &middot; {share(topMatch.count, matchSample)} of {formatCount(matchSample)} named matches
            </span>
          )}
        </p>
      )}
    </article>
  );
}

function Gauge({
  label,
  value,
  left,
  right,
}: {
  label: string;
  value: number | null;
  left: string;
  right: string;
}) {
  const clamped = value === null ? null : Math.min(100, Math.max(0, value));
  // Keep the marker inside the track at 0 and 100; its radius would otherwise
  // hang over the rounded end.
  const marker = clamped === null ? 50 : Math.min(98, Math.max(2, clamped));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="meta">{label}</p>
        <p className="num font-mono text-lg font-semibold text-ink">
          {clamped === null ? "—" : Math.round(clamped)}
          <span className="text-2xs font-normal text-ink-muted">/100</span>
        </p>
      </div>
      <div
        className="relative mt-2 h-1.5 rounded-full bg-cerulean-100"
        role="img"
        aria-label={
          clamped === null
            ? `${label} is updating.`
            : `${label}: ${Math.round(clamped)} of 100. 0 is ${left}, 100 is ${right}.`
        }
      >
        {clamped !== null && (
          <span
            aria-hidden="true"
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-paper-raised bg-cerulean-900"
            style={{ left: `${marker}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-3xs text-ink-muted">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

function PostureTile({ stats }: { stats: QuizStats }) {
  const posture = stats.posture;
  const tolerance = typeof posture?.tolerance === "number" ? posture.tolerance : null;
  const certainty = typeof posture?.certainty === "number" ? posture.certainty : null;
  const sample = posture?.sample ?? 0;
  const hasAny = tolerance !== null || certainty !== null;

  return (
    <article className="flex h-full flex-col border border-rule bg-paper p-4 md:p-5">
      <h4 className="meta">How people answered</h4>
      <p className="mt-1 text-2xs text-ink-muted">Average posture across all answers</p>

      {hasAny ? (
        <div className="mt-3 space-y-4">
          <Gauge label="Tolerance" value={tolerance} left="Dogmatic" right="Accepting" />
          <Gauge label="Certainty" value={certainty} left="Unsure" right="Certain" />
        </div>
      ) : (
        <p className="mt-4 text-2xs text-ink-soft">Posture averages are updating.</p>
      )}

      <p className="mt-auto pt-3 text-3xs leading-relaxed text-ink-muted">
        {sample > 0
          ? `Averaged over ${formatCount(sample)} runs that answered both sliders.`
          : "Posture answers are still arriving."}
      </p>
    </article>
  );
}

function UnlockPanel({ total }: { total: number }) {
  const clamped = Math.min(total, BREAKDOWN_RUNS);
  const pct = Math.round((clamped / BREAKDOWN_RUNS) * 100);
  const remaining = Math.max(0, BREAKDOWN_RUNS - total);

  return (
    <div className="border border-rule bg-paper p-4 md:p-5">
      <p className="meta">More detail at {BREAKDOWN_RUNS} runs</p>
      <p className="mt-2 text-2xs leading-relaxed text-ink-soft">
        {remaining} more run{remaining === 1 ? "" : "s"} unlock family shares, the closest-match
        distribution and the two posture averages. We wait for a sample before describing one.
      </p>
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-cerulean-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={BREAKDOWN_RUNS}
        aria-valuenow={clamped}
        aria-label={`Runs until the detailed breakdown unlocks: ${clamped} of ${BREAKDOWN_RUNS}`}
      >
        <div
          className="h-full rounded-full bg-cerulean-600 animate-bar-grow"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-3xs text-ink-muted">
        <span className="num font-mono">{formatCount(total)}</span> of {BREAKDOWN_RUNS} runs
      </p>
    </div>
  );
}

function MethodDetails({ stats }: { stats: QuizStats }) {
  const counts: Array<{ label: string; value: number | undefined }> = [
    { label: "Completed runs", value: stats.totalQuizzes },
    { label: "With a score", value: stats.scoreSample },
    { label: "With a family", value: stats.familySample },
    { label: "With a named match", value: stats.matchSample },
    { label: "With both posture answers", value: stats.posture?.sample },
    { label: "Distinct families", value: stats.distinctFamilies },
  ];
  const available = counts.filter(
    (item): item is { label: string; value: number } => typeof item.value === "number"
  );

  return (
    <details className="mt-6 border-t border-rule pt-3">
      <summary className="cursor-pointer text-2xs font-semibold text-cerulean-900">
        How these numbers are counted
      </summary>
      <div className="mt-3 space-y-3 text-2xs leading-relaxed text-ink-soft">
        {available.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {available.map((item) => (
              <div
                key={item.label}
                className="flex items-baseline justify-between gap-2 border-b border-rule pb-1"
              >
                <dt className="min-w-0 text-ink-muted">{item.label}</dt>
                <dd className="num shrink-0 font-mono font-semibold text-ink">
                  {formatCount(item.value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <ul className="list-disc space-y-1.5 pl-4">
          <li>
            One row per completed quiz. A retry or a reloaded results page records once; the id is
            anonymous and cannot be traced back to a person.
          </li>
          <li>
            Days are UTC calendar days, so &ldquo;last 7 days&rdquo; means today plus the six before
            it, matching the last seven bars.
          </li>
          <li>
            &ldquo;Family&rdquo; is a tradition family (for example, Confessional Lutheranism), not a
            single denomination.
          </li>
          <li>
            Closeness tiers are the same five used on the results page: 90+, 75&ndash;89,
            60&ndash;74, 40&ndash;59 and 0&ndash;39.
          </li>
          <li>
            Tolerance and certainty average only runs that answered both sliders, so the two figures
            describe the same runs.
          </li>
          <li>
            Detailed breakdowns appear at {BREAKDOWN_RUNS} runs; the early-data label clears at{" "}
            {EARLY_RUNS}.
          </li>
          <li>No email, IP address, user agent or free text is stored with a run.</li>
        </ul>
      </div>
    </details>
  );
}
