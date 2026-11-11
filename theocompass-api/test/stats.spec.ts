import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { invalidateStatsCache } from '../src/quiz-stats';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const API = 'https://example.com';

async function dispatch(request: Request): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

function postEvent(body: unknown): Promise<Response> {
	return dispatch(
		new IncomingRequest(`${API}/api/quiz/events`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
	);
}

async function getStats(): Promise<any> {
	const response = await dispatch(new IncomingRequest(`${API}/api/stats`));
	expect(response.status).toBe(200);
	return ((await response.json()) as any).data;
}

const event = {
	sessionId: 'session-aaaaaaaa',
	mode: 'quick',
	answeredCount: 20,
	topFamily: 'Protestant',
	topMatchId: 'anglican',
	topMatchName: 'Anglican',
	topMatchScore: 88.5,
	userTolerance: 60,
	userCertainty: 55,
};

type SeedEvent = {
	sessionId: string;
	createdAt?: string;
	topFamily?: string | null;
	topMatchName?: string | null;
	topMatchScore?: number | null;
	userTolerance?: number | null;
	userCertainty?: number | null;
};

/** Direct insert so a test can backdate rows and leave optional columns empty. */
async function seedEvent(seed: SeedEvent): Promise<void> {
	await env.DB.prepare(
		`INSERT INTO quiz_events
		   (session_id, mode, top_family, top_match_id, top_match_name, top_match_score,
		    answered_count, user_tolerance, user_certainty, data_version, created_at)
		 VALUES (?, 'quick', ?, ?, ?, ?, 10, ?, ?, 'test', COALESCE(?, datetime('now')))`
	)
		.bind(
			seed.sessionId,
			seed.topFamily ?? null,
			seed.topMatchName ? seed.topMatchName.toLowerCase() : null,
			seed.topMatchName ?? null,
			seed.topMatchScore ?? null,
			seed.userTolerance ?? null,
			seed.userCertainty ?? null,
			seed.createdAt ?? null
		)
		.run();
}

/** SQLite `datetime('now')` format, in UTC, N days back. */
function daysAgo(days: number): string {
	return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
}

beforeEach(() => {
	invalidateStatsCache();
});

describe('GET /api/stats', () => {
	it('reports zeros before anything is recorded', async () => {
		const data = await getStats();
		expect(data).toMatchObject({
			totalQuizzes: 0,
			today: 0,
			last7Days: 0,
			trackingSince: null,
			avgTopMatch: null,
			medianTopMatch: null,
			byMode: { quick: 0, standard: 0, deep: 0 },
			topFamilies: [],
			topMatches: [],
			scoreSample: 0,
			familySample: 0,
			matchSample: 0,
			distinctFamilies: 0,
			posture: { tolerance: null, certainty: null, sample: 0 },
		});
		expect(data.daily).toHaveLength(14);
		expect(data.daily.every((day: { count: number }) => day.count === 0)).toBe(true);
		expect(data.scoreHistogram).toEqual(new Array(20).fill(0));
	});
});

describe('aggregate breakdowns', () => {
	it('buckets scores and reports a median that ignores a single outlier', async () => {
		const scores = [0, 4.9, 5, 89.9, 90, 95, 100];
		for (const [index, score] of scores.entries()) {
			await seedEvent({ sessionId: `histogram-${index}`, topMatchScore: score });
		}

		const data = await getStats();
		expect(data.scoreSample).toBe(7);
		expect(data.avgTopMatch).toBe(55);
		expect(data.medianTopMatch).toBe(89.9);

		const histogram: number[] = data.scoreHistogram;
		expect(histogram).toHaveLength(20);
		expect(histogram[0]).toBe(2); // 0 and 4.9
		expect(histogram[1]).toBe(1); // 5
		expect(histogram[17]).toBe(1); // 89.9
		expect(histogram[18]).toBe(1); // 90
		expect(histogram[19]).toBe(2); // 95 and 100
		expect(histogram.reduce((sum, count) => sum + count, 0)).toBe(7);
	});

	it('averages the two middle scores for an even count', async () => {
		for (const [index, score] of [40, 60, 80, 90].entries()) {
			await seedEvent({ sessionId: `even-${index}`, topMatchScore: score });
		}

		const data = await getStats();
		expect(data.medianTopMatch).toBe(70); // (60 + 80) / 2
		expect(data.avgTopMatch).toBe(67.5);
	});

	it('zero-fills the 14 UTC days and counts calendar days for last7Days', async () => {
		await seedEvent({ sessionId: 'daily-today', createdAt: daysAgo(0) });
		await seedEvent({ sessionId: 'daily-three', createdAt: daysAgo(3) });
		await seedEvent({ sessionId: 'daily-eight', createdAt: daysAgo(8) });
		await seedEvent({ sessionId: 'daily-twenty', createdAt: daysAgo(20) });

		const data = await getStats();
		expect(data.totalQuizzes).toBe(4);
		expect(data.today).toBe(1);
		expect(data.last7Days).toBe(2);
		expect(data.daily).toHaveLength(14);
		expect(data.daily.reduce((sum: number, day: { count: number }) => sum + day.count, 0)).toBe(3);
		expect(data.daily.at(-1).count).toBe(1); // today
		expect(data.daily.at(-4).count).toBe(1); // three days ago
	});

	it('keeps one denominator per breakdown', async () => {
		await seedEvent({ sessionId: 'samples-posture', userTolerance: 40, userCertainty: 80 });
		await seedEvent({ sessionId: 'samples-tolerance', userTolerance: 90 });
		await seedEvent({
			sessionId: 'samples-score',
			topFamily: 'Protestant',
			topMatchName: 'Anglican',
			topMatchScore: 70,
		});

		const data = await getStats();
		expect(data.posture).toEqual({ tolerance: 40, certainty: 80, sample: 1 });
		expect(data.familySample).toBe(1);
		expect(data.matchSample).toBe(1);
		expect(data.distinctFamilies).toBe(1);
		expect(data.scoreSample).toBe(1);
		expect(data.medianTopMatch).toBe(70);
		expect(data.scoreHistogram[14]).toBe(1); // 70 / 5
	});
});

describe('POST /api/quiz/events', () => {
	it('records a completion once per session id', async () => {
		const first = await postEvent(event);
		expect(first.status).toBe(200);
		expect(((await first.json()) as any).data.recorded).toBe(true);

		// A retry or a reloaded results page must not inflate the counters.
		const duplicate = await postEvent({ ...event, topMatchName: 'Baptist' });
		expect(((await duplicate.json()) as any).data.recorded).toBe(false);

		const second = await postEvent({ ...event, sessionId: 'session-bbbbbbbb', mode: 'deep' });
		expect(((await second.json()) as any).data.recorded).toBe(true);

		const data = await getStats();
		expect(data.totalQuizzes).toBe(2);
		expect(data.today).toBe(2);
		expect(data.byMode).toMatchObject({ quick: 1, deep: 1, standard: 0 });
		expect(data.topMatches).toEqual([{ name: 'Anglican', count: 2 }]);
		expect(data.topFamilies).toEqual([{ name: 'Protestant', count: 2 }]);
		expect(data.avgTopMatch).toBe(88.5);
		expect(data.medianTopMatch).toBe(88.5);
		expect(data.scoreSample).toBe(2);
		expect(data.scoreHistogram[17]).toBe(2);
		expect(data.familySample).toBe(2);
		expect(data.matchSample).toBe(2);
		expect(data.distinctFamilies).toBe(1);
		expect(data.posture).toEqual({ tolerance: 60, certainty: 55, sample: 2 });
		expect(data.last7Days).toBe(2);
		expect(data.daily.at(-1).count).toBe(2);
	});

	it('invalidates the stats cache when a new run lands', async () => {
		await getStats(); // prime the cache
		await postEvent(event);
		expect((await getStats()).totalQuizzes).toBe(1);
	});

	it('drops invalid optional fields instead of rejecting the event', async () => {
		const response = await postEvent({ ...event, topMatchScore: 999, userTolerance: 'high' });
		expect(((await response.json()) as any).data.recorded).toBe(true);

		const row = await env.DB.prepare(
			'SELECT top_match_score, user_tolerance FROM quiz_events WHERE session_id = ?'
		)
			.bind(event.sessionId)
			.first<{ top_match_score: number; user_tolerance: number | null }>();
		expect(row?.top_match_score).toBe(100);
		expect(row?.user_tolerance).toBeNull();
	});

	it('rejects a malformed session id, mode or answer count', async () => {
		expect((await postEvent({ ...event, sessionId: 'short' })).status).toBe(400);
		expect((await postEvent({ ...event, sessionId: 'bad session id!' })).status).toBe(400);
		expect((await postEvent({ ...event, mode: 'epic' })).status).toBe(400);
		expect((await postEvent({ ...event, answeredCount: 0 })).status).toBe(400);
	});

	it('rejects a non-JSON body', async () => {
		const response = await dispatch(
			new IncomingRequest(`${API}/api/quiz/events`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not json',
			})
		);
		expect(response.status).toBe(400);
	});
});
