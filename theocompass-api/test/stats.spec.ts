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

function postFeedback(body: unknown): Promise<Response> {
	return dispatch(
		new IncomingRequest(`${API}/api/feedback`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
	);
}

/** One feedback row, written straight into the table: `/api/stats` only reads. */
async function seedFeedback(seed: {
	sessionId: string;
	rating: number | null;
	accurate?: number | null;
	/** How close the top match is to where the reader is (0008). Omitted for pre-0008 rows. */
	fitStance?: 'fit' | 'close' | 'off' | 'exploring' | null;
	/** Their own family's place in the family list (0007). Omitted for a pre-0007 row. */
	familyRank?: number | null;
	/** The closest denomination's place in the full list; 0 for "none of these are close". */
	matchRankPos?: number | null;
	comment?: string | null;
	status?: string;
	/** Which question the rating answered. Defaults to the current one. */
	ratingMetric?: 'experience' | 'fit';
}): Promise<void> {
	await env.DB.prepare(
		`INSERT INTO feedback
		   (session_id, rating, accurate, fit_stance, family_rank, match_rank_pos, comment, status,
		    rating_metric)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	)
		.bind(
			seed.sessionId,
			seed.rating,
			seed.accurate ?? null,
			seed.fitStance ?? null,
			seed.familyRank ?? null,
			seed.matchRankPos ?? null,
			seed.comment ?? null,
			seed.status ?? 'new',
			seed.ratingMetric ?? 'experience'
		)
		.run();
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
			feedback: {
				total: 0,
				averageRating: null,
				accurateYes: 0,
				accurateNo: 0,
				ratingHistogram: [0, 0, 0, 0, 0],
				matchJudged: 0,
				matchRanks: {
					counts: {},
					none: 0,
					ranked: 0,
					median: null,
					p25: null,
					p75: null,
					p90: null,
				},
				stanceJudged: 0,
				stanceCounts: { fit: 0, close: 0, off: 0, exploring: 0 },
			},
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

describe('feedback aggregates', () => {
	it('reports the count, the average and a five-bucket histogram', async () => {
		await seedFeedback({ sessionId: 'fb-one-000001', rating: 5, accurate: 1 });
		await seedFeedback({ sessionId: 'fb-two-000001', rating: 4, accurate: 1 });
		await seedFeedback({ sessionId: 'fb-three-0001', rating: 2, accurate: 0 });
		await seedFeedback({ sessionId: 'fb-four-00001', rating: 3 });

		const data = await getStats();
		expect(data.feedback).toEqual({
			total: 4,
			averageRating: 3.5,
			accurateYes: 2,
			accurateNo: 1,
			ratingHistogram: [0, 1, 1, 1, 1],
			// Rows seeded without a position are pre-0007 rows: they count in the
			// boolean split and in no bar.
			matchJudged: 0,
			matchRanks: {
				counts: {},
				none: 0,
				ranked: 0,
				median: null,
				p25: null,
				p75: null,
				p90: null,
			},
			// None of these four rows saw the stance question, so it has no
			// answers and no denominator.
			stanceJudged: 0,
			stanceCounts: { fit: 0, close: 0, off: 0, exploring: 0 },
		});
	});

	it('tallies the places people picked, and keeps hidden and legacy rows out', async () => {
		await seedFeedback({
			sessionId: 'fb-rank-first-01',
			rating: 5,
			accurate: 1,
			familyRank: 1,
			matchRankPos: 1,
		});
		await seedFeedback({
			sessionId: 'fb-rank-second-1',
			rating: 4,
			accurate: 0,
			familyRank: 1,
			matchRankPos: 3,
		});
		// The pickers cover the whole list now, so a deep place is a normal
		// answer rather than a bucket: #4 and #47 are both just places.
		await seedFeedback({
			sessionId: 'fb-rank-deep-001',
			rating: 3,
			accurate: 0,
			familyRank: 4,
			matchRankPos: 47,
		});
		await seedFeedback({
			sessionId: 'fb-rank-deepest-1',
			rating: 3,
			accurate: 0,
			familyRank: 18,
			matchRankPos: 140,
		});
		// The escape hatch: none of the listed denominations were close. It is an
		// answer, so it is counted -- outside `counts`, because it names no place
		// on the axis.
		await seedFeedback({
			sessionId: 'fb-rank-none-001',
			rating: 3,
			accurate: 0,
			familyRank: 0,
			matchRankPos: 0,
		});
		// Hidden: out of the tallies as well as out of the average.
		await seedFeedback({
			sessionId: 'fb-rank-hidden-1',
			rating: 1,
			accurate: 0,
			familyRank: 1,
			matchRankPos: 1,
			status: 'hidden',
		});
		// A pre-0007 "no": it is in accurateNo and in no tally, which is why the
		// two kinds of denominator differ on a real database.
		await seedFeedback({ sessionId: 'fb-rank-legacy-1', rating: 2, accurate: 0 });
		// The picker skipped: in neither tally, though the rating still counts.
		await seedFeedback({
			sessionId: 'fb-rank-skip-001',
			rating: 4,
			accurate: null,
			matchRankPos: null,
		});

		const data = await getStats();
		// Sorted places 1, 3, 47, 140: an even count takes the lower middle place
		// rather than averaging two places into one nobody could pick, and p90
		// has to travel all the way out to the one reader who picked #140.
		expect(data.feedback.matchRanks).toEqual({
			counts: { 1: 1, 3: 1, 47: 1, 140: 1 },
			none: 1,
			ranked: 4,
			median: 3,
			p25: 1,
			p75: 47,
			p90: 140,
		});
		expect(data.feedback.matchJudged).toBe(5);
		expect(data.feedback.accurateYes).toBe(1);
		expect(data.feedback.accurateNo).toBe(5);
		// Seven experience ratings in the average; the hidden 1* row is not one.
		expect(data.feedback.total).toBe(7);
	});

	it('counts the stance, and keeps "exploring" out of the accuracy split', async () => {
		await seedFeedback({ sessionId: 'fb-stance-fit-01', rating: 5, accurate: 1, fitStance: 'fit' });
		await seedFeedback({
			sessionId: 'fb-stance-close-1',
			rating: 4,
			accurate: 0,
			fitStance: 'close',
		});
		await seedFeedback({ sessionId: 'fb-stance-off-01', rating: 3, accurate: 0, fitStance: 'off' });
		// Judged here, and NULL in the accuracy split: no church to compare with.
		await seedFeedback({
			sessionId: 'fb-stance-explor',
			rating: 4,
			accurate: null,
			fitStance: 'exploring',
		});
		// Hidden rows move no figure at all, the stance included.
		await seedFeedback({
			sessionId: 'fb-stance-hidden',
			rating: 1,
			accurate: 0,
			fitStance: 'off',
			status: 'hidden',
		});
		// A pre-0008 row: it answers the accuracy question and none of the stance.
		await seedFeedback({ sessionId: 'fb-stance-legacy', rating: 2, accurate: 1 });

		const data = await getStats();
		expect(data.feedback.stanceJudged).toBe(4);
		expect(data.feedback.stanceCounts).toEqual({ fit: 1, close: 1, off: 1, exploring: 1 });
		// The two denominators differ by exactly the exploring row, which is the
		// point of the column: `exploring` is an answer, and not a miss.
		expect(data.feedback.accurateYes).toBe(2);
		expect(data.feedback.accurateNo).toBe(2);
		expect(data.feedback.total).toBe(5);
	});

	it('never publishes the comment, only numbers about it', async () => {
		await seedFeedback({
			sessionId: 'fb-comment-01',
			rating: 1,
			accurate: 0,
			comment: 'A sentence that must never reach the landing page.',
		});

		const response = await dispatch(new IncomingRequest(`${API}/api/stats`));
		const raw = await response.text();
		expect(raw).not.toContain('must never reach');
		expect(JSON.parse(raw).data.feedback.total).toBe(1);
	});

	it('leaves a hidden row out of the average without deleting it', async () => {
		await seedFeedback({ sessionId: 'fb-visible-01', rating: 5, accurate: 1 });
		await seedFeedback({ sessionId: 'fb-hidden-001', rating: 1, accurate: 0, status: 'hidden' });

		const data = await getStats();
		expect(data.feedback).toMatchObject({
			total: 1,
			averageRating: 5,
			accurateYes: 1,
			accurateNo: 0,
			ratingHistogram: [0, 0, 0, 0, 1],
		});

		const row = await env.DB.prepare(
			'SELECT rating FROM feedback WHERE session_id = ?'
		)
			.bind('fb-hidden-001')
			.first<{ rating: number }>();
		expect(row?.rating).toBe(1);
	});

	it('ignores a legacy row that scored something other than a rating', async () => {
		await seedFeedback({ sessionId: 'fb-legacy-0001', rating: null, accurate: 1 });
		await seedFeedback({ sessionId: 'fb-rated-00001', rating: 4 });

		const data = await getStats();
		expect(data.feedback).toMatchObject({
			total: 1,
			averageRating: 4,
			accurateYes: 0,
			ratingHistogram: [0, 0, 0, 1, 0],
		});
	});

	it('keeps match-fit ratings out of the average but in the accuracy split', async () => {
		// The stars used to ask how close the match felt. Those numbers answer a
		// different question, so they must not move the experience average -- but
		// their position answer is an answer to the question that is still being
		// asked, and neither position column is scoped by the rating metric.
		await seedFeedback({
			sessionId: 'fb-old-fit-001',
			rating: 1,
			accurate: 0,
			familyRank: 1,
			matchRankPos: 3,
			ratingMetric: 'fit',
		});
		await seedFeedback({
			sessionId: 'fb-new-exp-001',
			rating: 5,
			accurate: 1,
			familyRank: 1,
			matchRankPos: 1,
			ratingMetric: 'experience',
		});

		const data = await getStats();
		expect(data.feedback).toEqual({
			total: 1,
			averageRating: 5,
			accurateYes: 1,
			accurateNo: 1,
			ratingHistogram: [0, 0, 0, 0, 1],
			matchJudged: 2,
			matchRanks: {
				counts: { 1: 1, 3: 1 },
				none: 0,
				ranked: 2,
				median: 1,
				p25: 1,
				p75: 3,
				p90: 3,
			},
			// Neither row answered the stance question either (0008).
			stanceJudged: 0,
			stanceCounts: { fit: 0, close: 0, off: 0, exploring: 0 },
		});
	});

	it('invalidates the stats cache when new feedback lands', async () => {
		await getStats(); // prime the cache
		await postFeedback({ sessionId: 'fb-cache-00001', rating: 5 });
		expect((await getStats()).feedback.total).toBe(1);
	});
});
