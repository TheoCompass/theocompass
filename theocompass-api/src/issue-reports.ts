import { EmailMessage } from "cloudflare:email";

import { hasValidAdminCode } from "./roadmap";

/**
 * In-quiz "report an issue" flags, and the triage queue behind them.
 *
 *   POST  /api/issue-reports        file one report (anonymous, idempotent)
 *   GET   /api/issue-reports        the triage queue (moderator code)
 *   PATCH /api/issue-reports/:id    move one report through triage (moderator code)
 *
 * The row is the record and the notification is a courtesy. Storage comes
 * first: a report is counted, deduplicated by `flag_id`, re-read together with
 * its `data_version`, and closed as open -> triaged -> fixed -- none of which a
 * mail in an inbox can do. Only then, and only after the insert succeeded, does
 * `notifyIssueReport` try to tell the maintainer. It runs in `waitUntil` so the
 * reader never waits for it, it is wrapped so a mail failure cannot lose a
 * report, and it is a no-op when no channel is configured -- which is how the
 * test suite stays offline and how a deploy works before Email Routing is set
 * up.
 *
 * The reporter is anonymous by construction: the quiz never asks for an email,
 * so there is nothing to reply to and nowhere to send a confirmation. Nothing
 * identifying is stored either -- no IP, no user agent, no cookie. The free text
 * is the reporter's own note and is the only prose this endpoint accepts, capped
 * at NOTE_MAX characters; it is never sent to analytics.
 */

export const ISSUE_TYPES = ["typo", "bad_options", "framing", "other"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_REPORT_STATUSES = ["open", "triaged", "fixed", "wont_fix"] as const;
export type IssueReportStatus = (typeof ISSUE_REPORT_STATUSES)[number];

const QUIZ_MODES = ["quick", "standard", "deep"] as const;
type QuizMode = (typeof QUIZ_MODES)[number];

/** Room for one paragraph of context, not for an essay. */
const NOTE_MAX = 500;

/**
 * Per-question ceiling for one hour.
 *
 * A question is seen a few hundred times a day at most, and a real problem with
 * one question produces a handful of reports, not fifty. The cap costs one
 * indexed COUNT against a table that only ever holds reports, and it means the
 * open endpoint cannot be turned into a spam cannon even though it has no
 * Turnstile: `flag_id` stops a *retry* duplicating, this stops a *script*.
 */
const HOURLY_CAP_PER_QUESTION = 10;

/**
 * Envelope sender for report notifications.
 *
 * Must live on a zone in the same account with Email Routing enabled. Override
 * with `FLAG_EMAIL_FROM` if the address differs -- it is a var, not a secret.
 */
const FLAG_FROM_ADDRESS = "flags@theocompass.com";

/**
 * Where the notification lands: the mailbox Email Routing forwards to. It has to
 * be a verified destination address in the same Cloudflare account, and it is
 * already the public contact on the site, so nothing private is written here.
 */
const FLAG_TO_ADDRESS = "theocompass.project@gmail.com";

/**
 * The `send_email` binding, structurally typed so this file does not depend on
 * `wrangler types` having been re-run since the binding was declared.
 */
export type FlagMailer = { send(message: EmailMessage): Promise<unknown> };

type IssueReportEnv = {
  DB: D1Database;
  ADMIN_CODE?: string;
  FLAG_EMAIL?: FlagMailer;
  FLAG_EMAIL_FROM?: string;
  FLAG_EMAIL_TO?: string;
  FLAG_WEBHOOK_URL?: string;
};

function jsonError(error: string, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify({ error }), { status, headers });
}

function isIssueType(value: unknown): value is IssueType {
  return typeof value === "string" && (ISSUE_TYPES as readonly string[]).includes(value);
}

function isIssueReportStatus(value: unknown): value is IssueReportStatus {
  return typeof value === "string" && (ISSUE_REPORT_STATUSES as readonly string[]).includes(value);
}

function isQuizMode(value: unknown): value is QuizMode {
  return typeof value === "string" && (QUIZ_MODES as readonly string[]).includes(value);
}

/** Question and answer ids are `GOD_01`-shaped; anything else is not one of ours. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function optionalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return ID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Free text, with control characters removed (they only ever arrive from a
 * paste) and truncated rather than rejected: a long note is still a report.
 */
function optionalNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, NOTE_MAX);
}

function optionalIndex(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.trunc(value);
  return rounded >= 0 && rounded <= 500 ? rounded : null;
}

