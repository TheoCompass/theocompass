import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import type { EmailMessage } from 'cloudflare:email';
import { beforeEach, afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import worker from '../src/index';
import { formatReportText, notifyIssueReport, rawEmail, type StoredIssueReport } from '../src/issue-reports';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const API = 'https://example.com';

async function dispatch(request: Request): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

function postReport(body: unknown): Promise<Response> {
	return dispatch(
		new IncomingRequest(`${API}/api/issue-reports`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
	);
}

/** One well-formed report; tests override the field they are interested in. */
const report = {
	flagId: 'flag-aaaaaaaa',
	questionId: 'GOD_01',
	issueType: 'typo',
	note: 'Missing a word in the second sentence.',
	mode: 'quick',
	questionIndex: 4,
	appVersion: 'v2.0',
} as Record<string, unknown>;

async function getQueue(code?: string): Promise<Response> {
	return dispatch(
		new IncomingRequest(`${API}/api/issue-reports`, {
			headers: code === undefined ? {} : { 'X-Admin-Code': code },
		})
	);
}

function patchReport(id: string | number, body: unknown, code?: string): Promise<Response> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (code !== undefined) headers['X-Admin-Code'] = code;
	return dispatch(
		new IncomingRequest(`${API}/api/issue-reports/${id}`, {
			method: 'PATCH',
			headers,
			body: JSON.stringify(body),
		})
	);
}

type StoredRow = {
	flag_id: string | null;
	question_id: string;
	answer_id: string | null;
	issue_type: string;
	note: string | null;
	mode: string | null;
	question_index: number | null;
	app_version: string | null;
	data_version: string | null;
	status: string;
	notified_at: string | null;
};

function storedRow(flagId: string): Promise<StoredRow | null> {
	return env.DB.prepare(
		`SELECT flag_id, question_id, answer_id, issue_type, note, mode, question_index,
		        app_version, data_version, status, notified_at
		 FROM issue_reports WHERE flag_id = ?`
	)
		.bind(flagId)
		.first<StoredRow>();
}

/** Bulk insert so a test can reach the per-question hourly ceiling. */
async function seedReports(questionId: string, count: number, createdAt?: string): Promise<void> {
	const statements = [];
	for (let index = 0; index < count; index += 1) {
		statements.push(
			env.DB.prepare(
				`INSERT INTO issue_reports (flag_id, question_id, issue_type, status, created_at)
				 VALUES (?, ?, 'typo', 'open', COALESCE(?, datetime('now')))`
			).bind(`seed-${questionId}-${index}`, questionId, createdAt ?? null)
		);
	}
	await env.DB.batch(statements);
}

/** SQLite `datetime('now')` format, in UTC, N hours back. */
function hoursAgo(hours: number): string {
	return new Date(Date.now() - hours * 3_600_000).toISOString().slice(0, 19).replace('T', ' ');
}

/** `console.warn` as the suite silences it in `beforeEach`. */
let warnSpy: MockInstance<(...args: unknown[]) => void>;

beforeEach(async () => {
	await env.DB.prepare('DELETE FROM issue_reports').run();
	// A report that is not announced now says so in the log, once per report,
	// which would bury a real failure in the output. The route tests below have
	// the binding and never warn; the `notifyIssueReport` unit tests drive the
	// unconfigured and broken-channel cases on purpose and read this spy.
	warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('POST /api/issue-reports', () => {
	it('stores the report with its context and leaves it open', async () => {
		const response = await postReport(report);
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.data.recorded).toBe(true);
		expect(typeof body.data.id).toBe('number');

		const row = await storedRow('flag-aaaaaaaa');
		expect(row).toMatchObject({
			question_id: 'GOD_01',
			issue_type: 'typo',
			note: 'Missing a word in the second sentence.',
			mode: 'quick',
			question_index: 4,
			app_version: 'v2.0',
			// No app_meta row in the test database, so the stamp falls back.
			data_version: 'unknown',
			status: 'open',
			// `send_email` is declared in wrangler.jsonc, so this runtime has the
			// binding and workerd accepts the message: the row is stamped. Turning
			// the binding off is therefore a red test, which is the whole point --
			// a silently absent channel is what made a week of reports look filed.
			notified_at: expect.any(String),
		});
	});

	it('records a retried flag id once', async () => {
		expect(((await (await postReport(report)).json()) as any).data.recorded).toBe(true);

		// A dropped response and a double tap both replay the same flag id.
		const duplicate = await postReport({ ...report, note: 'changed my mind' });
		expect(duplicate.status).toBe(200);
		expect(((await duplicate.json()) as any).data.recorded).toBe(false);

		const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM issue_reports').first<{
			count: number;
		}>();
		expect(count?.count).toBe(1);
	});

	it('keeps a second, different report for the same question', async () => {
		await postReport(report);
		const second = await postReport({ ...report, flagId: 'flag-bbbbbbbb', issueType: 'framing' });
		expect(((await second.json()) as any).data.recorded).toBe(true);
	});

	it('truncates a long note and drops junk optional fields', async () => {
		const response = await postReport({
			...report,
			flagId: 'flag-longnote',
			note: 'x'.repeat(900),
			mode: 'epic',
			questionIndex: -3,
			appVersion: 'a'.repeat(100),
			answerId: 'not an id!',
		});
		expect(((await response.json()) as any).data.recorded).toBe(true);

		const row = await storedRow('flag-longnote');
		expect(row?.note).toHaveLength(500);
		expect(row?.mode).toBeNull();
		expect(row?.question_index).toBeNull();
		expect(row?.answer_id).toBeNull();
		expect(row?.app_version).toHaveLength(24);
	});

	it('stores a report with no note at all', async () => {
		const response = await postReport({ ...report, flagId: 'flag-nonote', note: '   ' });
		expect(((await response.json()) as any).data.recorded).toBe(true);
		expect((await storedRow('flag-nonote'))?.note).toBeNull();
	});

	it('rejects a missing or malformed required field', async () => {
		expect((await postReport({ ...report, flagId: 'short' })).status).toBe(400);
		expect((await postReport({ ...report, flagId: 42 })).status).toBe(400);
		expect((await postReport({ ...report, questionId: '' })).status).toBe(400);
		expect((await postReport({ ...report, questionId: 'GOD 01!' })).status).toBe(400);
		expect((await postReport({ ...report, issueType: 'rant' })).status).toBe(400);
		expect((await postReport({ ...report, issueType: undefined })).status).toBe(400);
	});

	it('rejects a non-JSON body', async () => {
		const response = await dispatch(
			new IncomingRequest(`${API}/api/issue-reports`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not json',
			})
		);
		expect(response.status).toBe(400);
	});

	it('caps one question at ten reports an hour', async () => {
		await seedReports('GOD_01', 10);

		const blocked = await postReport({ ...report, flagId: 'flag-overcap' });
		expect(blocked.status).toBe(429);
		expect(await storedRow('flag-overcap')).toBeNull();

		// Another question still accepts reports: the cap is per question, not
		// per client (the endpoint has no way to know who is calling).
		const elsewhere = await postReport({
			...report,
			flagId: 'flag-other',
			questionId: 'CHR_02',
		});
		expect(((await elsewhere.json()) as any).data.recorded).toBe(true);
	});

	it('ignores reports from more than an hour ago when capping', async () => {
		await seedReports('GOD_01', 10, hoursAgo(2));

		const response = await postReport({ ...report, flagId: 'flag-next-hour' });
		expect(((await response.json()) as any).data.recorded).toBe(true);
	});
});

