/**
 * Roadmap endpoints.
 *
 *   GET    /api/roadmap             every phase with its tasks and status counts
 *   POST   /api/roadmap/unlock      validates the moderator code (no write)
 *   PATCH  /api/roadmap/tasks/:id   changes one task's status (mod only)
 *
 * Content comes from the spreadsheet and is loaded by roadmap_seed.sql; the only
 * writable column is `roadmap_tasks.status`. The moderator code is read from the
 * ADMIN_CODE secret and falls back to "mod" so a fresh clone works without
 * setup -- it is a speed bump, not authentication, and must not protect
 * anything sensitive.
 */

export const ROADMAP_STATUSES = [
  "not_started",
  "in_progress",
  "implemented_local",
  "implemented_live",
] as const;

export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

type RoadmapEnv = {
  DB: D1Database;
  ADMIN_CODE?: string;
};

const STATUS_SET = new Set<string>(ROADMAP_STATUSES);
const CACHE_TTL_MS = 30_000;

type CachedRoadmap = { payload: string; expiresAt: number };
let cachedRoadmap: CachedRoadmap | null = null;

/** Drop the in-isolate cache (called after a successful write, and by tests). */
export function invalidateRoadmapCache(): void {
  cachedRoadmap = null;
}

export function isRoadmapStatus(value: unknown): value is RoadmapStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

function emptyCounts(): Record<RoadmapStatus, number> {
  return {
    not_started: 0,
    in_progress: 0,
    implemented_local: 0,
    implemented_live: 0,
  };
}

function jsonError(error: string, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify({ error }), { status, headers });
}

/** Length-independent comparison so a wrong code cannot be timed character by character. */
function codesMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function expectedAdminCode(env: RoadmapEnv): string {
  const configured = env.ADMIN_CODE?.trim();
  return configured ? configured : "mod";
}

async function readAdminCode(request: Request): Promise<string> {
  const headerCode = request.headers.get("x-admin-code");
  if (headerCode) return headerCode;

  try {
    const body = (await request.json()) as { code?: unknown };
    return typeof body?.code === "string" ? body.code : "";
  } catch {
    return "";
  }
}

export async function handleGetRoadmap(env: RoadmapEnv, headers: HeadersInit): Promise<Response> {
  const now = Date.now();
  if (cachedRoadmap && cachedRoadmap.expiresAt > now) {
    return new Response(cachedRoadmap.payload, { headers });
  }

  const [phaseResult, taskResult] = await env.DB.batch([
    env.DB.prepare(
      "SELECT phase_index, title, label, goal FROM roadmap_phases ORDER BY phase_index"
    ),
    env.DB.prepare(
      `SELECT id, phase_index, task_index, sheet_id, name, description, type, owner_role, status, updated_at
       FROM roadmap_tasks
       ORDER BY phase_index, task_index`
    ),
  ]);

  const phases = (phaseResult.results ?? []).map((row: any) => ({
    index: Number(row.phase_index),
    title: String(row.title ?? ""),
    label: String(row.label ?? ""),
    goal: String(row.goal ?? ""),
    counts: emptyCounts(),
    tasks: [] as any[],
  }));

  const byIndex = new Map<number, (typeof phases)[number]>();
  for (const phase of phases) byIndex.set(phase.index, phase);

  const totals = { tasks: 0, byStatus: emptyCounts() };

  for (const row of (taskResult.results ?? []) as any[]) {
    const phase = byIndex.get(Number(row.phase_index));
    if (!phase) continue; // orphaned task: ignore rather than invent a phase

    const status: RoadmapStatus = isRoadmapStatus(row.status) ? row.status : "not_started";
    phase.counts[status] += 1;
    totals.byStatus[status] += 1;
    totals.tasks += 1;

    phase.tasks.push({
      id: String(row.id),
      displayId: `${row.phase_index}.${row.task_index}`,
      index: Number(row.task_index),
      sheetId: row.sheet_id ?? null,
      name: String(row.name ?? ""),
      description: String(row.description ?? ""),
      type: row.type ?? null,
      role: row.owner_role ?? null,
      status,
      updatedAt: row.updated_at ?? null,
    });
  }

  const payload = JSON.stringify({
    status: "success",
    data: { totals, phases },
    updatedAt: new Date().toISOString(),
  });

  cachedRoadmap = { payload, expiresAt: now + CACHE_TTL_MS };
  return new Response(payload, { headers });
}

export async function handleUnlockRoadmap(
  request: Request,
  env: RoadmapEnv,
  headers: HeadersInit
): Promise<Response> {
  let code = "";
  try {
    code = await readAdminCode(request);
  } catch {
    code = "";
  }

  if (!codesMatch(code, expectedAdminCode(env))) {
    return jsonError("Invalid access code.", 401, headers);
  }
  return new Response(JSON.stringify({ status: "success", data: { unlocked: true } }), { headers });
}

export async function handlePatchRoadmapTask(
  request: Request,
  env: RoadmapEnv,
  headers: HeadersInit,
  taskId: string
): Promise<Response> {
  if (!codesMatch(request.headers.get("x-admin-code") ?? "", expectedAdminCode(env))) {
    return jsonError("Invalid access code.", 401, headers);
  }

  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return jsonError("Expected a JSON body.", 400, headers);
  }

  if (!isRoadmapStatus(body?.status)) {
    return jsonError(`status must be one of: ${ROADMAP_STATUSES.join(", ")}`, 400, headers);
  }

  const result = await env.DB.prepare(
    "UPDATE roadmap_tasks SET status = ?, updated_at = datetime('now') WHERE id = ?"
  )
    .bind(body.status, taskId)
    .run();

  if (!result.meta || result.meta.changes === 0) {
    return jsonError(`No task with id "${taskId}".`, 404, headers);
  }

  invalidateRoadmapCache();

  const row = await env.DB.prepare(
    `SELECT id, phase_index, task_index, status, updated_at
     FROM roadmap_tasks WHERE id = ?`
  )
    .bind(taskId)
    .first<any>();

  return new Response(
    JSON.stringify({
      status: "success",
      data: {
        id: taskId,
        displayId: row ? `${row.phase_index}.${row.task_index}` : null,
        status: row?.status ?? body.status,
        updatedAt: row?.updated_at ?? null,
      },
    }),
    { headers }
  );
}
