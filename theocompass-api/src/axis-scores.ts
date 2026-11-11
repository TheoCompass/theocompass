/**
 * Axis aggregation helpers.
 *
 * Pure, dependency-free math so it can be unit-tested without D1/KV.
 * The 14th axis (Certainty) mirrors the shape of the 13th (Tolerance), which
 * stays inline in handleCalculate: an affirmed-only weighted average of the
 * raw slider values, rescaled to 0-100.
 */

export interface AxisAnswerInput {
  certainty?: number | null;
  tolerance?: number | null;
  isSilence?: boolean;
  silenceType?: "apathetic" | "hostile";
}

/** A certainty observation already weighted by its question's priority. */
export interface WeightedCertaintySample {
  certainty: number;
  weight: number;
  isSilence?: boolean;
}

export interface AxisScoreResult {
  score: number;
  weightedSum: number;
  totalWeight: number;
  count: number;
}

/** Neutral midpoint of the 0-3 certainty scale, expressed on 0-100. */
export const CERTAINTY_FALLBACK = 50;

/**
 * Certainty axis: affirmed-only, priority-weighted mean of the 0-3 slider
 * values, mapped to 0-100 via x(100/3).
 *
 * A tradition that answers "Certain" everywhere scores exactly 100 regardless
 * of weights -- that is semantically correct, not a tie-break failure.
 * Priority weighting only re-ranks traditions that are selectively certain.
 */
export function computeCertaintyAxis(
  samples: WeightedCertaintySample[]
): AxisScoreResult {
  let weightedSum = 0;
  let totalWeight = 0;
  let count = 0;

  for (const sample of samples) {
    // Affirmed answers only -- silence makes no epistemic claim.
    if (sample.isSilence) continue;

    const cVal = Number(sample.certainty);
    const wVal = Number(sample.weight);
    if (!Number.isFinite(cVal) || !Number.isFinite(wVal) || wVal <= 0) continue;

    weightedSum += cVal * wVal;
    totalWeight += wVal;
    count += 1;
  }

  const score =
    totalWeight > 0
      ? Number(((weightedSum / totalWeight) * (100 / 3)).toFixed(1))
      : CERTAINTY_FALLBACK;

  return { score, weightedSum, totalWeight, count };
}
