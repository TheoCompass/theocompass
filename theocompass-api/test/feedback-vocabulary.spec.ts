import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { resetVocabularyCache, vocabularyFrom } from '../src/vocabulary';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const API = 'https://example.com';

async function dispatch(request: Request): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

function postFeedback(body: unknown): Promise<Response> {
	return dispatch(
		new IncomingRequest(`${API}/api/feedback`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
	);
}

/**
 * A bundle small enough to reason about, and shaped like the real one: three
 * families and four churches, one of them spelled the way the older generator
 * wrote it (`denominationname` instead of `name`, see the results page's
 * `meta.name || meta.denominationname`), because both spellings are on cards
 * that are open in someone's browser.
 */
const BUNDLE = {
	families: {
		'Apostolic & Early Christianity': { family: 'Apostolic & Early Christianity' },
		Lutheran: { family: 'Lutheran' },
		Reformed: { family: 'Reformed' },
	},
	denominations: {
		DENOM_001: {
			denomination: {
				name: 'The Apostolic Church (Early Church)',
				family: 'Apostolic & Early Christianity',
			},
		},
		DENOM_002: { denomination: { name: 'Lutheran', family: 'Lutheran' } },
		DENOM_003: { denomination: { name: 'Reformed Baptist', family: 'Reformed' } },
		DENOM_004: { denomination: { denominationname: 'Legacy spelling', family: 'Reformed' } },
	},
};

/** One plausible submission; every case overrides the fields it is about. */
const feedback = {
	sessionId: 'names-aaaaaaaa',
	rating: 4,
	mode: 'quick',
} as Record<string, unknown>;

async function storedPositions(): Promise<Array<[number | null, number | null, number | null]>> {
	const { results } = await env.DB.prepare(
		'SELECT family_rank, match_rank_pos, accurate FROM feedback ORDER BY id'
	).all<{ family_rank: number | null; match_rank_pos: number | null; accurate: number | null }>();
	return (results ?? []).map((row) => [row.family_rank, row.match_rank_pos, row.accurate]);
}

async function storedRatings(): Promise<Array<number | null>> {
	const { results } = await env.DB.prepare('SELECT rating FROM feedback ORDER BY id').all<{
		rating: number | null;
	}>();
	return (results ?? []).map((row) => row.rating);
}

/**
 * A position is a place in a list, and the card sends the names on the buttons
 * beside it so the worker can check *which* list. Everything here is about that
 * check: what it narrows, what it leaves alone, and what happens when the bundle
 * cannot be read at all.
 */
describe('POST /api/feedback with the lists the card printed', () => {
	beforeEach(async () => {
		// Before each case, not once: the last case deletes the bundle to stand in
		// for a worker that cannot read it, and re-seeding keeps every case
		// independent of the order the file runs in. The cache is module state and
		// outlives each test's storage, so it is cleared alongside the write.
		await env.THEOCOMPASS_CACHE.put('denomination_profiles', JSON.stringify(BUNDLE));
		resetVocabularyCache();
	});

	it('accepts a position that names a real row, and stores the number alone', async () => {
		const response = await postFeedback({
			...feedback,
			familyName: 'lutheran',
			familyRank: 2,
			matchName: 'Lutheran',
			matchRankPos: 2,
			matchRankScope: 4,
		});
		expect(response.status).toBe(200);

		expect(await storedPositions()).toEqual([[2, 2, 0]]);

		// The labels are context, not answers: no column holds one.
		const row = await env.DB.prepare('SELECT * FROM feedback').first<Record<string, unknown>>();
		expect(Object.values(row ?? {})).not.toContain('Lutheran');
	});

	it('drops a position whose list this data does not have', async () => {
		const response = await postFeedback({
			...feedback,
			familyName: 'Manichaeism',
			familyRank: 1,
			matchName: 'The Church of the Flying Spaghetti Monster',
			matchRankPos: 1,
		});
		// The rating is the submission; the position is context and is what goes.
		expect(response.status).toBe(200);
		expect(await storedRatings()).toEqual([4]);
		expect(await storedPositions()).toEqual([[null, null, null]]);
	});

	it('reads the older spelling of a church name too', async () => {
		await postFeedback({
			...feedback,
			matchName: 'Legacy spelling',
			matchRankPos: 3,
			matchRankScope: 4,
		});
		expect(await storedPositions()).toEqual([[null, 3, 0]]);
	});

	it('bounds a position by the list it names, not by the card defaults', async () => {
		// Four is well inside `FAMILY_RANK_MAX` (64) but past the three families
		// this data has, so an unnamed fourth family is still not a place in a
		// list: the bundle bounds the position, not the fallback constant.
		await postFeedback({ ...feedback, sessionId: 'names-three-01', familyRank: 4 });
		// Four is the last church; five is past it, and no scope is needed to see it.
		await postFeedback({ ...feedback, sessionId: 'names-four-001', matchRankPos: 4 });
		await postFeedback({ ...feedback, sessionId: 'names-five-001', matchRankPos: 5 });

		expect(await storedPositions()).toEqual([
			[null, null, null],
			[null, 4, 0],
			[null, null, null],
		]);
	});

	it('drops a position past the length the card printed', async () => {
		await postFeedback({
			...feedback,
			sessionId: 'names-scope-01',
			matchRankPos: 3,
			matchRankScope: 2,
		});
		// A scope this data cannot read is not evidence of anything, so the
		// position keeps its own bounds instead of being thrown away with it.
		await postFeedback({
			...feedback,
			sessionId: 'names-scope-02',
			matchRankPos: 3,
			matchRankScope: 0,
		});
		await postFeedback({
			...feedback,
			sessionId: 'names-scope-03',
			matchRankPos: 3,
			matchRankScope: 999,
		});
		await postFeedback({
			...feedback,
			sessionId: 'names-scope-04',
			matchRankPos: 3,
			matchRankScope: '3',
		});

		expect(await storedPositions()).toEqual([
			[null, null, null],
			[null, 3, 0],
			[null, 3, 0],
			[null, 3, 0],
		]);
	});

	it('keeps a church that sits under a family other than the one named', async () => {
		// The two answers are statements about two lists, so they are allowed to
		// disagree: a reader who mis-picked their family still knows their own
		// church. This used to be the case where the church was thrown away.
		await postFeedback({
			...feedback,
			sessionId: 'names-cross-01',
			familyName: 'Lutheran',
			familyRank: 1,
			matchName: 'Reformed Baptist',
			matchRankPos: 2,
		});
		// Same answer with the scope the card now sends -- the length of the full
		// results list -- survives for the same reason.
		await postFeedback({
			...feedback,
			sessionId: 'names-cross-02',
			familyName: 'Lutheran',
			familyRank: 1,
			matchName: 'Reformed Baptist',
			matchRankPos: 2,
			matchRankScope: 4,
		});
		expect(await storedPositions()).toEqual([
			[1, 2, 0],
			[1, 2, 0],
		]);
	});

	it('leaves a body with no names alone, names being optional context', async () => {
		await postFeedback({ ...feedback, familyRank: 1, matchRankPos: 1 });
		await postFeedback({
			...feedback,
			sessionId: 'names-none-001',
			fitStance: 'fit',
			matchName: 'Lutheran',
			matchRankPos: 1,
		});
		expect(await storedPositions()).toEqual([
			[1, 1, 1],
			[null, 1, 1],
		]);
	});

	it('keeps the numbers on a worker that cannot read the bundle', async () => {
		await env.THEOCOMPASS_CACHE.delete('denomination_profiles');
		resetVocabularyCache();

		await postFeedback({
			...feedback,
			familyName: 'Anything',
			familyRank: 1,
			matchName: 'Anything else',
			matchRankPos: 1,
		});
		// The numeric bounds are all that is left, exactly as before the names
		// existed -- a bundle that cannot be read must not stop the card working.
		expect(await storedPositions()).toEqual([[1, 1, 1]]);
	});
});

describe('vocabularyFrom', () => {
	it('indexes names case- and whitespace-insensitively, both spellings included', () => {
		const vocabulary = vocabularyFrom(BUNDLE);
		expect(vocabulary.families.get('lutheran')).toBe('Lutheran');
		expect(vocabulary.denominations.get('legacy spelling')).toBe('Legacy spelling');
	});

	it('knows nothing about a document it cannot read', () => {
		for (const document of [null, undefined, 42, 'profiles', [], { denominators: {} }]) {
			const vocabulary = vocabularyFrom(document);
			expect(vocabulary.families.size).toBe(0);
			expect(vocabulary.denominations.size).toBe(0);
		}
	});

	it('indexes a church without needing its family to be listed', () => {
		// The two lists are read independently: a denomination whose family is not
		// in `families` is still a church the card printed, and the handler has no
		// reason to care which family it sits in.
		const vocabulary = vocabularyFrom({
			families: { Lutheran: {} },
			denominations: { X: { denomination: { name: 'Somewhere', family: 'Missing family' } } },
		});
		expect(vocabulary.denominations.get('somewhere')).toBe('Somewhere');
		expect(vocabulary.families.get('missing family')).toBeUndefined();
	});
});
