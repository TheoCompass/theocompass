import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

/**
 * End-to-end tests for multi-select scoring (Phase 0.1), against the real
 * `/api/calculate` handler rather than a re-implementation of its loop.
 *
 * The fixture is one question whose two options sit on opposite ends of two
 * axes, plus a KV `denomination_profiles` payload with two tradition profiles in
 * one family. That is enough to pin the three things multi-select must not
 * break:
 *
 *   1. one selection scores bit-for-bit what it scored before `answerIds`
 *      existed (so saved quizzes and old clients do not change);
 *   2. several selections are dragged toward their own mean exactly like a
 *      split denomination is (F_A), and an uncertain or tolerant user is
 *      untouched by it (F_A = 0);
 *   3. silence still counts in the weighted average, and any ticked option on a
 *      silenced question is ignored.
 */

interface MatchRow {
  id: string;
  name: string;
  family: string;
  matchPercentage: number;
}

interface CalcResponse {
  dataVersion: string;
  matches: MatchRow[];
  familyMatches: Array<{ family: string; matchPercentage: number }>;
  userDimCoords: Record<string, number>;
  userTolerance: number;
  userCertainty: number;
  userLabels: Array<{ label: string; desc: string; questionId: string }>;
}

async function dispatch(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function calculate(payload: unknown): Promise<CalcResponse> {
  const response = await dispatch(
    new IncomingRequest('https://example.com/api/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  );
  const body = await response.json<any>();
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body as CalcResponse;
}

/** The payload an older client sends: one required `answerId`, no `answerIds`. */
function legacyAnswer(answerId: string, certainty = 2, tolerance = 2) {
  return {
    Q1: { questionId: 'Q1', answerId, certainty, tolerance, isSilence: false },
  };
}

/** The payload the multi-select UI sends: `answerIds` plus the first id. */
function multiAnswer(answerIds: string[], certainty = 2, tolerance = 2) {
  return {
    Q1: {
      questionId: 'Q1',
      answerId: answerIds[0] ?? '',
      answerIds,
      certainty,
      tolerance,
      isSilence: false,
    },
  };
}

function silenceAnswer(
  silenceType: 'apathetic' | 'hostile',
  extra: Record<string, unknown> = {}
) {
  return {
    Q1: {
      questionId: 'Q1',
      answerId: silenceType === 'hostile' ? 'silence_hostile' : 'silence_apathetic',
      certainty: 0,
      tolerance: 2,
      isSilence: true,
      silenceType,
      ...extra,
    },
  };
}

function scoreOf(response: CalcResponse, denominationId: string): number {
  const row = response.matches.find((m) => m.id === denominationId);
  if (!row) throw new Error(`No match row for ${denominationId}`);
  return row.matchPercentage;
}

/**
 * Schema copied from seed.sql (the files in ./migrations only cover the Phase 0
 * user tables), with the two dimensions this fixture uses set high enough on
 * the question to be scored and everything else parked at 0 - below the 50
 * relevance floor, so it is ignored.
 */
const DIMENSION_COLUMNS = [
  'theol_cons_lib',
  'social_cons_lib',
  'counter_pro_modern',
  'super_nat',
  'cult_sep_eng',
  'cleric_egal',
  'div_hum_agency',
  'commun_indiv',
  'liturg_spont',
  'sacram_funct',
  'literal_crit',
  'intellect_exper',
];

function insertRow(table: string, values: Record<string, string | number>): string {
  const columns = Object.keys(values);
  const literals = columns.map((column) => {
    const value = values[column];
    return typeof value === 'number'
      ? String(value)
      : `'${String(value).replace(/'/g, "''")}'`;
  });
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${literals.join(', ')});`;
}

function axisValues(
  theolConsLib: number,
  superNat: number,
  fallback: number
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const column of DIMENSION_COLUMNS) values[column] = fallback;
  values.theol_cons_lib = theolConsLib;
  values.super_nat = superNat;
  return values;
}

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE questions (
      id TEXT PRIMARY KEY,
      category_code TEXT,
      priority_score REAL,
      full_text TEXT,
      include_quick INTEGER,
      display_order_quick REAL,
      include_standard INTEGER,
      display_order_standard REAL,
      include_deep INTEGER,
      display_order_deep REAL
    )`),
    env.DB.prepare(
      'CREATE TABLE answer_options (id TEXT PRIMARY KEY, question_id TEXT, answer_text TEXT, theological_label TEXT, description TEXT)'
    ),
    env.DB.prepare(
      `CREATE TABLE hidden_dimensions (question_id TEXT PRIMARY KEY, ${DIMENSION_COLUMNS.join(
        ' REAL, '
      )} REAL)`
    ),
    env.DB.prepare(
      `CREATE TABLE answer_scoring (answer_id TEXT PRIMARY KEY, ${DIMENSION_COLUMNS.join(
        ' REAL, '
      )} REAL)`
    ),
    env.DB.prepare('CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT)'),

    env.DB.prepare(insertRow('app_meta', { key: 'dataset_version', value: 'test-dataset' })),
    env.DB.prepare(
      insertRow('questions', {
        id: 'Q1',
        category_code: 'TST',
        priority_score: 8,
        full_text: 'Which of these do you affirm?',
        include_quick: 1,
        display_order_quick: 1,
        include_standard: 1,
        display_order_standard: 1,
        include_deep: 1,
        display_order_deep: 1,
      })
    ),
    env.DB.prepare(
      insertRow('answer_options', {
        id: 'A1',
        question_id: 'Q1',
        answer_text: 'Option one',
        theological_label: 'Label One',
        description: 'First option.',
      })
    ),
    env.DB.prepare(
      insertRow('answer_options', {
        id: 'A2',
        question_id: 'Q1',
        answer_text: 'Option two',
        theological_label: 'Label Two',
        description: 'Second option.',
      })
    ),
    // The question weighs both axes: 100 on theology, 80 on the supernatural.
    env.DB.prepare(insertRow('hidden_dimensions', { question_id: 'Q1', ...axisValues(100, 80, 0) })),
    // The options are near-mirror images, so one selection can never satisfy both.
    env.DB.prepare(insertRow('answer_scoring', { answer_id: 'A1', ...axisValues(100, 20, 50) })),
    env.DB.prepare(insertRow('answer_scoring', { answer_id: 'A2', ...axisValues(20, 100, 50) })),

    // A second question, never mentioned by the first request of the suite: it
    // exists to prove the isolate-wide scoring cache is not narrowed to whoever
    // warmed it.
    env.DB.prepare(
      insertRow('questions', {
        id: 'Q2',
        category_code: 'TST',
        priority_score: 8,
        full_text: 'And which of these?',
        include_quick: 1,
        display_order_quick: 2,
        include_standard: 1,
        display_order_standard: 2,
        include_deep: 1,
        display_order_deep: 2,
      })
    ),
    env.DB.prepare(
      insertRow('answer_options', {
        id: 'A3',
        question_id: 'Q2',
        answer_text: 'Option three',
        theological_label: 'Label Three',
        description: 'Third option.',
      })
    ),
    env.DB.prepare(insertRow('hidden_dimensions', { question_id: 'Q2', ...axisValues(100, 80, 0) })),
    env.DB.prepare(insertRow('answer_scoring', { answer_id: 'A3', ...axisValues(100, 100, 50) })),
  ]);

  // `dimToCacheMap` in the worker reads these exact key names out of the profile.
  await env.THEOCOMPASS_CACHE.put(
    'denomination_profiles',
    JSON.stringify({
      denominations: {
        D1: {
          denomination: {
            id: 'D1',
            name: 'Tradition One',
            family: 'FamA',
            description: 'Fully theological.',
            founded: '1900',
            region: 'West',
          },
          perQuestion: {
            Q1: {
              answered: true,
              posture: 'affirmed',
              C: 2,
              T: 2,
              splitCount: 1,
              dimensions: {
                Theol_Cons_Lib: { values: [100] },
                Super_Nat: { values: [100] },
              },
            },
            Q2: {
              answered: true,
              posture: 'affirmed',
              C: 2,
              T: 2,
              splitCount: 1,
              dimensions: {
                Theol_Cons_Lib: { values: [100] },
                Super_Nat: { values: [100] },
              },
            },
          },
        },
        D2: {
          denomination: {
            id: 'D2',
            name: 'Tradition Two',
            family: 'FamA',
            description: 'Fully supernatural.',
            founded: '1950',
            region: 'South',
          },
          perQuestion: {
            Q1: {
              answered: true,
              posture: 'affirmed',
              C: 2,
              T: 2,
              splitCount: 1,
              dimensions: {
                Theol_Cons_Lib: { values: [20] },
                Super_Nat: { values: [20] },
              },
            },
            Q2: {
              answered: true,
              posture: 'affirmed',
              C: 2,
              T: 2,
              splitCount: 1,
              dimensions: {
                Theol_Cons_Lib: { values: [20] },
                Super_Nat: { values: [20] },
              },
            },
          },
        },
      },
      families: {
        FamA: {
          coordinates: { quick: { x: 10, y: 20 } },
          metadata: {
            description: 'One family.',
            founded: '1900',
            region: 'West',
            members: '1M',
          },
        },
      },
    })
  );
});

