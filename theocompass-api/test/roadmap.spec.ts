import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { invalidateRoadmapCache } from '../src/roadmap';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const API = 'https://example.com';

async function dispatch(request: Request): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

function patchTask(id: string, body: unknown, code?: string): Promise<Response> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (code !== undefined) headers['X-Admin-Code'] = code;
	return dispatch(
		new IncomingRequest(`${API}/api/roadmap/tasks/${id}`, {
			method: 'PATCH',
			headers,
			body: JSON.stringify(body),
		})
	);
}

/** Two phases, three tasks: one of each interesting status. */
async function seedRoadmap(): Promise<void> {
	const task = (id: string, phase: number, index: number, status: string) =>
		env.DB.prepare(
			`INSERT INTO roadmap_tasks (id, phase_index, task_index, sheet_id, name, description, type, owner_role, status)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).bind(id, phase, index, `${phase}.${index}`, `Task ${id}`, 'Description', 'Code', 'Verify it.', status);

	await env.DB.batch([
		env.DB.prepare(
			'INSERT INTO roadmap_phases (phase_index, title, label, goal) VALUES (0, ?, ?, ?)'
		).bind('Phase 0 — Beta Hardening', 'Beta Hardening', 'Fix immediate gaps.'),
		env.DB.prepare(
			'INSERT INTO roadmap_phases (phase_index, title, label, goal) VALUES (1, ?, ?, ?)'
		).bind('Phase 1 — Standard Mode', 'Standard Mode', 'Extend the quiz.'),
		task('p0-01', 0, 1, 'implemented_local'),
		task('p0-02', 0, 2, 'not_started'),
		task('p1-01', 1, 1, 'in_progress'),
	]);
}

beforeEach(async () => {
	invalidateRoadmapCache();
	await env.DB.batch([
		env.DB.prepare('DELETE FROM roadmap_tasks'),
		env.DB.prepare('DELETE FROM roadmap_phases'),
	]);
	await seedRoadmap();
});

describe('GET /api/roadmap', () => {
	it('returns phases in order with nested tasks and status counts', async () => {
		const response = await dispatch(new IncomingRequest(`${API}/api/roadmap`));
		expect(response.status).toBe(200);

		const body = (await response.json()) as any;
		expect(body.data.phases.map((phase: any) => phase.index)).toEqual([0, 1]);
		expect(body.data.phases[0].tasks.map((task: any) => task.displayId)).toEqual(['0.1', '0.2']);
		expect(body.data.phases[0].tasks[0]).toMatchObject({
			id: 'p0-01',
			status: 'implemented_local',
			type: 'Code',
			role: 'Verify it.',
		});
		expect(body.data.phases[0].counts).toMatchObject({ implemented_local: 1, not_started: 1 });
		expect(body.data.totals).toEqual({
			tasks: 3,
			byStatus: { not_started: 1, in_progress: 1, implemented_local: 1, implemented_live: 0 },
		});
	});
});

describe('PATCH /api/roadmap/tasks/:id', () => {
	it('rejects a missing or wrong moderator code and leaves the row untouched', async () => {
		expect((await patchTask('p0-02', { status: 'implemented_live' })).status).toBe(401);
		expect((await patchTask('p0-02', { status: 'implemented_live' }, 'not-the-code')).status).toBe(401);

		const row = await env.DB.prepare('SELECT status FROM roadmap_tasks WHERE id = ?')
			.bind('p0-02')
			.first<{ status: string }>();
		expect(row?.status).toBe('not_started');
	});

	it('updates the status with the moderator code and serves it on the next read', async () => {
		// Prime the isolate cache so the assertion also covers invalidation.
		await dispatch(new IncomingRequest(`${API}/api/roadmap`));

		const response = await patchTask('p0-02', { status: 'implemented_live' }, 'mod');
		expect(response.status).toBe(200);
		expect(((await response.json()) as any).data).toMatchObject({
			id: 'p0-02',
			displayId: '0.2',
			status: 'implemented_live',
		});

		const stored = await env.DB.prepare('SELECT status FROM roadmap_tasks WHERE id = ?')
			.bind('p0-02')
			.first<{ status: string }>();
		expect(stored?.status).toBe('implemented_live');

		const after = (await (await dispatch(new IncomingRequest(`${API}/api/roadmap`))).json()) as any;
		expect(after.data.phases[0].tasks[1].status).toBe('implemented_live');
		expect(after.data.totals.byStatus.implemented_live).toBe(1);
	});

	it('rejects an unknown status', async () => {
		const response = await patchTask('p0-02', { status: 'done' }, 'mod');
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: expect.stringContaining('not_started') });
	});

	it('reports an unknown task id', async () => {
		expect((await patchTask('p9-99', { status: 'implemented_live' }, 'mod')).status).toBe(404);
	});
});

describe('POST /api/roadmap/unlock', () => {
	const unlock = (body: unknown) =>
		dispatch(
			new IncomingRequest(`${API}/api/roadmap/unlock`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})
		);

	it('accepts the default code', async () => {
		const response = await unlock({ code: 'mod' });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ status: 'success' });
	});

	it('rejects everything else', async () => {
		expect((await unlock({ code: 'nope' })).status).toBe(401);
		expect((await unlock({})).status).toBe(401);
	});
});

describe('roadmap CORS', () => {
	it('advertises PATCH and the moderator header', async () => {
		const response = await dispatch(
			new IncomingRequest(`${API}/api/roadmap`, { method: 'OPTIONS' })
		);
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
		expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Admin-Code');
	});
});
