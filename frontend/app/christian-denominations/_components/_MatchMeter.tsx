import { getTierStyle } from "../_helpers";
import { TIER_STEPS } from "../../../lib/palette";

/**
 * A 3px rule + tabular score. The whole visual language for "how well does this
 * match" — replaces the tier badges, gradient bars and coloured pills.
 *
 * The track is `bg-blue-100`, not a neutral rule, so the bar reads as "how much
 * blue" — and the faintest tier stays visible against it.
 */
export function MatchMeter({
  score,
  showNumber = true,
  size = "md",
  className = "",
  delay = 0,
}: {
  score: number;
  showNumber?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  /**
   * Milliseconds to wait before the bar fills. Lets a list cascade top-down;
   * it also leaves the bar empty (not merely static) until then, because the
   * fill is a `both`-filled animation. Keep it under ~400ms.
   */
  delay?: number;
}) {
  const tier = getTierStyle(score);
  // Bars are the main way a phone user compares ranks, so they need real
  // weight: 8px for list rows, 10px for the top match, 12px where the bar is
  // the only gauge on screen. Thinner than 8px was unreadable in sunlight.
  const height = size === "lg" ? "h-3" : size === "sm" ? "h-2" : "h-2.5";

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className={`relative ${height} w-full overflow-hidden rounded-full bg-cerulean-100`}>
        {/* `transition-[width]` alone was here first, but on mount there is no
            previous width to transition from, so the bar simply appeared full.
            The clip-path animation handles the arrival; the width transition
            still glides when a score changes without a remount. */}
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out animate-bar-grow"
          style={{
            width: `${Math.max(0, Math.min(100, score))}%`,
            backgroundColor: tier.hex,
            animationDelay: `${delay}ms`,
          }}
        />
      </div>
      {showNumber && (
        <span
          className={`num shrink-0 font-mono font-semibold text-ink ${
            size === "lg" ? "text-xl" : size === "sm" ? "text-xs" : "text-sm"
          }`}
        >
          {score}
          <span className="font-normal text-ink-muted">%</span>
        </span>
      )}
    </div>
  );
}

/** The five-step match scale as a single line of legend text. */
export function TierLegendLine({ className = "" }: { className?: string }) {
  return (
    <ul className={`meta flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {TIER_STEPS.map((step) => (
        <li key={step.range} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: step.hex }}
          />
          <span>
            {step.range} <span className="text-ink-muted">{step.label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
