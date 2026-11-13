import { describe, expect, it } from 'vitest';
import {
	d1QuotaResponse,
	d1QuotaScope,
	nextUtcMidnight,
	secondsUntil,
} from '../src/d1-errors';

/**
 * The message Cloudflare documents for a depleted free-tier allowance. The
 * exact wording matters: `d1QuotaScope` is what stands between a reader and a
 * misleading "your database is broken" screen, so the real sentence is pinned
 * here rather than a convenient paraphrase.
 */
const READ_LIMIT =
	"D1_ERROR: Your account has exceeded D1's free tier daily row read limit. " +
	'Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. ' +
	'See https://developers.cloudflare.com/d1/platform/limits/ for more details.';

const WRITE_LIMIT = READ_LIMIT.replace('row read limit', 'row write limit');

describe('d1QuotaScope', () => {
	it('recognises the documented read-limit error', () => {
		expect(d1QuotaScope(new Error(READ_LIMIT))).toBe('read');
	});

	it('recognises the documented write-limit error', () => {
		expect(d1QuotaScope(new Error(WRITE_LIMIT))).toBe('write');
	});

	it('survives a reworded prefix, since Cloudflare owns the sentence', () => {
		expect(
			d1QuotaScope(new Error("Your account has exceeded D1's daily row read limit."))
		).toBe('read');
	});

	it('reads the message off the cause chain, which is where D1 wraps it', () => {
		const wrapped = new Error('D1_ERROR', { cause: new Error(READ_LIMIT) });
		expect(d1QuotaScope(wrapped)).toBe('read');
	});

	it('accepts a thrown string, which is what a stubbed binding throws', () => {
		expect(d1QuotaScope(WRITE_LIMIT)).toBe('write');
	});

	it('terminates on a self-referencing cause chain', () => {
		const loop: { message: string; cause?: unknown } = { message: 'D1_ERROR' };
		loop.cause = loop;
		expect(d1QuotaScope(loop)).toBeNull();
	});

	it.each([
		'D1_ERROR: Exceeded maximum DB size.',
		'D1_ERROR: no such table: pairwise_alignments',
		'Network connection lost.',
		'D1_ERROR: too many SQL variables at offset 31',
	])('leaves unrelated database failures alone: %s', (message) => {
		expect(d1QuotaScope(new Error(message))).toBeNull();
	});

	it('ignores values that are not errors at all', () => {
		expect(d1QuotaScope(null)).toBeNull();
		expect(d1QuotaScope(undefined)).toBeNull();
		expect(d1QuotaScope({})).toBeNull();
	});
});

describe('nextUtcMidnight', () => {
	it('returns the midnight that follows an afternoon', () => {
		expect(nextUtcMidnight(new Date('2026-11-13T18:00:00.000Z')).toISOString()).toBe(
			'2026-11-14T00:00:00.000Z'
		);
	});

	it('rolls past midnight itself, so a request at reset time waits a day', () => {
		expect(nextUtcMidnight(new Date('2026-11-14T00:00:00.000Z')).toISOString()).toBe(
			'2026-11-15T00:00:00.000Z'
		);
	});

	it('handles the last second of the day', () => {
		expect(nextUtcMidnight(new Date('2026-12-31T23:59:59.000Z')).toISOString()).toBe(
			'2027-01-01T00:00:00.000Z'
		);
	});
});

describe('secondsUntil', () => {
	it('counts to the reset', () => {
		expect(
			secondsUntil(new Date('2026-11-14T00:00:00.000Z'), new Date('2026-11-13T18:00:00.000Z'))
		).toBe(21600);
	});

	it('never reports zero, which would read as "retry immediately"', () => {
		expect(secondsUntil(new Date('2026-11-14T00:00:00.000Z'), new Date('2026-11-14T00:00:00.000Z'))).toBe(
			60
		);
	});
});

describe('d1QuotaResponse', () => {
	const now = new Date('2026-11-13T18:00:00.000Z');
	const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

	it('answers 503 with a stable code, the scope and the reset moment', async () => {
		const response = d1QuotaResponse('read', cors, now);

		expect(response.status).toBe(503);
		expect(response.headers.get('Retry-After')).toBe('21600');
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(await response.json()).toEqual({
			error: 'D1 free tier daily row read limit reached',
			code: 'D1_LIMIT_REACHED',
			scope: 'read',
			resetAt: '2026-11-14T00:00:00.000Z',
		});
	});

	it('keeps the CORS headers the frontend needs', () => {
		const response = d1QuotaResponse('write', cors, now);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(response.headers.get('Content-Type')).toBe('application/json');
	});

	it('names the write allowance when that is what ran out', async () => {
		const body = (await d1QuotaResponse('write', cors, now).json()) as {
			scope: string;
			error: string;
		};
		expect(body.scope).toBe('write');
		expect(body.error).toContain('row write limit');
	});
});