describe('GET /api/issue-reports', () => {
	it('refuses the queue without the moderator code', async () => {
		await postReport(report);

		expect((await getQueue()).status).toBe(401);
		expect((await getQueue('wrong-code')).status).toBe(401);
	});

	it('returns the queue newest first with status counts', async () => {
		await postReport(report);
		await postReport({ ...report, flagId: 'flag-cccccccc', issueType: 'other', questionId: 'CHR_02' });

		const response = await getQueue('mod');
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.data.reports).toHaveLength(2);
		expect(body.data.reports[0].questionId).toBe('CHR_02');
		expect(body.data.reports[0]).toMatchObject({
			issueType: 'other',
			status: 'open',
			dataVersion: 'unknown',
		});
		expect(body.data.counts).toEqual({ open: 2, triaged: 0, fixed: 0, wont_fix: 0 });
	});

	it('filters by status and caps the page size', async () => {
		await postReport(report);
		await postReport({ ...report, flagId: 'flag-dddddddd' });
		await patchReport(1, { status: 'fixed' }, 'mod');

		const fixed = (await (await getQueue('mod')).json()) as any;
		expect(fixed.data.counts).toMatchObject({ open: 1, fixed: 1 });

		const filtered = await dispatch(
			new IncomingRequest(`${API}/api/issue-reports?status=fixed&limit=5`, {
				headers: { 'X-Admin-Code': 'mod' },
			})
		);
		const body = (await filtered.json()) as any;
		expect(body.data.reports).toHaveLength(1);
		expect(body.data.reports[0].status).toBe('fixed');
	});
});