function optionalLabel(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

type IssueReportInput = {
  flagId: string;
  questionId: string;
  answerId: string | null;
  issueType: IssueType;
  note: string | null;
  mode: QuizMode | null;
  questionIndex: number | null;
  appVersion: string | null;
};

type ParseResult = { ok: true; value: IssueReportInput } | { ok: false; error: string };

/**
 * Three fields are required -- which screen, what is wrong, and an id that makes
 * the write idempotent. Everything else is context the client happens to know;
 * a junk optional field is dropped rather than rejected, the same bargain
 * `parseQuizEvent` makes, because refusing the whole report over a malformed
 * `appVersion` loses the one thing the reader wanted to tell us.
 */
export function parseIssueReport(body: unknown): ParseResult {
  const payload = (body ?? {}) as Record<string, unknown>;

  const flagId = typeof payload.flagId === "string" ? payload.flagId.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(flagId)) {
    return { ok: false, error: "flagId must be 8-64 characters of [A-Za-z0-9_-]." };
  }

  const questionId = optionalId(payload.questionId);
  if (!questionId) {
    return { ok: false, error: "questionId must be 1-64 characters of [A-Za-z0-9_-]." };
  }

  if (!isIssueType(payload.issueType)) {
    return { ok: false, error: `issueType must be one of: ${ISSUE_TYPES.join(", ")}.` };
  }

  return {
    ok: true,
    value: {
      flagId,
      questionId,
      answerId: optionalId(payload.answerId),
      issueType: payload.issueType,
      note: optionalNote(payload.note),
      mode: isQuizMode(payload.mode) ? payload.mode : null,
      questionIndex: optionalIndex(payload.questionIndex),
      appVersion: optionalLabel(payload.appVersion, 24),
    },
  };
}