describe('single selection keeps its pre-multi-select score', () => {
  it('scores `answerId` and a one-item `answerIds` identically', async () => {
    const legacy = await calculate(legacyAnswer('A1'));
    const one = await calculate(multiAnswer(['A1']));

    // Same numbers, not merely "close": saved quizzes and older clients replay
    // through the legacy field and must land on exactly the same ranking.
    expect(one.matches).toEqual(legacy.matches);
    expect(one.familyMatches).toEqual(legacy.familyMatches);
    expect(one.userDimCoords).toEqual(legacy.userDimCoords);
    expect(one.userLabels).toEqual(legacy.userLabels);
  });

  it('drops duplicate and blank ids instead of double-counting them', async () => {
    const one = await calculate(multiAnswer(['A1']));
    const noisy = await calculate(multiAnswer(['A1', 'A1', '   ', 'A1']));

    expect(noisy.matches).toEqual(one.matches);
  });
});

describe('several affirmed options are dragged toward their own mean', () => {
  it('takes the mean of the selections for a certain, exclusive user', async () => {
    const singleA1 = scoreOf(await calculate(legacyAnswer('A1', 3, 0)), 'D1');
    const singleA2 = scoreOf(await calculate(legacyAnswer('A2', 3, 0)), 'D1');
    const both = scoreOf(await calculate(multiAnswer(['A1', 'A2'], 3, 0)), 'D1');

    // The denomination has one view, so F_B = 0 and the only drag left is
    // F_A = 1: best - (best - mean) = the plain mean of the two selections.
    expect(both).toBeCloseTo((singleA1 + singleA2) / 2, 1);
    expect(both).toBeLessThan(Math.max(singleA1, singleA2));
  });

  it('leaves an uncertain user with the better selection (F_A = 0)', async () => {
    const singleA1 = scoreOf(await calculate(legacyAnswer('A1', 0, 2)), 'D1');
    const singleA2 = scoreOf(await calculate(legacyAnswer('A2', 0, 2)), 'D1');
    const both = scoreOf(await calculate(multiAnswer(['A1', 'A2'], 0, 2)), 'D1');

    expect(both).toBe(Math.max(singleA1, singleA2));
  });

  it('leaves a fully tolerant user with the better selection too (F_A = 0)', async () => {
    const singleA1 = scoreOf(await calculate(legacyAnswer('A1', 3, 4)), 'D1');
    const singleA2 = scoreOf(await calculate(legacyAnswer('A2', 3, 4)), 'D1');
    const both = scoreOf(await calculate(multiAnswer(['A1', 'A2'], 3, 4)), 'D1');

    expect(both).toBe(Math.max(singleA1, singleA2));
  });
});

