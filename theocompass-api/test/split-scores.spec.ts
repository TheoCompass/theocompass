import { describe, it, expect } from 'vitest';
import {
  resolveAnswerIds,
  scoredViewIds,
  schismFactor,
  applySplitDrag,
  NEUTRAL_AXIS_VALUE,
  MAX_SELECTIONS_PER_QUESTION,
} from '../src/split-scores';

/**
 * Golden fixtures for multi-select scoring (Phase 0.1).
 *
 * The user side reuses the denomination side's schism math exactly:
 *   score = best - (best - mean) * F
 *   F     = count > 1 ? ((4 - T) / 4) * (C / 3) : 0
 *
 * Every expected number below is derived by hand and shown in the comment.
 */

describe('schismFactor - golden fixtures', () => {
  it('is 0 for a single view, whatever the certainty', () => {
    expect(schismFactor(3, 0, 1)).toBe(0);
    expect(schismFactor(2, 2, 0)).toBe(0);
  });

  it('is 1 for a certain (C=3), exclusive (T=0) split', () => {
    // ((4 - 0) / 4) * (3 / 3) = 1
    expect(schismFactor(3, 0, 2)).toBe(1);
  });

  it('is 1/3 for "Pretty sure" (C=2) with medium tolerance (T=2)', () => {
    // ((4 - 2) / 4) * (2 / 3) = 0.5 * 0.666... = 0.333...
    expect(schismFactor(2, 2, 2)).toBeCloseTo(1 / 3, 12);
  });

  it('is 0 when uncertain (C=0), however exclusive', () => {
    // ((4 - 0) / 4) * (0 / 3) = 0
    expect(schismFactor(0, 0, 4)).toBe(0);
  });

  it('is 0 when fully tolerant (T=4), however certain', () => {
    // ((4 - 4) / 4) * (3 / 3) = 0
    expect(schismFactor(3, 4, 3)).toBe(0);
  });

  it('clamps out-of-range slider values into 0-1', () => {
    expect(schismFactor(9, -3, 2)).toBe(1);
    expect(schismFactor(-2, 9, 2)).toBe(0);
  });

  it('ignores non-numeric input instead of returning NaN', () => {
    expect(schismFactor(Number.NaN, 2, 2)).toBe(0);
    expect(schismFactor(2, Number.NaN, 2)).toBe(0);
  });
});

describe('applySplitDrag - golden fixtures', () => {
  it('returns null when there is nothing to score', () => {
    expect(applySplitDrag([], 1)).toBeNull();
    expect(applySplitDrag([Number.NaN], 1)).toBeNull();
  });

  it('leaves a single view untouched, so one answer is a no-op', () => {
    // best === mean === 85 -> 85 - (85 - 85) * 1 = 85
    for (const factor of [0, 1 / 3, 1]) {
      expect(applySplitDrag([85], factor)?.score).toBe(85);
    }
  });

  it('drags toward the mean when the factor rises', () => {
    expect(applySplitDrag([80, 40], 0)?.score).toBe(80);
    // 80 - (80 - 60) * 1/3 = 80 - 6.666... = 73.333...
    expect(applySplitDrag([80, 40], 1 / 3)?.score).toBeCloseTo(73.333, 3);
    // 80 - (80 - 60) * 1 = 60, i.e. the plain mean
    expect(applySplitDrag([80, 40], 1)?.score).toBe(60);
  });

  it('reports best and mean alongside the score', () => {
    const result = applySplitDrag([80, 40], 1);
    expect(result).toEqual({ score: 60, best: 80, mean: 60, count: 2 });
  });

  it('never scores above the best view', () => {
    expect(applySplitDrag([90, 70, 20], 1)?.score).toBe(60); // mean of 90/70/20
    expect(applySplitDrag([90, 70, 20], 0)?.score).toBe(90);
  });

  it('is unaffected by identical views', () => {
    expect(applySplitDrag([64, 64, 64], 1)?.score).toBe(64);
  });
});