async function countRecentReports(env: IssueReportEnv, questionId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM issue_reports
     WHERE question_id = ? AND created_at > datetime('now', '-1 hour')`
  )
    .bind(questionId)
    .first<{ count: number | null }>();
  return Number(row?.count ?? 0);
}

/**
 * The question and the option the report is about, for the notification body.
 *
 * Wrapped because it is the only query here that touches the reference tables:
 * a report filed against a question that a re-seed removed still gets stored,
 * it just arrives without the wording.
 */
async function lookupQuestionContext(
  env: IssueReportEnv,
  questionId: string,
  answerId: string | null
): Promise<{ questionText: string | null; answerText: string | null }> {
  try {
    const row = await env.DB.prepare(
      `SELECT q.full_text AS question_text, a.answer_text AS answer_text
         FROM questions q
         LEFT JOIN answer_options a ON a.id = ?
        WHERE q.id = ?`
    )
      .bind(answerId, questionId)
      .first<{ question_text: string | null; answer_text: string | null }>();

    return {
      questionText: row?.question_text ?? null,
      answerText: row?.answer_text ?? null,
    };
  } catch {
    return { questionText: null, answerText: null };
  }
}

export type StoredIssueReport = IssueReportInput & {
  id: number;
  dataVersion: string;
  questionText: string | null;
  answerText: string | null;
};

// ---------------------------------------------------------------------------
// Handlers (the public surface of this module). Validation and notification
// helpers follow.
// ---------------------------------------------------------------------------

/**
 * Files one report.
 *
 * `recorded: false` with HTTP 200 means "this exact report is already stored" --
 * a retry or a double tap, not a failure -- so the UI can say thank you either
 * way. A 429 means the question is being reported faster than a question can
 * plausibly go wrong; the UI offers the mailto fallback instead.
 */
export async function handlePostIssueReport(
  request: Request,
  env: IssueReportEnv,
  headers: HeadersInit,
  ctx: ExecutionContext,
  dataVersion: string
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected a JSON body.", 400, headers);
  }

  const parsed = parseIssueReport(body);
  if (!parsed.ok) {
    return jsonError(parsed.error, 400, headers);
  }

  const report = parsed.value;

  const recent = await countRecentReports(env, report.questionId);
  if (recent >= HOURLY_CAP_PER_QUESTION) {
    return jsonError(
      "Too many reports for this question in the last hour. Please try again later.",
      429,
      headers
    );
  }

  // Best effort: a report about a question that is no longer in the database is
  // still a real report, so a failed lookup enriches nothing and blocks nothing.
  const context = await lookupQuestionContext(env, report.questionId, report.answerId);

  const result = await env.DB.prepare(
    `INSERT INTO issue_reports
       (flag_id, question_id, answer_id, issue_type, note, mode, question_index,
        app_version, data_version, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', datetime('now'))
     ON CONFLICT(flag_id) DO NOTHING`
  )
    .bind(
      report.flagId,
      report.questionId,
      report.answerId,
      report.issueType,
      report.note,
      report.mode,
      report.questionIndex,
      report.appVersion,
      dataVersion
    )
    .run();

  const recorded = Boolean(result.meta && result.meta.changes > 0);
  const id = recorded && result.meta?.last_row_id != null ? Number(result.meta.last_row_id) : null;

  if (recorded && id !== null) {
    const stored: StoredIssueReport = {
      ...report,
      id,
      dataVersion,
      questionText: context.questionText,
      answerText: context.answerText,
    };

    ctx.waitUntil(
      notifyIssueReport(env, stored)
        .then(async (channel) => {
          if (!channel) return;
          await env.DB.prepare(
            "UPDATE issue_reports SET notified_at = datetime('now') WHERE id = ?"
          )
            .bind(id)
            .run();
        })
        .catch((error) => {
          // The report is already stored; a courtesy mail is not worth a 500.
          console.error("ISSUE REPORT NOTIFY FAILED:", error);
        })
    );
  }

  return new Response(JSON.stringify({ status: "success", data: { recorded, id } }), { headers });
}

type ReportRow = {
  id: number;
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
  created_at: string | null;
  updated_at: string | null;
};

const REPORT_COLUMNS = `id, question_id, answer_id, issue_type, note, mode, question_index,
                        app_version, data_version, status, notified_at, created_at, updated_at`;

function reportFrom(row: ReportRow) {
  return {
    id: Number(row.id),
    questionId: row.question_id,
    answerId: row.answer_id,
    issueType: row.issue_type,
    note: row.note,
    mode: row.mode,
    questionIndex: row.question_index,
    appVersion: row.app_version,
    dataVersion: row.data_version,
    status: row.status,
    notifiedAt: row.notified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The triage queue.
 *
 * Same lock as the roadmap editor: `X-Admin-Code`, which falls back to "mod" so
 * a fresh clone can read its own reports. It is a speed bump -- these rows hold
 * no personal data -- not authentication.
 */
export async function handleGetIssueReports(
  request: Request,
  env: IssueReportEnv,
  headers: HeadersInit
): Promise<Response> {
  if (!hasValidAdminCode(request, env)) {
    return jsonError("Invalid access code.", 401, headers);
  }

  const params = new URL(request.url).searchParams;
  const statusParam = params.get("status");
  const status = isIssueReportStatus(statusParam) ? statusParam : null;

  const rawLimit = Number(params.get("limit") ?? "");
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(200, Math.trunc(rawLimit)) : 50;

  const order = "ORDER BY created_at DESC, id DESC LIMIT ?";
  const [rows, counts] = await Promise.all([
    status
      ? env.DB.prepare(`SELECT ${REPORT_COLUMNS} FROM issue_reports WHERE status = ? ${order}`)
          .bind(status, limit)
          .all<ReportRow>()
      : env.DB.prepare(`SELECT ${REPORT_COLUMNS} FROM issue_reports ${order}`)
          .bind(limit)
          .all<ReportRow>(),
    env.DB.prepare("SELECT status, COUNT(*) AS count FROM issue_reports GROUP BY status").all<{
      status: string;
      count: number;
    }>(),
  ]);

  const byStatus: Record<string, number> = {};
  for (const name of ISSUE_REPORT_STATUSES) byStatus[name] = 0;
  for (const row of counts.results ?? []) {
    byStatus[String(row.status)] = Number(row.count ?? 0);
  }

  return new Response(
    JSON.stringify({
      status: "success",
      data: { counts: byStatus, reports: (rows.results ?? []).map(reportFrom) },
    }),
    { headers }
  );
}

/** Moves one report through triage. `status` is the only writable column. */
export async function handlePatchIssueReport(
  request: Request,
  env: IssueReportEnv,
  headers: HeadersInit,
  id: number
): Promise<Response> {
  if (!hasValidAdminCode(request, env)) {
    return jsonError("Invalid access code.", 401, headers);
  }

  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return jsonError("Expected a JSON body.", 400, headers);
  }

  if (!isIssueReportStatus(body?.status)) {
    return jsonError(`status must be one of: ${ISSUE_REPORT_STATUSES.join(", ")}`, 400, headers);
  }

  const result = await env.DB.prepare(
    "UPDATE issue_reports SET status = ?, updated_at = datetime('now') WHERE id = ?"
  )
    .bind(body.status, id)
    .run();

  if (!result.meta || result.meta.changes === 0) {
    return jsonError(`No report with id ${id}.`, 404, headers);
  }

  const row = await env.DB.prepare(
    `SELECT ${REPORT_COLUMNS} FROM issue_reports WHERE id = ?`
  )
    .bind(id)
    .first<ReportRow>();

  return new Response(
    JSON.stringify({ status: "success", data: row ? reportFrom(row) : { id, status: body.status } }),
    { headers }
  );
}

// ---------------------------------------------------------------------------
// Notification. Best effort, and only after the row is already safe.
// ---------------------------------------------------------------------------

export type NotifyChannel = "email" | "webhook" | null;

const TYPE_LABELS: Record<IssueType, string> = {
  typo: "typo or wording",
  bad_options: "wrong or missing options",
  framing: "loaded framing",
  other: "something else",
};

/** The human-readable half of a report: what the maintainer needs to act on it. */
export function formatReportText(report: StoredIssueReport): string {
  const lines = [
    `Question ${report.questionId}${report.mode ? ` (${report.mode} mode)` : ""}${
      report.questionIndex !== null ? `, position ${report.questionIndex + 1}` : ""
    }`,
  ];

  if (report.questionText) lines.push(`Wording: ${report.questionText}`);
  if (report.answerText) lines.push(`Selected option: ${report.answerText}`);
  else if (report.answerId) lines.push(`Selected option id: ${report.answerId}`);

  lines.push(`Problem: ${TYPE_LABELS[report.issueType]}`);
  lines.push(report.note ? `Note: ${report.note}` : "Note: (none)");
  lines.push("");
  lines.push(
    `Report #${report.id} - open - data ${report.dataVersion}${
      report.appVersion ? ` - app ${report.appVersion}` : ""
    }`
  );

  return lines.join("\n");
}

/**
 * The raw RFC 5322 message.
 *
 * Every header here earns its place: `send_email` rejects a message with no
 * `Message-ID` ("invalid message-id"), `Date` keeps a mail client from inventing
 * one, and `MIME-Version`/`Content-Type` are what make the body arrive as
 * readable text instead of an attachment. Exported because the string is the
 * contract -- the two things that ever broke this feature both lived here.
 */
export function rawEmail(from: string, to: string, subject: string, body: string): string {
  const domain = from.split("@")[1] || "theocompass.com";
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "",
    body,
  ].join("\r\n");
}

/**
 * Tells the maintainer a report exists, over whichever channel is configured.
 *
 * Email first: `EmailMessage` comes from the `cloudflare:email` module (it is
 * not a global, and the module is present even with no binding declared), and
 * the destination must already be a verified Email Routing address, which is
 * what keeps an open endpoint from becoming a relay. The webhook is the fallback
 * for an account whose domain is not on Cloudflare yet -- same text, one POST.
 * With neither configured this resolves to null and the caller stores nothing
 * about it, so a report filed while notifications are broken is still sitting in
 * D1 waiting to be read.
 */
export async function notifyIssueReport(
  env: IssueReportEnv,
  report: StoredIssueReport
): Promise<NotifyChannel> {
  const body = formatReportText(report);
  const subject = `[TheoCompass] ${report.issueType} - ${report.questionId}`;

  if (env.FLAG_EMAIL) {
    try {
      const from = env.FLAG_EMAIL_FROM?.trim() || FLAG_FROM_ADDRESS;
      const to = env.FLAG_EMAIL_TO?.trim() || FLAG_TO_ADDRESS;
      await env.FLAG_EMAIL.send(
        new EmailMessage(from, to, rawEmail(from, to, subject, body))
      );
      return "email";
    } catch (error) {
      console.error("ISSUE REPORT EMAIL FAILED:", error);
    }
  }

  const webhook = env.FLAG_WEBHOOK_URL?.trim();
  if (webhook) {
    try {
      const target = new URL(webhook);
      if (target.protocol === "https:") {
        await fetch(target.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // `content` is what Discord reads; `text` suits the rest.
          body: JSON.stringify({
            content: `${subject}\n\n${body}`,
            text: `${subject}\n\n${body}`,
            title: subject,
            questionId: report.questionId,
            issueType: report.issueType,
            reportId: report.id,
          }),
        });
        return "webhook";
      }
      console.error("ISSUE REPORT WEBHOOK IGNORED: not an https URL.");
    } catch (error) {
      console.error("ISSUE REPORT WEBHOOK FAILED:", error);
    }
  }

  // Saying nothing is what let a dead mail channel look healthy for a week, so
  // the reason this report was not announced is always stated. The report is
  // already in D1: this is a note to whoever is watching the logs, not a failure.
  console.warn(
    env.FLAG_EMAIL || webhook
      ? "ISSUE REPORT NOT NOTIFIED: every configured channel failed."
      : "ISSUE REPORT NOT NOTIFIED: neither the FLAG_EMAIL binding nor FLAG_WEBHOOK_URL is configured."
  );
  return null;
}
