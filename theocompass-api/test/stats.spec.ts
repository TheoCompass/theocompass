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
			byMode: { quick: 0, standard: 0, deep: 0 },
			topFamilies: [],
			topMatches: [],
		});
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