describe('fingerprint and labels', () => {
  it('averages the selections into one fingerprint contribution', async () => {
    const both = await calculate(multiAnswer(['A1', 'A2']));

    // (100 + 20) / 2 and (20 + 100) / 2: the mean position, with the question's
    // weight counted once rather than once per ticked option.
    expect(both.userDimCoords.theolconslib).toBe(60);
    expect(both.userDimCoords.supernat).toBe(60);

    const single = await calculate(legacyAnswer('A1'));
    expect(single.userDimCoords.theolconslib).toBe(100);
  });

  it('labels every affirmed option', async () => {
    const single = await calculate(legacyAnswer('A1'));
    expect(single.userLabels.map((label) => label.label)).toEqual(['Label One']);

    const both = await calculate(multiAnswer(['A1', 'A2']));
    expect(both.userLabels.map((label) => label.label)).toEqual(['Label One', 'Label Two']);
  });
});

describe('isolate-wide scoring cache', () => {
  it('serves a question the first request of the isolate never mentioned', async () => {
    // Every test above asks about Q1, so the cold-start cache was warmed with
    // Q1's dimensions only. A cache narrowed to the warming request would score
    // Q2 as if the user had answered nothing, and drop its label.
    const res = await calculate({
      Q2: { questionId: 'Q2', answerId: 'A3', certainty: 2, tolerance: 2, isSilence: false },
    });

    expect(res.userDimCoords.theolconslib).toBe(100);
    expect(res.userLabels.map((label) => label.label)).toEqual(['Label Three']);
    expect(scoreOf(res, 'D1')).toBeGreaterThan(scoreOf(res, 'D2'));
  });
});

