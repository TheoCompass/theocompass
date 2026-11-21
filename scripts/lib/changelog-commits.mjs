/**
 * Reading the Git history, shared by the changelog build and the Reddit digest.
 *
 * Two consumers, one definition. `build_changelog.mjs` writes the snapshot the
 * `/changelog` page renders; `reddit_digest.mjs` drafts the weekly post from the
 * same entries. If each carried its own copy of `toEntry`, the page and the post
 * could disagree about whether `chore(ci)` is a change — and the post would be
 * the one that is wrong in public.
 *
 * Nothing here touches the page's output files, so a digest can never rewrite
 * the snapshot, and `build_changelog.mjs --check` remains the only guard.
 *
 * Two sources, merged by SHA:
 *
 *   1. `git log` in the working copy. It is exact for the commit being built —
 *      a Pages build can start seconds after a push, before the REST API has
 *      indexed HEAD, and a changelog missing the commit it was built from is
 *      worse than no changelog.
 *   2. `GET /repos/TheoCompass/theocompass/commits`. A Pages checkout can be
 *      shallow, so `git log` alone would truncate.
 *
 * The repository is public, so the API needs no token; `GITHUB_TOKEN` is
 * honoured when present but never required.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

/** The repository root: this file lives in `scripts/lib/`. */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const REPO = "TheoCompass/theocompass";
export const BRANCH = "main";

const GIT_DEPTH = 300;
const MAX_API_PAGES = 3;
const API_PAGE_SIZE = 100;

/** Types that never lead the page. */
export const HOUSEKEEPING_TYPES = new Set(["chore", "ci", "build"]);
/** Merge commits GitHub and `git merge` write by themselves carry no content. */
const NOISE_MERGE = /^Merge (pull request|branch|remote-tracking|chore)/i;
/** `feat(scope)!: subject` — the shape every commit in this repo already uses. */
export const CONVENTIONAL = /^([A-Za-z]+)(?:\(([^)]+)\))?!?:\s+(.+)$/;
/** `Task: p1-03` / `Tasks: 1.3, p2-07` — the only manual input this page needs. */
const TASK_TRAILER = /^Tasks?:\s*(.+)$/i;
const DROPPED_TRAILER = /^(Co-authored-by|Signed-off-by):/i;

// --- the roadmap, for `Task:` trailer resolution --------------------------

/**
 * Task lookups from `data/roadmap.json`: by `id` ("p0-01") and by the sheet's
 * own numbering ("0.1"), because both are natural to type in a commit body.
 */
export function loadTasks(root = ROOT, warn = () => {}) {
  const byId = new Map();
  const bySheetId = new Map();
  const roadmapJson = join(root, "data", "roadmap.json");

  if (!existsSync(roadmapJson)) {
    warn("data/roadmap.json is missing; Task: trailers cannot resolve");
    return { byId, bySheetId };
  }

  let data;
  try {
    data = JSON.parse(readFileSync(roadmapJson, "utf8"));
  } catch (error) {
    warn(`data/roadmap.json is unreadable (${error.message})`);
    return { byId, bySheetId };
  }

  for (const phase of data.phases ?? []) {
    for (const task of phase.tasks ?? []) {
      if (!task?.id) continue;
      const ref = {
        id: String(task.id),
        label: String(task.sheetId ?? task.id),
        name: String(task.name ?? ""),
      };
      byId.set(ref.id.toLowerCase(), ref);
      bySheetId.set(ref.label.toLowerCase(), ref);
    }
  }

  return { byId, bySheetId };
}

// --- reading the history ---------------------------------------------------

/** `git log`, or nothing when git/the checkout is unavailable. */
export function readGitLog({ root = ROOT, depth = GIT_DEPTH, warn = () => {} } = {}) {
  const format = "%H%x1f%cI%x1f%P%x1f%s%x1f%b%x1e";
  let raw;
  try {
    raw = execFileSync("git", ["log", "-n", String(depth), `--format=${format}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    warn(`git log unavailable (${error.code ?? error.message}); using the API alone`);
    return [];
  }

  return raw
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, date, parents, subject, body] = record.split("\x1f");
      return {
        sha,
        date,
        parents: parents ? parents.split(" ").filter(Boolean) : [],
        subject,
        body: body ?? "",
      };
    })
    .filter((commit) => /^[0-9a-f]{40}$/i.test(commit.sha ?? ""));
}

function httpsJson(url, headers) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} — ${text.slice(0, 180)}`));
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(new Error(`unparseable JSON — ${error.message}`));
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(15_000, () => request.destroy(new Error("timed out")));
  });
}

export async function readGitHub() {
  const commits = [];
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "theocompass-changelog-build",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  for (let page = 1; page <= MAX_API_PAGES; page += 1) {
    const url =
      `https://api.github.com/repos/${REPO}/commits` +
      `?sha=${encodeURIComponent(BRANCH)}&per_page=${API_PAGE_SIZE}&page=${page}`;
    const payload = await httpsJson(url, headers);
    if (!Array.isArray(payload)) throw new Error("unexpected payload: not a list of commits");

    for (const item of payload) {
      const message = String(item?.commit?.message ?? "");
      const newline = message.indexOf("\n");
      commits.push({
        sha: String(item?.sha ?? ""),
        date: String(item?.commit?.committer?.date ?? item?.commit?.author?.date ?? ""),
        parents: (item?.parents ?? []).map((parent) => String(parent?.sha ?? "")),
        subject: newline === -1 ? message : message.slice(0, newline),
        body: newline === -1 ? "" : message.slice(newline + 1),
      });
    }

    if (payload.length < API_PAGE_SIZE) break;
  }

  return commits;
}

