import { getConvictionStyle } from '../_helpers';

/**
 * One dot per conviction step, filled from the same hex as the rail.
 *
 * It used to take its colour from a Tailwind class on the style object, which
 * meant the legend and the bar could drift apart the moment the ramp changed.
 * One source of truth is cheaper than keeping two in sync.
 */
export function ConvictionSwatch({ score, label }: { score: number; label: string }) {
  const style = getConvictionStyle(score);
  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-rule-strong ring-offset-1"
        style={{ backgroundColor: style.hex }}
      />
      <span className="text-ink-soft">{label}</span>
    </div>
  );
}