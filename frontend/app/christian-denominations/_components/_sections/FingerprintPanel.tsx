"use client";

import { useMemo } from "react";
import {
  CoordsMap,
  axisPosition,
  formatSigned,
  getConvictionStyle,
  getGapStyle,
} from "../../_helpers";
import { AXIS_LABELS, FINGERPRINT_CATEGORIES } from "../../_constants";
import { ConvictionSwatch } from "../_ConvictionSwatch";

/** A single bipolar axis, drawn as a bar that diverges from the centre. */
function AxisRow({
  axis,
  userScore,
  compareScore,
  compareName,
  isZoomed,
  delay,
  onToggle,
}: {
  axis: string;
  userScore: number | undefined;
  compareScore?: number;
  compareName?: string;
  isZoomed: boolean;
  /** Stagger for the rail opening from neutral. Cap around 400ms. */
  delay: number;
  onToggle: () => void;
}) {
  const labels = AXIS_LABELS[axis];
  if (!labels || userScore === undefined || userScore === null) return null;

  const isInverted = labels.invert === true;
  // One mapping for the dot and the numeral. They used to disagree: the dot was
  // always drawn left-to-right, while the numeral printed the raw score, which
  // counts from the right on 13 of the 14 axes.
  const mine = axisPosition(userScore, isInverted);
  const userPct = mine.pct;
  const signed = mine.signed;
  const isLeft = userPct < 50;
  const poleLabel = isLeft ? labels.left : labels.right;
  const otherLabel = isLeft ? labels.right : labels.left;

  const hasCompare = compareScore !== undefined;
  const theirs = axisPosition(compareScore ?? 0, isInverted);
  const comparePct = hasCompare ? theirs.pct : 0;
  const compareSigned = theirs.signed;
  // Two gap numbers, deliberately. `gap` is the raw distance the colour bands
  // were tuned on; `gapUnits` is that same distance on the ±100 scale the row
  // quotes. Quoting `gap` next to ±100 numerals would describe a 200-unit rail
  // in 100-unit steps.
  const gap = hasCompare ? Math.round(Math.abs(userScore - (compareScore ?? 0))) : null;
  const gapStyle = gap === null ? null : getGapStyle(gap);
  const gapUnits = hasCompare ? Math.round(Math.abs(signed - compareSigned)) : null;

  const conviction = getConvictionStyle(userScore);
  // Bar grows from the centre (neutral) toward the tradition's pole.
  const barLeft = Math.min(userPct, 50);
  const barWidth = Math.abs(userPct - 50);
  // The stretch of rail between you and the comparison tradition. This is the
  // "how far apart" reading: it used to require tapping the row to reveal a
  // sentence, so a comparison looked like fourteen identical rails.
  const gapLeft = hasCompare ? Math.min(userPct, comparePct) : 0;
  const gapWidth = hasCompare ? Math.abs(userPct - comparePct) : 0;

  return (
    <div className="border-b border-rule last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isZoomed}
        aria-label={`${labels.left} versus ${labels.right}. You sit at ${signed}, toward ${poleLabel}.${
          hasCompare && gapStyle && compareName && gapUnits !== null
            ? ` ${compareName} sits at ${compareSigned}: ${gapStyle.label}, ${gapUnits} points apart.`
            : ""
        }`}
        className="block w-full py-2 text-left"
      >
        {/* Poles sit ABOVE the rail, full width. Squeezing them into 56px
            columns is what made the axis names unreadable on a phone. */}
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={`text-3xs uppercase leading-tight tracking-wide ${
              isLeft ? "font-semibold text-ink" : "text-ink-muted"
            }`}
          >
            {labels.left}
          </span>
          <span className="num shrink-0 font-mono text-2xs font-semibold text-ink">
            {formatSigned(signed)}
          </span>
          <span
            className={`text-right text-3xs uppercase leading-tight tracking-wide ${
              !isLeft ? "font-semibold text-ink" : "text-ink-muted"
            }`}
          >
            {labels.right}
          </span>
        </span>

        {/* A taller rail with a real marker. A 3px hairline told you the value
            but never where the dot was sitting. It opens outward from the
            centre line on mount: the markers arrive from neutral, which is
            exactly what the signed −100…0…+100 scale claims. */}
        <span
          className="relative mt-1 block h-6 animate-rail-open"
          style={{ animationDelay: `${delay}ms` }}
        >
          <span className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-cerulean-100" />
          <span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-cerulean-300" />
          {/* The gap itself, drawn behind both markers. */}
          {hasCompare && gapStyle && (
            <span
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-[left,width] duration-300 ease-out"
              style={{
                left: `${gapLeft}%`,
                width: `${gapWidth}%`,
                backgroundColor: gapStyle.hex,
                opacity: 0.45,
              }}
            />
          )}
          <span
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-[left,width] duration-300 ease-out"
            style={{
              left: `${barLeft}%`,
              width: `${barWidth}%`,
              backgroundColor: conviction.hex,
            }}
          />
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper transition-[left] duration-300 ease-out"
            style={{ left: `${userPct}%`, backgroundColor: conviction.hex }}
          />
          {hasCompare && (
            /* Hollow navy diamond: the severity colour belongs to the gap, so
               the marker itself must not read as "red = divergent". */
            <span
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-cerulean-900 bg-paper-raised transition-[left] duration-300 ease-out"
              style={{ left: `${comparePct}%` }}
            />
          )}
        </span>

        {/* Always-on verdict: colour and words, no tap required. */}
        {hasCompare && gapStyle && gap !== null && gapUnits !== null && (
          <span className="flex items-center justify-between gap-2 pb-1.5 text-3xs">
            <span className="flex items-center gap-1 font-semibold" style={{ color: gapStyle.hex }}>
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0"
                style={{ backgroundColor: gapStyle.hex }}
              />
              {gapUnits} apart
            </span>
            <span className="text-right" style={{ color: gapStyle.hex }}>
              {gapStyle.label}
            </span>
          </span>
        )}
      </button>

      {isZoomed && (
        <div className="mb-2 border border-rule bg-cerulean-50 px-3 py-2.5 text-xs leading-relaxed">
          <p className="font-medium text-ink-soft">{labels.desc}</p>
          <p className="mt-1 text-ink-muted">
            You sit at <strong className="num text-ink">{formatSigned(signed)}</strong>,
            leaning toward <strong className="text-ink">{poleLabel}</strong>, away from{" "}
            {otherLabel}.{" "}
            {conviction.level === "Extreme"
              ? "An extreme conviction."
              : conviction.level === "Strong"
              ? "A strong conviction."
              : conviction.level === "Moderate"
              ? "A moderate lean."
              : "A balanced position."}
          </p>
          {hasCompare && (
            <p className="mt-1 text-ink-muted">
              <strong className="text-ink">{compareName}</strong> sits at{" "}
              <strong className="num text-ink">{formatSigned(compareSigned)}</strong>:{" "}
              <strong style={{ color: gapStyle?.hex }}>{gapStyle?.label}</strong>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The 14-axis theological fingerprint.
 *
 * Every category is open by default: a collapsed accordion asked the reader to
 * click four times before seeing the thing they came for, and "Expand all" is
 * not a feature, it is an apology. Two columns only from lg, where the rails
 * are still wide enough to read, and each header stays a real button with
 * aria-expanded.
 */
export function FingerprintPanel({
  userCoords,
  collapsedCategories,
  onSetCollapsedCategories,
  expandedAxis,
  onSetExpandedAxis,
  compareDenomId,
  onSetCompareDenomId,
  allCoordinates,
  activeOnly,
}: {
  /** Includes the derived `tolerance` and `certainty` axes. */
  userCoords: Record<string, number>;
  collapsedCategories: Record<string, boolean>;
  onSetCollapsedCategories: (cats: Record<string, boolean>) => void;
  expandedAxis: string | null;
  onSetExpandedAxis: (axis: string | null) => void;
  compareDenomId: string | null;
  onSetCompareDenomId: (id: string | null) => void;
  allCoordinates: CoordsMap;
  activeOnly: boolean;
}) {
  const categoryEntries = Object.entries(FINGERPRINT_CATEGORIES);
  const compareDenom =
    compareDenomId !== null ? allCoordinates.get(compareDenomId) : undefined;

  /**
   * Per-axis gap against the comparison tradition.
   *
   * The rails carry this now (a coloured band plus a delta line), and the
   * summary strip below turns it into one sentence: before, fourteen axes of
   * comparison were invisible until you tapped each one open.
   */
  const compareAxes = useMemo(() => {
    const rows: {
      axis: string;
      gap: number;
      units: number;
      hex: string;
      label: string;
      tone: string;
    }[] = [];
    if (!compareDenom?.dimCoords) return rows;
    categoryEntries.forEach(([, catData]) => {
      catData.axes.forEach((axis) => {
        const mine = userCoords[axis];
        const theirs = compareDenom.dimCoords?.[axis];
        if (mine === undefined || mine === null) return;
        if (theirs === undefined || theirs === null) return;
        const invert = AXIS_LABELS[axis]?.invert === true;
        const gap = Math.round(Math.abs(mine - theirs));
        // Distance on the ±100 scale, so it matches the two numerals the row
        // prints. The colour still comes from the raw gap above.
        const units = Math.round(
          Math.abs(axisPosition(mine, invert).signed - axisPosition(theirs, invert).signed)
        );
        const style = getGapStyle(gap);
        rows.push({ axis, gap, units, hex: style.hex, label: style.label, tone: style.tone });
      });
    });
    return rows;
    // categoryEntries is derived from a module constant, so it is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareDenom, userCoords]);

  const compareStats = useMemo(() => {
    if (compareAxes.length === 0) return null;
    const count = (tone: string) => compareAxes.filter((row) => row.tone === tone).length;
    return {
      total: compareAxes.length,
      aligned: count("aligned"),
      moderate: count("moderate"),
      divergent: count("divergent"),
      average: Math.round(
        compareAxes.reduce((sum, row) => sum + row.units, 0) / compareAxes.length,
      ),
    };
  }, [compareAxes]);

  const setAll = (collapsed: boolean) => {
    const next: Record<string, boolean> = {};
    categoryEntries.forEach(([key]) => {
      next[key] = collapsed;
    });
    onSetCollapsedCategories(next);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-2">
        <div>
          <h2 className="font-display text-xl text-ink">Theological fingerprint</h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Your position on 14 bipolar dimensions, grouped by category.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAll(false)}
            className="border border-rule-strong px-2.5 py-1 text-2xs font-medium text-ink transition-colors hover:bg-muted-soft"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setAll(true)}
            className="border border-rule-strong px-2.5 py-1 text-2xs font-medium text-ink transition-colors hover:bg-muted-soft"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <label htmlFor="compare-denomination" className="meta block">
            Compare against
          </label>
          <select
            id="compare-denomination"
            value={compareDenomId ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onSetCompareDenomId(value === "" ? null : value);
            }}
            className="mt-1 w-full border border-rule-strong px-2.5 py-1.5 text-sm text-ink-soft md:w-72"
          >
            <option value="">— None —</option>
            {allCoordinates.size > 0 ? (
              Array.from(allCoordinates.entries())
                .filter(([, data]) => !activeOnly || data.isActive !== false)
                .sort((a, b) => a[1].name.localeCompare(b[1].name))
                .map(([id, data]) => (
                  <option key={id} value={id}>
                    {data.name}
                  </option>
                ))
            ) : (
              <option value="" disabled>
                Loading traditions…
              </option>
            )}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rule pt-2 text-2xs md:border-t-0 md:pt-0">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-paper bg-cerulean-900" />
            <span className="text-ink-muted">You</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rotate-45 border-2 border-cerulean-900 bg-paper-raised" />
            <span className="max-w-[9rem] truncate text-ink-muted">
              {compareDenom?.name ?? "Comparison"}
            </span>
          </span>
          <span className="text-ink-muted">Bar = how strongly you hold it</span>
          {compareStats && (
            <span className="flex items-center gap-1.5">
              <span className="text-ink-muted">Gap colour:</span>
              <span aria-hidden="true" className="flex items-center gap-1">
                {[getGapStyle(3), getGapStyle(22), getGapStyle(60)].map((step) => (
                  <span
                    key={step.label}
                    className="inline-block h-2 w-3"
                    style={{ backgroundColor: step.hex }}
                  />
                ))}
              </span>
              <span className="text-ink-muted">aligned → apart</span>
            </span>
          )}
        </div>
      </div>

      {/* Comparison, summarised: the answer you used to need 14 taps to find. */}
      {compareStats && compareDenom && (
        <div
          key={compareDenom.name}
          className="mt-3 animate-fade-in border border-rule bg-paper-raised p-2.5 sm:p-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-xs text-ink-soft">
              You and <strong className="font-semibold text-ink">{compareDenom.name}</strong>
            </p>
            <p className="text-2xs text-ink-muted">
              Average gap <strong className="num text-ink">{compareStats.average}</strong> / 200
            </p>
          </div>
          <div className="mt-1.5 flex h-2 gap-px" aria-hidden="true">
            {compareAxes.map((row) => (
              <span key={row.axis} className="flex-1" style={{ backgroundColor: row.hex }} />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-muted">
            <span>
              <strong className="num text-ink">{compareStats.aligned}</strong> of{" "}
              {compareStats.total} aligned
            </span>
            <span>
              <strong className="num text-ink">{compareStats.moderate}</strong> moderate
            </span>
            <span>
              <strong className="num text-ink">{compareStats.divergent}</strong> diverging
            </span>
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule pt-2 text-2xs">
        <ConvictionSwatch score={4} label="Extreme" />
        <ConvictionSwatch score={20} label="Strong" />
        <ConvictionSwatch score={40} label="Moderate" />
        <ConvictionSwatch score={50} label="Neutral" />
        {/* The sign needs explaining once, not bound to a colour: -100 is the
            left pole and +100 the right, so the numeral names the end you lean
            to without making the reader find the pole labels first. */}
        <span className="num ml-auto font-mono text-2xs text-ink-muted">
          -100 left &middot; 0 neutral &middot; +100 right
        </span>
      </div>


      <div className="mt-3 grid grid-cols-1 gap-2 md:gap-3 lg:grid-cols-2">
        {categoryEntries.map(([catKey, catData], catIndex) => {
          // Every category opens by default: the two-column layout means the
          // whole 14-axis picture fits without the long scroll it used to need.
          const isCollapsed = collapsedCategories[catKey] ?? false;
          const bodyId = `fingerprint-body-${catKey}`;
          const headerId = `fingerprint-header-${catKey}`;

          return (
            <section key={catKey} className="card self-start">
              <button
                type="button"
                id={headerId}
                aria-expanded={!isCollapsed}
                aria-controls={bodyId}
                onClick={() =>
                  onSetCollapsedCategories({
                    ...collapsedCategories,
                    [catKey]: !isCollapsed,
                  })
                }
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors hover:bg-cerulean-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {catData.label}
                  </span>
                  <span className="meta block truncate normal-case tracking-normal">
                    {catData.desc}
                  </span>
                </span>
                <svg
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${
                    isCollapsed ? "" : "rotate-180"
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.75}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {!isCollapsed && (
                <div
                  id={bodyId}
                  role="region"
                  aria-labelledby={headerId}
                  className="border-t border-rule px-3 pb-1 pt-0.5"
                >
                  {catData.axes.map((axis, rowIndex) => (
                    <AxisRow
                      key={axis}
                      axis={axis}
                      userScore={userCoords[axis]}
                      compareScore={compareDenom?.dimCoords?.[axis]}
                      compareName={compareDenom?.name}
                      isZoomed={expandedAxis === axis}
                      delay={catIndex * 40 + rowIndex * 50}
                      onToggle={() =>
                        onSetExpandedAxis(expandedAxis === axis ? null : axis)
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

