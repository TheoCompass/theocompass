/**
 * Split-view ("schism") aggregation for multi-select answers.
 *
 * A question may carry several selections (Phase 0.1). The engine treats them
 * exactly like a denomination's accepted views: the same formula, applied once
 * per side.
 *
 *   score = best - (best - mean) * F
 *   F     = count > 1 ? ((4 - T) / 4) * (C / 3) : 0
 *
 * F is 1 for a side that is certain (C=3) and exclusive (T=0), 0 for a side that
 * is uncertain or tolerant. Applying it twice -- once across a denomination's
 * branches, once across the user's selections -- keeps the existing behaviour
 * intact and gives the user side the same voice the denomination side has:
 *
 * - One selection is a no-op: best === mean, so the drag term is 0 and the
 *   question scores bit-identically to the pre-multi-select engine.
 * - A certain, exclusive user who ticks several options is scored against all
 *   of them; an uncertain or tolerant one keeps best-match credit.
 *
 * Pure and dependency-free so it can be unit-tested without D1/KV.
 */

/** The answer ids carried by a question, after normalising the payload. */
export interface AnswerIdsSource {
  isSilence?: boolean;
  answerId?: string | null;
  answerIds?: string[] | null;
}

export interface SplitScoreResult {
  score: number;
  best: number;
  mean: number;
  count: number;
}

/** Value a missing / unusable answer contributes on every axis. */
export const NEUTRAL_AXIS_VALUE = 50;

/**
 * Sanity cap on how many options a single question may score.
 *
 * Quiz questions offer at most a handful of options, so this is invisible to
 * real clients. It bounds the per-question compute and keeps the label lookup's
 * `IN (...)` list well under D1's bound-parameter limit if a client sends junk.
 */
export const MAX_SELECTIONS_PER_QUESTION = 8;

/**
 * The selections a question actually scores, in click order.
 *
 * `answerIds` wins when present; otherwise the legacy single `answerId` is used,
 * so a saved quiz from before multi-select restores unchanged. Silence ignores
 * selections entirely -- a silenced question makes no positional claim.
 *
 * A payload with nothing usable still yields one empty id: that reproduces the
 * legacy "skipped" behaviour, where every axis falls back to 50, instead of
 * quietly dropping the question from the weighted average.
 */
export function resolveAnswerIds(userAns: AnswerIdsSource | null | undefined): string[] {
  if (userAns?.isSilence) return [];

  const raw =
    Array.isArray(userAns?.answerIds) && userAns!.answerIds!.length > 0
      ? userAns!.answerIds!
      : [userAns?.answerId ?? ""];

  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!id || id === "skipped") continue;
    if (ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= MAX_SELECTIONS_PER_QUESTION) break;
  }

  return ids.length > 0 ? ids : [""];
}

/**
 * The slots the scoring loop iterates for one question.
 *
 * `resolveAnswerIds` may legitimately return nothing (a silenced question makes
 * no positional claim), but the question must still count in the weighted
 * average with every axis neutral -- that is how silence scored before
 * multi-select. So silence and skipped questions get one neutral slot here, and
 * the loop's per-side schism is a no-op because one slot cannot disagree.
 */
export function scoredViewIds(userAns: AnswerIdsSource | null | undefined): string[] {
  const ids = resolveAnswerIds(userAns);
  return ids.length > 0 ? ids : [""];
}

/**
 * How hard a side's own spread is dragged toward its mean.
 *
 * `count` is the number of views that side holds: one view means no schism.
 * Certainty is 0-3 and tolerance 0-4; both are clamped so a malformed payload
 * cannot push the factor outside 0-1.
 */
export function schismFactor(certainty: number, tolerance: number, count: number): number {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 1) return 0;

  const c = Number(certainty);
  const t = Number(tolerance);
  if (!Number.isFinite(c) || !Number.isFinite(t)) return 0;

  const cClamped = Math.min(3, Math.max(0, c));
  const tClamped = Math.min(4, Math.max(0, t));

  return ((4 - tClamped) / 4) * (cClamped / 3);
}

/**
 * Collapse a side's per-view scores into one question score.
 *
 * Returns null when there is nothing to score, which is how the caller skips a
 * question entirely (no relevant dimensions, or every view unusable).
 */
export function applySplitDrag(
  subScores: readonly number[],
  factor: number
): SplitScoreResult | null {
  const values = subScores.filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;

  const best = Math.max(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const f = Number.isFinite(factor) ? Math.min(1, Math.max(0, factor)) : 0;

  return {
    score: best - (best - mean) * f,
    best,
    mean,
    count: values.length,
  };
}
