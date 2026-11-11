import { describe, it, expect } from 'vitest';
import {
  computeCertaintyAxis,
  CERTAINTY_FALLBACK,
  type WeightedCertaintySample,
} from '../src/axis-scores';

/**
 * Golden fixtures for the 14th axis (Certainty).
 *
 * Formula:  score = round1( (sum of C*w / sum of w) * 100/3 )
 * - affirmed-only (silence contributes no epistemic claim)
 * - w = the question's priority weight
 * - 0-3 slider scale mapped onto 0-100
 *
 * Every expected number below is derived by hand and shown in the comment.
 */

const s = (certainty: number, weight: number, isSilence = false): WeightedCertaintySample => ({
  certainty,
  weight,
  isSilence,
});

describe('computeCertaintyAxis - golden fixtures', () => {
  it('uniform "Pretty Sure" (C=2) maps to two thirds of the scale', () => {
    // mean = 2 exactly -> 2 * 100/3 = 66.666... -> 66.7
    const result = computeCertaintyAxis([s(2, 1), s(2, 1), s(2, 1), s(2, 1)]);
    expect(result.score).toBe(66.7);
    expect(result.count).toBe(4);
  });

  it('all "Certain" (C=3) saturates at 100', () => {
    // mean = 3 -> 3 * 100/3 = 100
    expect(computeCertaintyAxis([s(3, 4), s(3, 1), s(3, 9)]).score).toBe(100);
  });

  it('all "Not Sure" (C=0) floors at 0', () => {
    // mean = 0 -> 0
    expect(computeCertaintyAxis([s(0, 4), s(0, 2)]).score).toBe(0);
  });

  it('weighted mix produces the documented golden value', () => {
    // samples: (C3,w4) (C1,w1) (C0,w3) (C2,w3)
    // sum(C*w) = 12 + 1 + 0 + 6 = 19 ; sum(w) = 4+1+3+3 = 11
    // 19/11 * 100/3 = 1900/33 = 57.5757... -> 57.6
    const result = computeCertaintyAxis([s(3, 4), s(1, 1), s(0, 3), s(2, 3)]);
    expect(result.score).toBe(57.6);
    expect(result.weightedSum).toBeCloseTo(19, 10);
    expect(result.totalWeight).toBeCloseTo(11, 10);
    expect(result.count).toBe(4);
  });

  it('is symmetric around the scale midpoint (C -> 3-C gives 100 - score)', () => {
    // flipped: (C0,w4) (C2,w1) (C3,w3) (C1,w3)
    // sum(C*w) = 0 + 2 + 9 + 3 = 14 ; sum(w) = 11
    // 14/11 * 100/3 = 1400/33 = 42.4242... -> 42.4  (and 100 - 57.6 = 42.4)
    const original = computeCertaintyAxis([s(3, 4), s(1, 1), s(0, 3), s(2, 3)]);
    const flipped = computeCertaintyAxis([s(0, 4), s(2, 1), s(3, 3), s(1, 3)]);
    expect(flipped.score).toBe(42.4);
    expect(flipped.score).toBeCloseTo(100 - original.score, 1);
  });

  it('falls back to the neutral midpoint when nothing is affirmed', () => {
    expect(computeCertaintyAxis([]).score).toBe(CERTAINTY_FALLBACK);
    expect(CERTAINTY_FALLBACK).toBe(50);
    // Silence-only input, including a huge weight that must NOT leak in.
    expect(
      computeCertaintyAxis([s(3, 100, true), s(0, 50, true)]).score
    ).toBe(50);
  });
});

describe('computeCertaintyAxis - invariants', () => {
  it('excludes silenced answers entirely (affirmed-only)', () => {
    const affirmedOnly = computeCertaintyAxis([s(3, 4), s(1, 1), s(0, 3), s(2, 3)]);
    const withSilence = computeCertaintyAxis([
      s(3, 4),
      s(1, 1),
      s(0, 3),
      s(2, 3),
      s(3, 100, true), // "hostile" certainty must not move the axis
    ]);
    expect(withSilence.score).toBe(affirmedOnly.score);
    expect(withSilence.count).toBe(affirmedOnly.count);
  });

  it('actually applies priority weighting', () => {
    // Weighted:   sum(C*w) = 3*9 + 0*1 = 27 ; sum(w) = 10 -> 2.7 * 100/3 = 90
    // Unweighted: mean(3, 0) = 1.5 -> 50
    expect(computeCertaintyAxis([s(3, 9), s(0, 1)]).score).toBe(90);
    expect(computeCertaintyAxis([s(3, 1), s(0, 1)]).score).not.toBe(90);
  });

  it('ignores zero / non-finite weights instead of poisoning the average', () => {
    expect(computeCertaintyAxis([s(0, 0), s(3, 1)]).score).toBe(100);
    expect(computeCertaintyAxis([s(0, Number.NaN), s(3, 1)]).score).toBe(100);
    expect(computeCertaintyAxis([s(Number.NaN as number, 1), s(3, 1)]).score).toBe(100);
  });

  it('is monotonically non-decreasing in certainty', () => {
    const base = [s(1, 3), s(2, 2), s(0, 5)];
    let previous = -1;
    for (const bump of [0, 1, 2]) {
      const raised = base.map(sample => s(Math.min(3, sample.certainty + bump), sample.weight));
      const score = computeCertaintyAxis(raised).score;
      expect(score).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });

  it('stays inside 0-100 for any legal 0-3 input', () => {
    for (let c = 0; c <= 3; c += 1) {
      const score = computeCertaintyAxis([s(c, 1), s(c, 5), s(c, 2)]).score;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
