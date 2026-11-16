import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

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

/** One well-formed submission; tests override the field they are interested in. */
const feedback = {
	sessionId: 'feedback-aaaaaaaa',
	rating: 4,
	accurate: true,
	comment: 'The Anglican match felt closer than I expected.',
	mode: 'quick',
	topMatchId: 'anglican',
	topMatchName: 'Anglican',
	answeredCount: 30,
	appVersion: 'v2.0',
} as Record<string, unknown>;

type StoredRow = {
	session_id: string | null;
	rating: number | null;
	accurate: number | null;
	comment: string | null;
	mode: string | null;
	top_match_id: string | null;
	top_match_name: string | null;
	answered_count: number | null;
	app_version: string | null;
	data_version: string | null;
	status: string;
	rating_metric: string;
};

async function storedRows(): Promise<StoredRow[]> {
	const { results } = await env.DB.prepare(
		`SELECT session_id, rating, accurate, comment, mode, top_match_id, top_match_name,
		        answered_count, app_version, data_version, status, rating_metric
		   FROM feedback ORDER BY id`
	).all<StoredRow>();
	return results ?? [];
}

async function countRows(): Promise<number> {
	const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM feedback').first<{
		count: number | null;
	}>();
	return Number(row?.count ?? 0);
}

async function getQueue(code?: string, query = ''): Promise<Response> {
	return dispatch(
		new IncomingRequest(`${API}/api/feedback${query}`, {
			headers: code === undefined ? {} : { 'X-Admin-Code': code },
		})
	);
}

describe('POST /api/feedback', () => {
	it('stores an anonymous submission with the context of the run', async () => {
		const response = await postFeedback(feedback);
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.data).toEqual({ recorded: true, sessionId: 'feedback-aaaaaaaa' });

		const rows = await storedRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			session_id: 'feedback-aaaaaaaa',
			rating: 4,
			accurate: 1,
			comment: 'The Anglican match felt closer than I expected.',
			mode: 'quick',
			top_match_id: 'anglican',
			top_match_name: 'Anglican',
			answered_count: 30,
			app_version: 'v2.0',
			// No app_meta row in the test database, so the stamp falls back.
			data_version: 'unknown',
			status: 'new',
			// The stars ask about the quiz experience; the row says so.
			rating_metric: 'experience',
		});
	});

	it('keeps "skipped" distinguishable from "no"', async () => {
		await postFeedback({ ...feedback, sessionId: 'feedback-no-0001', accurate: false });
		await postFeedback({ ...feedback, sessionId: 'feedback-yes-001', accurate: true });
		await postFeedback({ ...feedback, sessionId: 'feedback-skip-01', accurate: undefined });
		await postFeedback({ ...feedback, sessionId: 'feedback-junk-01', accurate: 'yes' });

		const rows = await storedRows();
		expect(rows.map((row) => row.accurate)).toEqual([0, 1, null, null]);
	});

	it('drops context it cannot use instead of refusing the rating', async () => {
		const response = await postFeedback({
			sessionId: 'feedback-partial-1',
			rating: 5,
			mode: 'marathon',
			answeredCount: 0,
			topMatchId: 'not an id',
			topMatchName: '',
			appVersion: 42,
		});
		expect(response.status).toBe(200);

		const rows = await storedRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			rating: 5,
			accurate: null,
			comment: null,
			mode: null,
			top_match_id: null,
			top_match_name: null,
			answered_count: null,
			app_version: null,
		});
	});

	it('treats a repeated session id as already recorded, not as a failure', async () => {
		const first = await postFeedback(feedback);
		const second = await postFeedback({ ...feedback, rating: 1, comment: 'changed my mind' });

		expect(((await first.json()) as any).data.recorded).toBe(true);
		const secondBody = (await second.json()) as any;
		expect(second.status).toBe(200);
		expect(secondBody.data.recorded).toBe(false);

		expect(await countRows()).toBe(1);
		const rows = await storedRows();
		expect(rows[0].rating).toBe(4);
		expect(rows[0].comment).toBe('The Anglican match felt closer than I expected.');
	});

	it('requires a rating between 1 and 5', async () => {
		const invalid = [0, 6, 2.5, '4', null, undefined];
		for (const rating of invalid) {
			const response = await postFeedback({ ...feedback, rating });
			expect(response.status, `rating ${JSON.stringify(rating)}`).toBe(400);
		}
		expect(await countRows()).toBe(0);
	});

	it('requires a session id it can deduplicate on', async () => {
		for (const sessionId of ['', 'short', 'has space here', 'x'.repeat(65), 12345]) {
			const response = await postFeedback({ ...feedback, sessionId });
			expect(response.status, `sessionId ${JSON.stringify(sessionId)}`).toBe(400);
		}
		expect(await countRows()).toBe(0);
	});

	it('truncates a long comment and strips control characters', async () => {
		await postFeedback({
			...feedback,
			comment: `\u0000${'a'.repeat(600)}\u0007`,
		});

		const rows = await storedRows();
		expect(rows[0].comment).toHaveLength(500);
		expect(rows[0].comment).not.toContain('\u0000');
		expect(rows[0].comment).not.toContain('\u0007');
	});

	it('stores whitespace-only prose as no comment at all', async () => {
		await postFeedback({ ...feedback, comment: '   \n  ' });
		const rows = await storedRows();
		expect(rows[0].comment).toBeNull();
	});

	it('rejects a body that is not JSON', async () => {
		const response = await dispatch(
			new IncomingRequest(`${API}/api/feedback`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not json',
			})
		);
		expect(response.status).toBe(400);
	});

	it('stops accepting submissions once the hourly cap is reached', async () => {
		const statements = Array.from({ length: 120 }, (_, index) =>
			env.DB.prepare('INSERT INTO feedback (session_id, rating) VALUES (?, 4)').bind(
				`cap-filler-${index}`
			)
		);
		await env.DB.batch(statements);

		const response = await postFeedback({ ...feedback, sessionId: 'cap-overflow-1' });
		expect(response.status).toBe(429);
		expect(await countRows()).toBe(120);
	});
});