describe('PATCH /api/issue-reports/:id', () => {
	it('moves a report through triage', async () => {
		const created = (await (await postReport(report)).json()) as any;
		const id = created.data.id;

		const response = await patchReport(id, { status: 'triaged' }, 'mod');
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.data).toMatchObject({ id, status: 'triaged' });
		expect(body.data.updatedAt).toBeTruthy();

		const row = await storedRow('flag-aaaaaaaa');
		expect(row?.status).toBe('triaged');
	});

	it('rejects a status outside the triage vocabulary', async () => {
		const created = (await (await postReport(report)).json()) as any;

		expect((await patchReport(created.data.id, { status: 'ignored' }, 'mod')).status).toBe(400);
		expect((await patchReport(created.data.id, {}, 'mod')).status).toBe(400);
		expect((await patchReport(created.data.id, { status: 'fixed' }, 'mod')).status).toBe(200);
	});

	it('requires the moderator code', async () => {
		const created = (await (await postReport(report)).json()) as any;

		expect((await patchReport(created.data.id, { status: 'fixed' })).status).toBe(401);
		expect((await storedRow('flag-aaaaaaaa'))?.status).toBe('open');
	});

	it('404s on an unknown id and 400s on a non-numeric one', async () => {
		expect((await patchReport(9999, { status: 'fixed' }, 'mod')).status).toBe(404);
		expect((await patchReport('latest', { status: 'fixed' }, 'mod')).status).toBe(400);
	});
});

const stored: StoredIssueReport = {
	id: 7,
	flagId: 'flag-aaaaaaaa',
	questionId: 'GOD_01',
	answerId: 'GOD_01_A',
	issueType: 'bad_options',
	note: 'There is no fourth option.',
	mode: 'quick',
	questionIndex: 3,
	appVersion: 'v2.0',
	dataVersion: '2026.03.01-abcdef',
	questionText: 'How do you understand the Trinity?',
	answerText: 'One being, three persons.',
};

