import { tierWeight } from "../_constants";

/**
 * The `1/5` … `5/5` block at the top of a tier card, drawn at the weight its
 * tier deserves.
 *
 * A component rather than a class string in two files: the label cloud and the
 * exported report have to print the same block, and the class list is long
 * enough that two copies would drift the first time either one was touched -
 * the same reason `TIER_LABELS` lives in `_constants.ts` and not in each caller.
 *
 * The rank is said twice inside this one element, and that is the point: a
 * numeral to read and a fill to feel. Filled means "toward the core", outlined
 * means "toward preference", and both survive greyscale, a photocopier and the
 * html2canvas rasterisation of the report - unlike any animation would have.
 * See the long note above `TIER_WEIGHT` in `_constants.ts` for why weight, and
 * not motion, carries this scale.
 *
 * The outlined variant is deliberately unfilled: the block sits on the card's
 * graded plate, so a `bg-paper` fill would read as a hole on the palest card
 * and as a bright patch on the darkest. Unfilled also means the outlined and
 * filled blocks share one silhouette on every step of the ramp.
 */
export function TierNumeral({
  tolerance,
}: {
  /** 0-4, most essential first. Out-of-range values fall back to neutral. */
  tolerance: number;
}) {
  const { numeral } = tierWeight(tolerance);

  return (
    <span
      className={`num flex h-4 shrink-0 items-center rounded-[2px] border px-1.5 font-mono font-bold leading-none ${numeral}`}
    >
      {tolerance + 1}/5
    </span>
  );
}