describe('nested drag - denomination schism inside, user schism outside', () => {
  /**
   * Two selections against a two-branch tradition, C=2/T=2 on both sides, so
   * F_B = F_A = 1/3.
   *
   *   selection 1 vs branches [80, 40]: 80 - 20/3 = 73.333...
   *   selection 2 vs branches [60, 20]: 60 - 20/3 = 53.333...
   *   across selections: best 73.333, mean 63.333
   *   -> 73.333 - (10 * 1/3) = 70.000
   */
  it('composes the two drags', () => {
    const fB = schismFactor(2, 2, 2);
    const fA = schismFactor(2, 2, 2);

    const perSelection = [
      applySplitDrag([80, 40], fB)!.score,
      applySplitDrag([60, 20], fB)!.score,
    ];
    const nested = applySplitDrag(perSelection, fA)!.score;

    expect(nested).toBeCloseTo(70, 6);
  });

  it('collapses to the single-answer result when the user picks one option', () => {
    const fB = schismFactor(2, 2, 2);
    const single = applySplitDrag([80, 40], fB)!.score;
    const fA = schismFactor(2, 2, 1); // one selection => no user-side schism
    const nested = applySplitDrag([single], fA)!.score;

    expect(fA).toBe(0);
    expect(nested).toBe(single);
  });

  it('punishes a certain, exclusive user who affirms both branches of a schism', () => {
    // Selections mirror the branches, so each side's best is 100 but its mean is
    // 65: [100, 30] -> 100 - (35 * 1/3) = 88.333... per selection. Both
    // directions land on the same number, so the outer drag is a no-op and the
    // loss is entirely the inner one: the answer is never the best-branch 100.
    const fB = schismFactor(2, 2, 2);
    const perSelection = [
      applySplitDrag([100, 30], fB)!.score,
      applySplitDrag([30, 100], fB)!.score,
    ];
    const nested = applySplitDrag(perSelection, 1)!.score;

    expect(nested).toBeCloseTo(88.333, 3);
    expect(nested).toBeLessThan(100);
  });

  it('lets an uncertain user keep best-match credit across selections', () => {
    // C=0 => F_A = 0, so the best selection's best branch stands.
    const fB = schismFactor(2, 2, 2);
    const perSelection = [
      applySplitDrag([85, 20], fB)!.score,
      applySplitDrag([40, 35], fB)!.score,
    ];
    const fA = schismFactor(0, 2, 2);

    expect(fA).toBe(0);
    expect(applySplitDrag(perSelection, fA)!.score).toBe(perSelection[0]);
  });
});

describe('resolveAnswerIds - payload normalisation', () => {
  it('prefers the full selection list', () => {
    expect(resolveAnswerIds({ answerId: 'A', answerIds: ['A', 'B', 'C'] })).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  it('falls back to the legacy single answer', () => {
    expect(resolveAnswerIds({ answerId: 'A' })).toEqual(['A']);
    expect(resolveAnswerIds({ answerId: 'A', answerIds: [] })).toEqual(['A']);
  });

  it('drops duplicates while keeping click order', () => {
    expect(resolveAnswerIds({ answerIds: ['B', 'A', 'B'] })).toEqual(['B', 'A']);
  });

  it('drops blank and "skipped" ids', () => {
    expect(resolveAnswerIds({ answerIds: ['  ', 'A', 'skipped'] })).toEqual(['A']);
  });

  it('yields one neutral id when nothing usable is left', () => {
    // Legacy "skipped": every axis fell back to 50 and the question still counted.
    expect(resolveAnswerIds({ answerId: 'skipped' })).toEqual(['']);
    expect(resolveAnswerIds({})).toEqual(['']);
    expect(NEUTRAL_AXIS_VALUE).toBe(50);
  });

  it('ignores selections on a silenced question', () => {
    // Silence makes no positional claim, so the selections must not be scored.
    expect(
      resolveAnswerIds({ isSilence: true, answerId: 'A', answerIds: ['A', 'B'] })
    ).toEqual([]);
  });

  it('caps runaway selection lists', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `A${i}`);
    expect(resolveAnswerIds({ answerIds: ids })).toHaveLength(MAX_SELECTIONS_PER_QUESTION);
  });
});

describe('scoredViewIds - what the scoring loop iterates', () => {
  it('passes real selections straight through', () => {
    expect(scoredViewIds({ answerIds: ['A', 'B'] })).toEqual(['A', 'B']);
    expect(scoredViewIds({ answerId: 'A' })).toEqual(['A']);
  });

  it('gives a silenced question one neutral slot, so it still counts', () => {
    // Dropping the question instead would silently re-weight the whole average.
    expect(scoredViewIds({ isSilence: true, answerId: 'silence_apathetic' })).toEqual(['']);
    expect(scoredViewIds({ isSilence: true, answerIds: ['A', 'B'] })).toEqual(['']);
  });

  it('does the same for a legacy skipped question', () => {
    expect(scoredViewIds({ answerId: 'skipped' })).toEqual(['']);
    expect(scoredViewIds({})).toEqual(['']);
  });

  it('never yields an empty list, which would erase the question', () => {
    for (const payload of [null, undefined, {}, { answerId: '' }, { isSilence: true }]) {
      expect(scoredViewIds(payload).length).toBeGreaterThan(0);
    }
  });
});