// --- turning a commit into an entry ---------------------------------------

/**
 * One row of the page.
 *
 * `lead` is the commit's own opening paragraph — that is the "why" the page
 * shows — but the trailers this site uses for its own bookkeeping are removed,
 * so `Task: p1-03` becomes a chip instead of a stray line of YAML-ish text.
 * Author emails are never carried over: the repo is public and the page has no
 * reason to republish them.
 */
export function toEntry(commit, tasks, unresolved) {
  const rawSubject = String(commit.subject ?? "").trim();
  const parents = commit.parents ?? [];

  let type = "change";
  let scope = null;
  let subject = rawSubject;

  const conventional = CONVENTIONAL.exec(rawSubject);
  if (conventional) {
    type = conventional[1].toLowerCase();
    scope = conventional[2] ? conventional[2].trim() : null;
    subject = conventional[3].trim();
  } else if (/^Merge\b/.test(rawSubject)) {
    type = "merge";
  }

  const refs = [];
  const kept = [];

  for (const line of String(commit.body ?? "").split("\n")) {
    const trailer = TASK_TRAILER.exec(line.trim());
    if (trailer) {
      for (const token of trailer[1].split(/[,\s]+/).filter(Boolean)) {
        const key = token.replace(/^#/, "").toLowerCase();
        const ref = tasks.byId.get(key) ?? tasks.bySheetId.get(key);
        if (ref) {
          if (!refs.some((known) => known.id === ref.id)) refs.push(ref);
        } else {
          unresolved.add(token);
        }
      }
      continue;
    }
    if (DROPPED_TRAILER.test(line.trim())) continue;
    kept.push(line);
  }

  // Only the opening paragraph travels. The rest of the message is one click
  // away on GitHub, and these bodies are essays: rendering all of them (twice,
  // once as HTML and once as the RSC payload) took a 580 KB page for prose
  // nobody reads from a list.
  const opening = kept.join("\n").trim().split(/\n\s*\n/)[0] ?? "";
  // A body that opens with a list has no opening paragraph to quote. The whole
  // list read as one run-on sentence would be worse than the subject above it,
  // so the first item -- with its wrapped lines -- stands in for it.
  const quoted = /^\s*[-*]\s+/.test(opening) ? opening.split(/\n(?=[-*]\s)/)[0] : opening;
  const lead = quoted
    .replace(/^\s*[-*]\s+/, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();

  // A commit without a parsable date is not worth failing a build over; the
  // epoch keeps the sort stable and makes the bad row obvious.
  const parsed = new Date(commit.date);
  const date = Number.isNaN(parsed.getTime()) ? "1970-01-01T00:00:00.000Z" : parsed.toISOString();
  const sha = String(commit.sha);

  return {
    sha,
    short: sha.slice(0, 7),
    date,
    type,
    scope,
    subject,
    lead,
    tasks: refs,
    merge: parents.length > 1,
    housekeeping:
      HOUSEKEEPING_TYPES.has(type) || (type === "merge" && NOISE_MERGE.test(rawSubject)),
    url: `https://github.com/${REPO}/commit/${sha}`,
  };
}

/** Newest first, ties broken by SHA so two sources cannot reorder each other. */
export function compare(left, right) {
  if (left.date !== right.date) return left.date < right.date ? 1 : -1;
  return left.sha < right.sha ? 1 : -1;
}

/**
 * Everything both scripts need, in one call: the merged, sorted entries.
 *
 * `label` prefixes the progress lines, so the digest's output never claims to
 * be the changelog build's. Failures stay soft, exactly as before: a missing
 * `git`, a rate-limited API or an unreadable roadmap degrades to fewer entries
 * rather than a thrown exception.
 */
export async function collectEntries({
  offline = false,
  label = "changelog",
  root = ROOT,
  log = () => {},
  warn = () => {},
} = {}) {
  const tasks = loadTasks(root, warn);
  const bySha = new Map();

  if (!offline) {
    try {
      const remote = await readGitHub();
      for (const commit of remote) {
        if (/^[0-9a-f]{40}$/i.test(commit.sha)) bySha.set(commit.sha, commit);
      }
      log(`${label}: ${bySha.size} commits from the GitHub API`);
    } catch (error) {
      warn(`${error.message} — keeping the API side empty`);
    }
  }

  // The working copy wins: it has HEAD the moment the build starts, and its
  // `%s`/`%b` are byte-exact where the API rewrites whitespace.
  const local = readGitLog({ root, warn });
  for (const commit of local) bySha.set(commit.sha, commit);
  log(`${label}: ${local.length} commits from git log`);

  const unresolved = new Set();
  const entries = [...bySha.values()].map((commit) => toEntry(commit, tasks, unresolved));
  entries.sort(compare);

  return { entries, unresolved, apiCount: bySha.size - local.length, gitCount: local.length };
}