describe('issue report notification', () => {
	it('writes the wording, the option and the note into the message', () => {
		const text = formatReportText(stored);

		expect(text).toContain('Question GOD_01 (quick mode), position 4');
		expect(text).toContain('Wording: How do you understand the Trinity?');
		expect(text).toContain('Selected option: One being, three persons.');
		expect(text).toContain('Problem: wrong or missing options');
		expect(text).toContain('Note: There is no fourth option.');
		expect(text).toContain('Report #7 - open - data 2026.03.01-abcdef - app v2.0');
	});

	it('says so when the report carried no note', () => {
		expect(formatReportText({ ...stored, note: null, answerText: null })).toContain(
			'Note: (none)'
		);
		expect(formatReportText({ ...stored, note: null, answerText: null })).toContain(
			'Selected option id: GOD_01_A'
		);
	});

	it('says in the log why a report was not announced', async () => {
		expect(await notifyIssueReport({ DB: env.DB }, stored)).toBeNull();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('neither the FLAG_EMAIL binding')
		);

		// A channel that was configured and failed has a different reason, and
		// saying "not configured" there would send the reader looking for the
		// wrong thing -- which is exactly how the dead mail channel survived a
		// week of reports.
		warnSpy.mockClear();
		expect(
			await notifyIssueReport(
				{
					DB: env.DB,
					FLAG_EMAIL: {
						send: async () => {
							throw new Error('destination not verified');
						},
					},
				},
				stored
			)
		).toBeNull();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('every configured channel failed')
		);
	});

	it('builds a message workerd will accept', () => {
		const message = rawEmail('flags@theocompass.com', 'me@example.com', 'Subject', 'Body');

		// `send_email` refuses a message without a Message-ID, and the id has to be
		// unique per send, so this is not decoration.
		expect(message).toMatch(/^Message-ID: <[0-9a-f-]{36}@theocompass\.com>$/m);
		expect(message).not.toBe(
			rawEmail('flags@theocompass.com', 'me@example.com', 'Subject', 'Body')
		);
		expect(message).toContain('From: flags@theocompass.com');
		expect(message).toContain('To: me@example.com');
		expect(message).toContain('MIME-Version: 1.0');
		expect(message).toContain('Content-Type: text/plain; charset="utf-8"');
		// Header block, blank line, body -- in that order.
		expect(message.split('\r\n\r\n')[1]).toBe('Body');
	});

	it('sends one plain-text mail through the FLAG_EMAIL binding', async () => {
		const sent: EmailMessage[] = [];

		const channel = await notifyIssueReport(
			{ DB: env.DB, FLAG_EMAIL: { send: async (message) => void sent.push(message) } },
			stored
		);

		expect(channel).toBe('email');
		expect(sent).toHaveLength(1);
		// Built from the `cloudflare:email` module export, not from a global: with
		// the old global lookup `send` was never called at all.
		expect(sent[0].from).toBe('flags@theocompass.com');
		expect(sent[0].to).toBe('theocompass.project@gmail.com');
	});

	it('honours the address overrides', async () => {
		const sent: EmailMessage[] = [];

		await notifyIssueReport(
			{
				DB: env.DB,
				FLAG_EMAIL: { send: async (message) => void sent.push(message) },
				FLAG_EMAIL_FROM: 'noreply@theocompass.com',
				FLAG_EMAIL_TO: 'someone@example.com',
			},
			stored
		);

		expect(sent[0].from).toBe('noreply@theocompass.com');
		expect(sent[0].to).toBe('someone@example.com');
	});

	it('falls back to the webhook when the mail binding fails', async () => {
		const calls: string[] = [];
		vi.stubGlobal('fetch', async (input: RequestInfo) => {
			calls.push(String(input));
			return new Response('ok');
		});

		try {
			const channel = await notifyIssueReport(
				{
					DB: env.DB,
					FLAG_EMAIL: {
						send: async () => {
							throw new Error('destination not verified');
						},
					},
					FLAG_WEBHOOK_URL: 'https://example.com/hook',
				},
				stored
			);

			expect(channel).toBe('webhook');
			expect(calls).toEqual(['https://example.com/hook']);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('posts to the webhook when one is set', async () => {
		const calls: Array<{ url: string; body: string }> = [];
		vi.stubGlobal('fetch', async (input: RequestInfo, init?: RequestInit) => {
			calls.push({ url: String(input), body: String(init?.body ?? '') });
			return new Response('ok');
		});

		try {
			const channel = await notifyIssueReport(
				{ DB: env.DB, FLAG_WEBHOOK_URL: 'https://example.com/hook' },
				stored
			);

			expect(channel).toBe('webhook');
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe('https://example.com/hook');
			expect(JSON.parse(calls[0].body)).toMatchObject({
				questionId: 'GOD_01',
				issueType: 'bad_options',
				reportId: 7,
			});
			expect(calls[0].body).toContain('There is no fourth option.');
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('refuses a webhook that is not https', async () => {
		vi.stubGlobal('fetch', async () => {
			throw new Error('should not be called');
		});

		try {
			expect(
				await notifyIssueReport({ DB: env.DB, FLAG_WEBHOOK_URL: 'http://example.com/hook' }, stored)
			).toBeNull();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
