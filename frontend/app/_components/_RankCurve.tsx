"use client";

import { formatCount, type RankCurvePoint, type RankCurveView } from "../../lib/quiz-stats";

/**
 * One level of the match answer as a cumulative curve.
 *
 * The pickers on the feedback card now span the whole taxonomy -- every family,
 * and every church in the chosen one -- so the old four bars (`#1`, `#2-#3`,
 * `#4-#8`, `none / #9+`) described almost nothing: with thirty families and 230
 * denominations, "beyond #8" was where nearly every reader landed. A cumulative
 * curve answers the question the bars were trying to: *where does the list stop
 * describing people?* The x-axis is the place, the y-axis is the share of
 * answers at or above it, so a steep rise at the left and a long flat crawl to
 * the right says "the top few places are most readers, and the tail is real but
 * thin" in one glance.
 *
 * Three marks, each earning its ink:
 *
 *   median    the rule at 50%, labelled `#n` -- the one number a reader can
 *             repeat. It is the smallest place whose cumulative share reaches
 *             half, so it is always a place somebody picked.
 *   tail      the deepest round place before the deepest pick (`#50` on an axis
 *             that ends at `#140`), shaded and labelled `% past #n`: the share
 *             of readers the list only described far down. Round because a
 *             reader can hold "#50"; below the axis end, so the band is never
 *             empty and never claims a place past the data.
 *   none      the escape hatch has no place on the axis and still belongs in the
 *             denominator, so it travels in the caption rather than as a fake
 *             `#0` at the left edge.
 *
 * Hand-drawn SVG, like `_ScoreArc` on the results page, and for the same reason:
 * this lands in the landing page's bundle, and two small curves are not worth a
 * chart library. No animation either -- the curve *is* the data, and a reveal
 * would only delay the one thing the figure says. Geometry is in `viewBox`
 * units, so the type scales with the tile instead of clipping at 375px.
 */

/** Plot box in viewBox units. The left gutter holds the percentage labels. */
const W = 320;
const H = 112;
const X0 = 26;
const X1 = 312;
const Y0 = 16;
const Y1 = 92;

/** The round places the annotation may land on: 1, 2, 5, 10, 20, 50, 100… */
function roundPlaceDown(place: number): number {
  if (place <= 1) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(place)));
  let best = 0;
  for (const step of [1, 2, 5]) {
    const candidate = step * magnitude;
    if (candidate < place) best = candidate;
  }
  return best;
}

/** Share of the ranked answers whose place is strictly past `rank`. */
function sharePast(points: RankCurvePoint[], rank: number): number {
  let atOrBefore = 0;
  for (const point of points) {
    if (point.rank > rank) break;
    atOrBefore = point.share;
  }
  return Math.max(0, 1 - atOrBefore);
}

