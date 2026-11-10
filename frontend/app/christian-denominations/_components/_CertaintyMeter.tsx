import { CERTAINTY_MARK, CERTAINTY_SLOTS, SURFACE } from "../../../lib/palette";

/**
 * How sure you were, as a count of filled slots.
 *
 * This replaced a coloured fill on the belief chip. Colour could not carry the
 * magnitude: four saturated fills next to a coloured border made a chip read as
 * a rectangle before it read as a belief, and the reader still needed a legend
 * to know which fill meant "certain". A count needs no legend - more filled,
 * more sure - and it survives small rendering, greyscale printing and every
 * colour-vision deficiency.
 *
 * Three slots for four states (see `CERTAINTY_SLOTS`): with four slots the
 * "Certain" state could never fill the bar, and the meter read as a bug. The
 * filled colour is a single cerulean, never a ramp, so there is still nothing
 * to rank; it exists to separate "on" from "off" and to give the chip one point
 * of colour.
 *
 * Colours are hexes from `lib/palette`, not CSS variables: the export card is
 * rasterised by html2canvas, which is happier with a resolved colour than with
 * `var(--color-ink)` inside an inline style.
 */
const SIZES = {
  /** Inside a belief chip (13px type). */
  xs: { w: "0.25rem", h: "0.625rem", gap: "0.125rem" },
  /** Legend rows and the export card. */
  sm: { w: "0.3125rem", h: "0.75rem", gap: "0.1875rem" },
} as const;

export type CertaintyMeterSize = keyof typeof SIZES;

export function CertaintyMeter({
  value,
  size = "xs",
  className = "",
}: {
  /** 0-3, already clamped by the caller. */
  value: number;
  size?: CertaintyMeterSize;
  className?: string;
}) {
  const filled = Math.max(0, Math.min(CERTAINTY_SLOTS, Math.round(value)));
  const dims = SIZES[size];

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-end ${className}`}
      style={{ gap: dims.gap }}
    >
      {Array.from({ length: CERTAINTY_SLOTS }, (_, i) => (
        <span
          key={i}
          style={{
            width: dims.w,
            height: dims.h,
            /* A 1px soften: crisp enough for the instrument, not needle-sharp. */
            borderRadius: 1,
            backgroundColor: i < filled ? CERTAINTY_MARK : SURFACE.ruleStrong,
          }}
        />
      ))}
    </span>
  );
}
