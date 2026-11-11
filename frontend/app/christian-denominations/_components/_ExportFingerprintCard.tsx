"use client";

import { CONVICTION_LEVELS, CONVICTION_RAMP } from "../../../lib/palette";
import { FINGERPRINT_CATEGORIES, AXIS_LABELS } from "../_constants";
import { getConvictionStyle, axisPosition, formatSigned, modeLabel } from "../_helpers";
import ExportFrame from "./_ExportFrame";

export interface ExportFingerprintCardProps {
  userCoords: Record<string, number>;
  userTolerance: number;
  userCertainty: number;
  selectedMode: "quick" | "standard" | "deep" | null;
  questionCount: number;
  onRef: (el: HTMLDivElement | null) => void;
}

/**
 * One axis, drawn the way the results page draws it.
 *
 * The export used to invent its own chart - a flat rail, a dot on it, and the
 * pole names pressed against the far edges - so the PNG and the panel it was
 * exported from were two different pictures of the same fourteen numbers. This
 * mirrors `FingerprintPanel`'s `AxisRow`: pole names above the rail with your
 * score between them, and a bar that grows from the neutral centre toward
 * whichever pole you lean to.
 *
 * Left out are the three things that need a pointer: the hover verdict, the
 * comparison diamond, and the expanded description.
 */
function AxisRow({ axis, score }: { axis: string; score: number | undefined }) {
  const labels = AXIS_LABELS[axis];
  if (!labels || score === undefined || score === null) return null;

  const isInverted = labels.invert === true;
  // Same mapping as the in-app panel: the dot and the numeral come from one
  // function, so the PNG cannot drift from the screen.
  const { pct, signed } = axisPosition(score, isInverted);
  const isLeft = pct < 50;
  const conviction = getConvictionStyle(score);
  // Bar grows from the centre (neutral) toward the pole you lean to.
  const barLeft = Math.min(pct, 50);
  const barWidth = Math.abs(pct - 50);

  return (
    <div className="border-b border-rule py-1.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
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
      </div>

      <div className="relative mt-1 h-6">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-cerulean-100" />
        <div className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-cerulean-300" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{ left: `${barLeft}%`, width: `${barWidth}%`, backgroundColor: conviction.hex }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper"
          style={{ left: `${pct}%`, backgroundColor: conviction.hex }}
        />
      </div>
    </div>
  );
}

export default function ExportFingerprintCard({
  userCoords,
  userTolerance,
  userCertainty,
  selectedMode,
  questionCount,
  onRef,
}: ExportFingerprintCardProps) {
  const exportCoords: Record<string, number> = {
    ...userCoords,
    tolerance: userTolerance,
    certainty: userCertainty,
  };

  const now = new Date();
  const timestamp = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <ExportFrame
      ref={onRef}
      artefact="Fingerprint Report"
      modeLabel={modeLabel(selectedMode)}
      questionCount={questionCount}
      timestamp={timestamp}
    >
      {/* ─── INTRO ─── */}
      <div className="chart-grid border-b border-rule bg-paper-raised px-10 py-6 text-center">
        <p className="meta">Your 14-axis theological fingerprint</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
          Your position on each dimension, with the strength of your conviction shown
          by the bar and the dot.
        </p>
        {/* A saved file cannot be explained by hovering, so the scale is stated
            once: the sign names the end you lean to, the magnitude how far. */}
        <p className="num mx-auto mt-1 font-mono text-2xs text-ink-muted">
          -100 left pole &middot; 0 neutral &middot; +100 right pole
        </p>

        {/* The same four names, in the same descending order as the panel's own
            key, and read straight off the ramp the rails are drawn from. */}
        <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1">
          {[3, 2, 1, 0].map((index) => (
            <span key={index} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-rule-strong"
                style={{ backgroundColor: CONVICTION_RAMP[index] }}
              />
              <span className="text-2xs text-ink-soft">{CONVICTION_LEVELS[index]}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ─── CATEGORIES ───
          Four cards in two columns, because that is how the panel shows them:
          fourteen full-width rails is a different diagram. */}
      <div className="border-b border-rule bg-paper px-8 py-6">
        <div className="grid grid-cols-2 items-start gap-3">
          {Object.entries(FINGERPRINT_CATEGORIES).map(([catKey, catData]) => (
            <section key={catKey} className="card">
              <div className="px-3.5 py-2">
                <p className="text-sm font-medium text-ink">{catData.label}</p>
                <p className="meta">{catData.desc}</p>
              </div>
              <div className="border-t border-rule px-3 pb-1 pt-0.5">
                {catData.axes.map((axis) => (
                  <AxisRow key={axis} axis={axis} score={exportCoords[axis]} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </ExportFrame>
  );
}