/** The same `<1%` floor the panel's `share()` applies, so no figure reads "0%". */
function percent(value: number): string {
  const pct = value * 100;
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

function place(rank: number | null): string {
  return rank === null ? "—" : `#${rank}`;
}

export function RankCurve({
  title,
  noneLabel,
  view,
  className = "",
}: {
  title: string;
  /** What the escape hatch says at this level: "none of these families" / "not in this list". */
  noneLabel: string;
  view: RankCurveView;
  className?: string;
}) {
  const { points, median, p25, p75, p90, none, judged, maxRank } = view;

  // Every answer was the escape hatch: a real result, and there is no curve.
  if (points.length === 0) {
    return (
      <div className={className}>
        <p className="text-2xs text-ink-muted">
          {title}, from <span className="num font-mono">{formatCount(judged)}</span> answer
          {judged === 1 ? "" : "s"}
        </p>
        <p className="mt-2 text-2xs leading-relaxed text-ink-soft">
          Every one of them said &ldquo;{noneLabel}&rdquo;, so there is no place to plot.
        </p>
      </div>
    );
  }

  const span = Math.max(1, maxRank - 1);
  const xOf = (rank: number) => X0 + ((Math.min(Math.max(rank, 1), maxRank) - 1) / span) * (X1 - X0);
  const yOf = (share: number) => Y1 - Math.min(1, Math.max(0, share)) * (Y1 - Y0);

  // Step curve: flat to the next place, then up. "At or above this place" is a
  // step function, and a straight line between points would put the median where
  // nobody sits.
  let line = `M ${X0} ${yOf(0)}`;
  let previous = 0;
  for (const point of points) {
    const x = xOf(point.rank);
    line += ` L ${x} ${yOf(previous)} L ${x} ${yOf(point.share)}`;
    previous = point.share;
  }
  line += ` L ${X1} ${yOf(previous)}`;
  const area = `${line} L ${X1} ${yOf(0)} L ${X0} ${yOf(0)} Z`;

  const tailRank = roundPlaceDown(maxRank);
  const tailShare = tailRank > 0 ? sharePast(points, tailRank) : 0;
  const showTail = tailRank > 0 && tailShare > 0;
  const tailX = showTail ? xOf(tailRank) : X1;

  const medianX = median === null ? null : xOf(median);
  const medianRight = medianX !== null && medianX > X1 - (X1 - X0) * 0.35;
  const halfClause = p25 !== null && p75 !== null;

  const label = [
    `${title}, from ${formatCount(judged)} answers.`,
    median === null ? null : `The median reader's place was ${place(median)}.`,
    halfClause ? `Half sat between ${place(p25)} and ${place(p75)}.` : null,
    p90 === null ? null : `The deepest tenth started at ${place(p90)}.`,
    showTail ? `${percent(tailShare)} were past ${place(tailRank)}.` : null,
    none > 0 ? `${formatCount(none)} said "${noneLabel}".` : null,
    `The deepest place anyone picked was ${place(maxRank)}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <p className="text-2xs text-ink-muted">
        {title}, from <span className="num font-mono">{formatCount(judged)}</span> answer
        {judged === 1 ? "" : "s"}
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="mt-1.5 h-auto w-full">
        {showTail && (
          <rect
            x={tailX}
            y={Y0}
            width={Math.max(0, X1 - tailX)}
            height={Y1 - Y0}
            fill="var(--color-cerulean-50)"
          />
        )}
        {[0, 0.5, 1].map((share) => (
          <line
            key={share}
            x1={X0}
            x2={X1}
            y1={yOf(share)}
            y2={yOf(share)}
            stroke="var(--color-rule)"
            strokeWidth={share === 0 ? 1 : 0.6}
          />
        ))}
        {[
          { share: 1, text: "100%" },
          { share: 0.5, text: "50%" },
        ].map((tick) => (
          <text
            key={tick.text}
            x={X0 - 3}
            y={yOf(tick.share) + 2.5}
            textAnchor="end"
            fontSize="6.5"
            fill="var(--color-ink-muted)"
          >
            {tick.text}
          </text>
        ))}

        <path d={area} fill="var(--color-cerulean-100)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-cerulean-600)"
          strokeWidth={1.4}
          strokeLinejoin="round"
        />

        {showTail && (
          <line
            x1={tailX}
            x2={tailX}
            y1={Y0}
            y2={Y1}
            stroke="var(--color-cerulean-400)"
            strokeWidth={0.8}
            strokeDasharray="2 2"
          />
        )}

        {medianX !== null && (
          <>
            <line
              x1={medianX}
              x2={medianX}
              y1={yOf(0.5)}
              y2={Y1}
              stroke="var(--color-cerulean-900)"
              strokeWidth={0.9}
            />
            <circle
              cx={medianX}
              cy={yOf(0.5)}
              r={2}
              fill="var(--color-paper-raised)"
              stroke="var(--color-cerulean-900)"
              strokeWidth={1.1}
            />
            <text
              x={medianRight ? medianX - 3 : medianX + 3}
              y={yOf(0.5) - 4}
              textAnchor={medianRight ? "end" : "start"}
              fontSize="8"
              fontWeight="600"
              fill="var(--color-cerulean-900)"
            >
              {place(median)}
            </text>
          </>
        )}

        {showTail && (
          <text
            x={tailX > X1 - 46 ? tailX - 3 : tailX + 3}
            y={yOf(0) - 3}
            textAnchor={tailX > X1 - 46 ? "end" : "start"}
            fontSize="6.5"
            fill="var(--color-ink-muted)"
          >
            {percent(tailShare)} past {place(tailRank)}
          </text>
        )}

        <text x={X0} y={H - 4} textAnchor="start" fontSize="6.5" fill="var(--color-ink-muted)">
          {place(points[0].rank)}
        </text>
        <text x={X1} y={H - 4} textAnchor="end" fontSize="6.5" fill="var(--color-ink-muted)">
          {place(maxRank)}
        </text>
      </svg>

      <p className="mt-1 text-3xs leading-relaxed text-ink-muted">
        {median !== null && (
          <>
            Median <span className="num font-mono text-ink-soft">{place(median)}</span>
            {halfClause ? " · " : ""}
          </>
        )}
        {halfClause && (
          <>
            half between {place(p25)} and {place(p75)}
          </>
        )}
        {showTail && (
          <>
            {(median !== null || halfClause) && " · "}
            {percent(tailShare)} past {place(tailRank)}
          </>
        )}
        {none > 0 && (
          <>
            {" · "}
            <span className="num font-mono">{formatCount(none)}</span> said &ldquo;{noneLabel}&rdquo;
          </>
        )}
      </p>
    </div>
  );
}
