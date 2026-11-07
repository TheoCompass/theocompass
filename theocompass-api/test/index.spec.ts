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