describe('silence and "None of the above"', () => {
  it('ignores any ticked option once the question is silenced', async () => {
    const plain = await calculate(silenceAnswer('apathetic'));
    const withTicks = await calculate(
      silenceAnswer('apathetic', { answerId: 'A1', answerIds: ['A1', 'A2'] })
    );

    // Silence makes no positional claim, so the ticks must not leak into the
    // score or the labels.
    expect(withTicks.matches).toEqual(plain.matches);
    expect(withTicks.userDimCoords).toEqual(plain.userDimCoords);
    expect(withTicks.userLabels).toEqual([]);
  });

  it('still counts the silenced question in the averages', async () => {
    const res = await calculate(silenceAnswer('apathetic'));

    expect(res.matches).toHaveLength(2);
    for (const match of res.matches) {
      expect(match.matchPercentage).toBeGreaterThan(0);
      expect(Number.isFinite(match.matchPercentage)).toBe(true);
    }
    expect(res.familyMatches[0].matchPercentage).toBeGreaterThan(0);
  });

  it('keeps the legacy "skipped" answer on the neutral baseline', async () => {
    const res = await calculate(legacyAnswer('skipped'));

    // `skipped` used to look up no scoring row at all and fall back to 50 on
    // every axis; the neutral slot preserves that instead of erasing the question.
    expect(res.userDimCoords.theolconslib).toBe(50);
    expect(res.userDimCoords.supernat).toBe(50);
    expect(res.userLabels).toEqual([]);
    expect(res.matches).toHaveLength(2);
  });

  it('marks hostile silence harsher than apathetic silence', async () => {
    const apathetic = scoreOf(await calculate(silenceAnswer('apathetic')), 'D1');
    const hostile = scoreOf(await calculate(silenceAnswer('hostile')), 'D1');

    expect(hostile).toBeLessThan(apathetic);
  });
});