describe('GET /api/feedback', () => {
	it('is closed without the moderator code', async () => {
		expect((await getQueue()).status).toBe(401);
		expect((await getQueue('wrong-code')).status).toBe(401);
	});

	it('returns the queue with per-status counts', async () => {
		await postFeedback({ ...feedback, sessionId: 'queue-first-01', rating: 5 });
		await postFeedback({
			...feedback,
			sessionId: 'queue-second-1',
			rating: 2,
			accurate: false,
			comment: 'The match missed the point.',
		});

		const response = await getQueue('mod');
		expect(response.status).toBe(200);

		const data = ((await response.json()) as any).data;
		expect(data.counts).toEqual({ new: 2, reviewed: 0, hidden: 0, commented: 2 });
		expect(data.feedback).toHaveLength(2);

		// Newest first, and the tri-state survives the round trip.
		expect(data.feedback[0]).toMatchObject({
			id: expect.any(Number),
			rating: 2,
			accurate: false,
			comment: 'The match missed the point.',
			status: 'new',
		});
		expect(data.feedback[1]).toMatchObject({ rating: 5, accurate: true });
		expect(data.feedback[0].createdAt).toEqual(expect.any(String));
	});

	it('filters by status and ignores a status it does not know', async () => {
		await postFeedback({ ...feedback, sessionId: 'status-hidden-1' });
		await postFeedback({ ...feedback, sessionId: 'status-visible-1' });
		await env.DB.prepare("UPDATE feedback SET status = 'hidden' WHERE session_id = ?")
			.bind('status-hidden-1')
			.run();

		const hidden = ((await (await getQueue('mod', '?status=hidden')).json()) as any).data;
		expect(hidden.feedback).toHaveLength(1);
		expect(hidden.feedback[0].sessionId).toBeUndefined();
		expect(hidden.counts).toEqual({ new: 1, reviewed: 0, hidden: 1, commented: 2 });

		const all = ((await (await getQueue('mod', '?status=nonsense')).json()) as any).data;
		expect(all.feedback).toHaveLength(2);
	});
});

describe('GET /api/feedback?commented=1', () => {
	it('keeps only the rows that said something', async () => {
		await postFeedback({ ...feedback, sessionId: 'note-with-0001' });
		await postFeedback({ ...feedback, sessionId: 'note-without-01', comment: undefined });
		await postFeedback({ ...feedback, sessionId: 'note-blank-001', comment: '   \n  ' });

		const data = ((await (await getQueue('mod', '?commented=1')).json()) as any).data;
		expect(data.feedback).toHaveLength(1);
		expect(data.feedback[0].comment).toBe('The Anglican match felt closer than I expected.');
		// `commented` is summed across every status, so it always matches this list.
		expect(data.counts).toEqual({ new: 3, reviewed: 0, hidden: 0, commented: 1 });
	});

	it('combines with the status filter and the limit', async () => {
		await postFeedback({ ...feedback, sessionId: 'combo-note-a-1' });
		await postFeedback({ ...feedback, sessionId: 'combo-note-b-1', comment: 'Second note.' });
		await postFeedback({ ...feedback, sessionId: 'combo-bare-001', comment: '' });
		await env.DB.prepare("UPDATE feedback SET status = 'reviewed' WHERE session_id = ?")
			.bind('combo-note-a-1')
			.run();

		const reviewed = ((await (await getQueue('mod', '?commented=1&status=reviewed')).json()) as any).data;
		expect(reviewed.feedback.map((row: any) => row.comment)).toEqual([
			'The Anglican match felt closer than I expected.',
		]);

		// Newest first still wins: the limit trims the end, it does not reorder.
		const limited = ((await (await getQueue('mod', '?commented=1&limit=1')).json()) as any).data;
		expect(limited.feedback).toHaveLength(1);
		expect(limited.feedback[0].comment).toBe('Second note.');
	});
});

