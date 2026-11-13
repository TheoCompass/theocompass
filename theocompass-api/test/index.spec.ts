import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

/**
 * Data-free smoke tests.
 *
 * Everything here is answerable before the worker reads D1 or KV, so the suite
 * needs no seeded data and runs offline. The scoring maths is covered
 * separately by certainty-axis.spec.ts.
 */
async function dispatch(request: Request): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
	await waitOnExecutionContext(ctx);
	return response;
}

describe('worker routing', () => {
	it('answers the CORS preflight', async () => {
		const response = await dispatch(
			new IncomingRequest('https://example.com/api/calculate', { method: 'OPTIONS' })
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('falls back to the health check for unknown routes', async () => {
		const response = await dispatch(new IncomingRequest('https://example.com/'));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: 'TheoCompass API Active',
			version: '2.0',
		});
	});

	it('exposes the CORS headers the frontend relies on', async () => {
		const response = await dispatch(new IncomingRequest('https://example.com/'));
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
		expect(response.headers.get('Access-Control-Expose-Headers')).toContain('X-Compute-Time-ms');
	});
});

describe('POST /api/calculate - request validation', () => {
	it('rejects an empty payload before touching D1 or KV', async () => {
		const request = new IncomingRequest('https://example.com/api/calculate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});
		const response = await dispatch(request);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'No answers provided' });
	});

	it('behaves the same through the SELF integration binding', async () => {
		const response = await SELF.fetch('https://example.com/api/calculate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});
		expect(response.status).toBe(400);
	});
});

/**
 * The free-tier allowance runs out for the whole account, not for one request,
 * so these tests swap the D1 binding for one whose every query throws. What
 * matters is the contract: a depleted allowance has to reach the frontend as
 * 503 `D1_LIMIT_REACHED` -- which the quiz, roadmap and results screens turn
 * into an explanation -- and not as a generic 500 that blames the reader's
 * setup, nor as a happy 200 with empty data.
 */
const READ_LIMIT_MESSAGE =
	"D1_ERROR: Your account has exceeded D1's free tier daily row read limit. " +
	'Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. ' +
	'See https://developers.cloudflare.com/d1/platform/limits/ for more details.';

function throwingDb(message: string): D1Database {
	return {
		prepare() {
			throw new Error(message);
		},
		batch() {
			throw new Error(message);
		},
	} as unknown as D1Database;
}

async function dispatchWithDb(request: Request, db: D1Database): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, { ...env, DB: db }, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

describe('free-tier D1 quota', () => {
	it('answers /api/questions with the quota code instead of a SQL 500', async () => {
		const response = await dispatchWithDb(
			new IncomingRequest('https://example.com/api/questions?mode=quick'),
			throwingDb(READ_LIMIT_MESSAGE)
		);

		expect(response.status).toBe(503);
		const body = (await response.json()) as Record<string, unknown>;
		expect(body).toMatchObject({ code: 'D1_LIMIT_REACHED', scope: 'read' });
		// A parseable reset moment is what the UI turns into "returns at ...".
		expect(new Date(String(body.resetAt)).toISOString()).toBe(body.resetAt);
		expect(response.headers.get('Retry-After')).toMatch(/^\d+$/);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('answers a read through the router with the same code', async () => {
		const response = await dispatchWithDb(
			new IncomingRequest('https://example.com/api/alignment'),
			throwingDb(READ_LIMIT_MESSAGE)
		);

		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			code: 'D1_LIMIT_REACHED',
			scope: 'read',
			error: 'D1 free tier daily row read limit reached',
		});
	});

	it('still reports an ordinary database failure as a 500', async () => {
		const response = await dispatchWithDb(
			new IncomingRequest('https://example.com/api/alignment'),
			throwingDb('D1_ERROR: no such table: pairwise_alignments')
		);

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({ error: 'Database query failed' });
	});
});


