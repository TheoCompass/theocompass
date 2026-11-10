"use client";

import { useEffect, useId, useRef, useState } from "react";
import { prefersReducedMotion } from "../_helpers";

/**
 * The score arc — the single "designed" moment on the results page.
 *
 * Used exactly once, on the #1 match. Runner-up rows keep the thin bar, so the
 * arc reads as "this is the answer" rather than as one of many gauges.
 *
 * The arc is an SVG stroke (gradient from accent-deep → accent) on a blue-100
 * track, so it inherits the palette without a single hardcoded colour. The
 * stroke and the figure inside are driven by one eased rAF, so the number
 * counts up as the ring closes; under reduced motion both land instantly.
 */
const DEFAULT_SIZE = 108;

/**
 * Stroke width and type scale with the arc. A fixed 108px ring does not fit
 * beside a long tradition name on a 375px screen, which is why the mobile score
 * used to vanish entirely; a 58px ring with proportionally thinner stroke and
 * smaller figures still reads.
 */
function metrics(size: number) {
  const stroke = Math.max(3, Math.round(size * 0.046));
  const radius = (size - stroke) / 2;
  return { stroke, radius, circumference: 2 * Math.PI * radius };
}

export function ScoreArc({
  score,
  caption,
  size = DEFAULT_SIZE,
  toneHex,
  className = "",
}: {
  score: number;
  caption?: string;
  /** Diameter in px. Defaults to 108. */
  size?: number;
  /** Tier colour for the arc; falls back to the navy-to-cerulean gradient. */
  toneHex?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const gradientId = useId();
  const [drawn, setDrawn] = useState(0);
  /** The last painted value, so a score change glides from where it stood. */
  const paintedRef = useRef(0);
  const { stroke, radius, circumference } = metrics(size);

  /**
   * The ring and the number share one slow channel.
   *
   * They used to disagree: a CSS transition drew the stroke over 700ms while
   * the figure inside jumped straight to its final value, so the arc looked
   * like it was catching up with a number that had already arrived. One
   * eased rAF now drives both.
   *
   * The label is aria-hidden from this loop — the svg carries the true value
   * in its aria-label, so a screen reader is never read a count in progress.
   */
  useEffect(() => {
    const to = clamped;
    if (prefersReducedMotion()) {
      // One frame, not zero: a synchronous setState inside the effect body
      // triggers a cascading render, and the arc still lands before the
      // browser has anything to show.
      const frame = requestAnimationFrame(() => {
        paintedRef.current = to;
        setDrawn(to);
      });
      return () => cancelAnimationFrame(frame);
    }

    const from = paintedRef.current;
    if (from === to) return;

    const duration = 700;
    let startTs: number | null = null;
    let frame = 0;

    const step = (ts: number) => {
      if (startTs === null) startTs = ts;
      const t = Math.min(1, (ts - startTs) / duration);
      // ease-out cubic: the arc settles onto the value rather than arriving hot
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (to - from) * eased;
      paintedRef.current = value;
      setDrawn(value);
      if (t < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [clamped]);

  const offset = circumference - (drawn / 100) * circumference;

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${clamped} percent match${caption ? `, ${caption}` : ""}`}
        className="-rotate-90"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-accent-deep)" />
            <stop offset="100%" stopColor="var(--color-accent)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-cerulean-100)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={toneHex ?? `url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="num font-mono leading-none text-ink"
          style={{ fontSize: Math.round(size * 0.21) }}
          aria-hidden="true"
        >
          {Math.round(drawn)}
          <span
            className="text-ink-muted"
            style={{ fontSize: Math.round(size * 0.115) }}
          >
            %
          </span>
        </span>
        {caption && (
          <span
            className="meta mt-0.5"
            style={{ fontSize: Math.max(8, Math.round(size * 0.085)) }}
          >
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}