describe('PATCH /api/feedback/:id', () => {
	function patchFeedback(id: number | string, body: unknown, code?: string): Promise<Response> {
		return dispatch(
			new IncomingRequest(`${API}/api/feedback/${id}`, {
				method: 'PATCH',
				headers:
					code === undefined
						? { 'Content-Type': 'application/json' }
						: { 'Content-Type': 'application/json', 'X-Admin-Code': code },
				body: typeof body === 'string' ? body : JSON.stringify(body),
			})
		);
	}

	async function idFor(sessionId: string): Promise<number> {
		const row = await env.DB.prepare('SELECT id FROM feedback WHERE session_id = ?')
			.bind(sessionId)
			.first<{ id: number | null }>();
		return Number(row?.id ?? 0);
	}

	async function publishedStats(): Promise<any> {
		const response = await dispatch(new IncomingRequest(`${API}/api/stats`));
		return ((await response.json()) as any).data.feedback;
	}

	it('is closed without the moderator code', async () => {
		await postFeedback(feedback);
		const id = await idFor('feedback-aaaaaaaa');

		expect((await patchFeedback(id, { status: 'reviewed' })).status).toBe(401);
		expect((await patchFeedback(id, { status: 'reviewed' }, 'wrong-code')).status).toBe(401);

		expect((await storedRows())[0].status).toBe('new');
	});

	it('moves a row between statuses and returns it', async () => {
		await postFeedback(feedback);
		const id = await idFor('feedback-aaaaaaaa');

		const response = await patchFeedback(id, { status: 'reviewed' }, 'mod');
		expect(response.status).toBe(200);
		expect(((await response.json()) as any).data).toMatchObject({
			id,
			status: 'reviewed',
			rating: 4,
			comment: 'The Anglican match felt closer than I expected.',
		});

		const queue = ((await (await getQueue('mod', '?status=reviewed')).json()) as any).data;
		expect(queue.feedback.map((row: any) => row.id)).toEqual([id]);
	});

	it('rejects a status it does not know, a bad body and an unknown id', async () => {
		await postFeedback(feedback);
		const id = await idFor('feedback-aaaaaaaa');

		expect((await patchFeedback(id, { status: 'published' }, 'mod')).status).toBe(400);
		expect((await patchFeedback(id, {}, 'mod')).status).toBe(400);
		expect((await patchFeedback(id, 'not json', 'mod')).status).toBe(400);
		expect((await patchFeedback(id + 999, { status: 'reviewed' }, 'mod')).status).toBe(404);
		expect((await patchFeedback('abc', { status: 'reviewed' }, 'mod')).status).toBe(400);

		expect((await storedRows())[0].status).toBe('new');
	});

	it('takes a hidden row out of the published average', async () => {
		await postFeedback({ ...feedback, sessionId: 'hide-low-0001', rating: 1, accurate: false });
		await postFeedback({ ...feedback, sessionId: 'hide-high-001', rating: 5, accurate: true });

		const before = await publishedStats();
		expect(before).toMatchObject({ total: 2, averageRating: 3, accurateYes: 1, accurateNo: 1 });

		const hiddenId = await idFor('hide-low-0001');
		expect((await patchFeedback(hiddenId, { status: 'hidden' }, 'mod')).status).toBe(200);

		// The aggregate is cached for a minute, so this only holds if the PATCH
		// dropped the cache. That is the point of `invalidateStatsCache()` there.
		const after = await publishedStats();
		expect(after).toMatchObject({ total: 1, averageRating: 5, accurateYes: 1, accurateNo: 0 });

		const counts = ((await (await getQueue('mod')).json()) as any).data.counts;
		expect(counts).toEqual({ new: 1, reviewed: 0, hidden: 1, commented: 2 });
	});
});


