#!/usr/bin/env node
/**
 * Draft the weekly r/TheoCompass post from the changelog's own history.
 *
 * This script **does not post anything**. It reads the same entries
 * `build_changelog.mjs` writes (`scripts/lib/changelog-commits.mjs`, one
 * definition of "a product change" shared by both), selects the week's work,
 * and writes a Markdown draft to `output/` — title, grouped bullets, a closing
 * question. You read it, edit what the script cannot know, and paste it.
 *
 * That is a deliberate ceiling. Posting needs a Reddit OAuth token; a script app
 * needs the account password, and the password grant breaks the moment 2FA is
 * on. An unattended bot also has no way to notice that the third bullet reads
 * badly in public. The selection is the part worth automating; the judgement is
 * not.
 *
 * What stays human, on purpose: the title and the closing question. The script
 * proposes both and says so.
 *
 * Usage:
 *   node scripts/reddit_digest.mjs                      # draft since the last post
 *   node scripts/reddit_digest.mjs --open               # draft, copy the body, open the form
 *   node scripts/reddit_digest.mjs --since 2026-11-14   # explicit window
 *   node scripts/reddit_digest.mjs --min 5              # stricter threshold
 *   node scripts/reddit_digest.mjs --mark-posted <url>  # record what went out
 *   node scripts/reddit_digest.mjs --offline            # git only, no HTTP
 *
 * A quiet week is a valid outcome: below `--min` product changes the script says
 * "nothing worth posting" and exits 0. Six posts a year that are worth reading
 * beat fifty that are not.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, collectEntries } from "./lib/changelog-commits.mjs";

const STATE_FILE = join(ROOT, "data", "reddit_digest.json");
const OUT_DIR = join(ROOT, "output");
const SITE = "https://theocompass.com";
const SUBREDDIT = "TheoCompass";
const DAY = 86_400_000;
const MAX_BULLETS = 5;
const MAX_ALSO = 4;

/** Commit types that are never a bullet: none of them is visible to a reader. */
const NOT_A_POST = new Set(["docs", "refactor", "merge", "test", "style"]);

/** feat > perf/fix > everything else, then shipped roadmap work, then detail. */
const TYPE_SCORE = { feat: 3, perf: 2, fix: 2 };

/**
 * Scopes as a reader would name them. The commit scopes are maintained for the
 * repo's own navigation; a post reads better with headings like "The quiz
 * itself" than with `feat(quiz)`.
 */
const SCOPE_LABELS = {
  quiz: "The quiz itself",
  feedback: "Feedback",
  labels: "Labels and wording",
  copy: "Wording",
  stats: "Collective results",
  ux: "Interface",
  a11y: "Accessibility",
  export: "Exports",
  api: "The backend",
  roadmap: "The roadmap",
  seo: "Discoverability",
  perf: "Speed",
  data: "The data",
  denom: "The denominations",
};

/** Rotated by ISO week so consecutive posts do not open the same way. */
const QUESTIONS = [
  "Curious where it puts you? Take the quiz and tell me in the comments if the match is wrong — that is the feedback I act on most.",
  "If a tradition is missing, or one is described unfairly, say so below; corrections ship in the next build.",
  "What should I work on next? The roadmap is public — theocompass.com/roadmap — and the comments are the best vote I have.",
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];


// --- small formatting helpers ----------------------------------------------

/** "21 Nov" — the range line and the file name. */
function formatDay(iso) {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** "21 Nov 2026" — a date in prose needs the year. */
function formatFullDay(iso) {
  const date = new Date(iso);
  return `${formatDay(iso)} ${date.getUTCFullYear()}`;
}

/** "2026-11" — the `/changelog#2026-11` heading anchor. */
function monthKey(iso) {
  const date = new Date(iso);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** ISO week number, for rotating the closing question. */
function isoWeek(iso) {
  const date = new Date(iso);
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(target.getUTCFullYear(), 0, 1);
  return Math.ceil(((target - yearStart) / DAY + 1) / 7);
}

/** A commit subject as a sentence: capital first letter, no trailing period. */
function sentence(subject) {
  const text = String(subject ?? "").trim().replace(/\.$/, "");
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function scopeLabel(scope) {
  if (!scope) return "Elsewhere";
  const known = SCOPE_LABELS[scope.toLowerCase()];
  if (known) return known;
  const words = scope.replace(/[-_]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function log(message) {
  console.log(message);
}

// --- arguments -------------------------------------------------------------

function usage() {
  console.log(`Draft the weekly r/${SUBREDDIT} post from the changelog.

  node scripts/reddit_digest.mjs                      draft since the last post
  node scripts/reddit_digest.mjs --open               also copy the body and open the form
  node scripts/reddit_digest.mjs --since YYYY-MM-DD   explicit start of the window
  node scripts/reddit_digest.mjs --min N              product changes needed to post (default 3)
  node scripts/reddit_digest.mjs --title "..."        override the proposed title
  node scripts/reddit_digest.mjs --mark-posted <url>  record a post in data/reddit_digest.json
  node scripts/reddit_digest.mjs --offline            git only, no GitHub API
  node scripts/reddit_digest.mjs --dry-run            print the draft instead of writing it`);
}

function parseArgs(argv) {
  const flags = {
    open: false,
    offline: false,
    dryRun: false,
    min: 3,
    since: null,
    title: null,
    markPosted: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--open") flags.open = true;
    else if (arg === "--offline") flags.offline = true;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else if (arg === "--min") {
      flags.min = Number(argv[++index]);
      if (!Number.isFinite(flags.min) || flags.min < 1) {
        throw new Error("--min needs a positive number");
      }
    } else if (arg === "--since") {
      flags.since = argv[++index];
      if (!flags.since || Number.isNaN(Date.parse(`${flags.since}T00:00:00Z`))) {
        throw new Error("--since needs a date, e.g. --since 2026-11-14");
      }
    } else if (arg === "--title") {
      flags.title = argv[++index];
      if (!flags.title) throw new Error("--title needs a value");
    } else if (arg === "--mark-posted") {
      flags.markPosted = argv[++index];
      if (!flags.markPosted) throw new Error("--mark-posted needs the post's URL");
    } else {
      throw new Error(`unknown option ${arg}`);
    }
  }

  return flags;
}

// --- state -----------------------------------------------------------------

const EMPTY_STATE = { version: 1, lastPostedAt: null, lastSha: null, posts: [] };

function readState() {
  if (!existsSync(STATE_FILE)) return { ...EMPTY_STATE, posts: [] };
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    return {
      version: parsed.version ?? 1,
      lastPostedAt: parsed.lastPostedAt ?? null,
      lastSha: parsed.lastSha ?? null,
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
    };
  } catch (error) {
    console.warn(
      `digest: data/reddit_digest.json is unreadable (${error.message}); using an empty state`
    );
    return { ...EMPTY_STATE, posts: [] };
  }
}

function writeState(state) {
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

// --- the window ------------------------------------------------------------

/**
 * Everything since the last recorded post.
 *
 * `--since` wins when given: naming the window yourself is a decision, and the
 * message that suggests it has to be true. Otherwise the state file's SHA is the
 * boundary when it is still in the history — the only definition that survives a
 * week you skipped — and a first run falls back to the last seven days.
 */
function sinceLastPost(entries, state, since) {
  if (since) {
    const cutoff = Date.parse(`${since}T00:00:00Z`);
    return entries.filter((entry) => Date.parse(entry.date) >= cutoff);
  }

  if (state.lastSha) {
    const index = entries.findIndex((entry) => entry.sha === state.lastSha);
    if (index > 0) return entries.slice(0, index);
    if (index === 0) return [];
  }

  const newest = Date.parse(entries[0]?.date ?? "");
  return entries.filter((entry) => Date.parse(entry.date) >= newest - 7 * DAY);
}

/** Docs, refactors and chores are not what a reader would call a change. */
function isPostable(entry) {
  return !entry.housekeeping && !NOT_A_POST.has(entry.type);
}

/** feat > perf/fix > other; shipped roadmap work counts; so does a real subject. */
function score(entry) {
  const base = TYPE_SCORE[entry.type] ?? 1;
  const shipped = entry.tasks.length > 0 ? 2 : 0;
  const detail = Math.min(2, Math.floor(entry.subject.length / 40));
  return base + shipped + detail;
}

/** "14–21 Nov 2026", or the long form across months and years. */
function rangeLabel(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);

  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${formatFullDay(startIso)} – ${formatFullDay(endIso)}`;
  }
  if (start.getUTCMonth() !== end.getUTCMonth()) {
    return `${formatDay(startIso)} – ${formatFullDay(endIso)}`;
  }
  return `${start.getUTCDate()}–${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
}

// --- the draft -------------------------------------------------------------

/**
 * The post, as Markdown.
 *
 * Order is the score order, so the most visible change is the first bullet and
 * the section it lives in is the first heading. Everything below the fold is
 * "Also:" — a list of one-line claims, not five paragraphs of prose: a reader
 * decides in the first two lines whether this is for them.
 */
function composeDraft({ pool, ranked, flags, isFirstPost }) {
  const bullets = ranked.slice(0, MAX_BULLETS);
  const rest = ranked.slice(MAX_BULLETS);

  const grouped = new Map();
  for (const entry of bullets) {
    const label = scopeLabel(entry.scope);
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push(entry);
  }

  // A heading over one bullet is overhead: five headings for five changes reads
  // like a form, and the reader came for a list. Scopes the week only touched
  // once become plain bullets up front; the headings are kept for the areas the
  // week actually deepened, where they group something.
  const singles = [];
  const sections = [];
  for (const [label, group] of grouped) {
    if (group.length === 1) singles.push(group[0]);
    else sections.push([label, group]);
  }

  const lines = [];
  const opening = isFirstPost ? "In the last seven days" : "Since the last update";
  const count =
    ranked.length === pool.length
      ? `${ranked.length} product change${ranked.length === 1 ? "" : "s"}`
      : `${pool.length} commits, ${ranked.length} of them product changes`;

  lines.push(`${opening} (${rangeLabel(pool[pool.length - 1].date, pool[0].date)}): ${count}.`);
  lines.push("");

  for (const entry of singles) lines.push(`- ${sentence(entry.subject)}`);
  if (singles.length > 0) lines.push("");

  for (const [label, group] of sections) {
    lines.push(`**${label}**`);
    for (const entry of group) lines.push(`- ${sentence(entry.subject)}`);
    lines.push("");
  }

  if (rest.length > 0) {
    const named = rest.slice(0, MAX_ALSO).map((entry) => sentence(entry.subject));
    const extra = rest.length - named.length;
    lines.push(`Also: ${named.join("; ")}${extra > 0 ? ` — and ${extra} more` : ""}.`);
    lines.push("");
  }

  lines.push(`Full history, commit by commit: ${SITE}/changelog#${monthKey(pool[0].date)}`);
  lines.push(`The roadmap, with statuses: ${SITE}/roadmap`);
  lines.push("");
  lines.push(QUESTIONS[isoWeek(pool[0].date) % QUESTIONS.length]);

  // A commit subject is a good title only when it is short and it is the week's
  // headline. Otherwise the date does the job without pretending to be prose.
  const lead = bullets[0];
  const proposed =
    flags.title?.trim() ||
    (lead && lead.type === "feat" && lead.subject.length <= 70
      ? sentence(lead.subject)
      : `What changed in TheoCompass — ${formatFullDay(pool[0].date)}`);
  const title = proposed.slice(0, 300);

  // The `through:` SHA is what `--mark-posted` records, so a commit pushed
  // between drafting and posting stays in the next window instead of vanishing
  // from both.
  const frontMatter = [
    `<!-- draft for r/${SUBREDDIT}`,
    `     window: ${rangeLabel(pool[pool.length - 1].date, pool[0].date)}`,
    `     through: ${pool[0].sha} (${formatFullDay(pool[0].date)})`,
    `     edit the title and the closing question before posting -->`,
  ].join("\n");

  const body = lines.join("\n");
  const markdown = `${frontMatter}\n\n# ${title}\n\n${body}\n`;

  return { title, body, markdown, through: pool[0] };
}

// --- the drafting aids -----------------------------------------------------

/** macOS only: `pbcopy` is the one clipboard a terminal has without a package. */
function copyToClipboard(text) {
  if (process.platform !== "darwin") return false;
  try {
    execFileSync("pbcopy", [], { input: text });
    return true;
  } catch {
    return false;
  }
}

/**
 * Open the submit form with the title prefilled.
 *
 * Reddit reliably prefills `title` from the query string and reliably ignores
 * or mangles `text`, so the body goes to the clipboard instead of the URL: one
 * paste, no truncation, and the Markdown arrives intact.
 */
function openSubmitForm(title) {
  if (process.platform !== "darwin") return false;
  const url =
    `https://www.reddit.com/r/${SUBREDDIT}/submit` +
    `?type=self&title=${encodeURIComponent(title)}`;
  try {
    execFileSync("open", [url]);
    return true;
  } catch {
    return false;
  }
}

/** The title, the pasteable body and the `through:` SHA of one draft file. */
function readDraft(path) {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  const heading = text.split("\n").find((line) => line.startsWith("# "));
  const through = /through:\s*([0-9a-f]{40})/i.exec(text);
  const bodyStart = text.indexOf("\n# ");

  return {
    path,
    title: heading ? heading.slice(2).trim() : null,
    body: bodyStart === -1 ? text.trim() : text.slice(bodyStart + 1).replace(/^# .*\n+/, "").trim(),
    sha: through ? through[1] : null,
  };
}

/** The newest draft, for `--mark-posted` and for the "keep the edits" check. */
function latestDraft() {
  if (!existsSync(OUT_DIR)) return null;
  const names = readdirSync(OUT_DIR)
    .filter((name) => /^reddit-\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort();
  if (names.length === 0) return null;
  return readDraft(join(OUT_DIR, names[names.length - 1]));
}

function recordPost(state, { url, title, sha, date }) {
  const post = {
    sha,
    date,
    recordedAt: new Date().toISOString(),
    title: title ?? "(untitled)",
    url,
  };

  const next = {
    version: 1,
    lastPostedAt: post.recordedAt,
    lastSha: post.sha,
    posts: [...state.posts, post],
  };

  writeState(next);
  log(`digest: recorded ${url}`);
  log(`digest: the next window opens after ${sha.slice(0, 7)} (${formatFullDay(date)})`);
  return 0;
}

// --- main ------------------------------------------------------------------

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const state = readState();

  const { entries } = await collectEntries({
    offline: flags.offline,
    label: "digest",
    log,
    warn: (message) => console.warn(`digest: ${message}`),
  });

  if (entries.length === 0) {
    console.warn("digest: no commits found — run this from a checkout of the repository");
    return 1;
  }

  if (flags.markPosted) {
    if (!/^https?:\/\/(www\.)?reddit\.com\/r\/[^/]+\/comments\//i.test(flags.markPosted)) {
      console.warn(`digest: ${flags.markPosted} does not look like a Reddit post permalink`);
      return 1;
    }

    const draft = latestDraft();
    const through = draft?.sha
      ? entries.find((entry) => entry.sha === draft.sha) ?? entries[0]
      : entries[0];

    return recordPost(state, {
      url: flags.markPosted,
      title: flags.title ?? draft?.title ?? null,
      sha: through.sha,
      date: through.date,
    });
  }

  const pool = sinceLastPost(entries, state, flags.since);
  const ranked = pool.filter(isPostable);
  log(
    `digest: ${entries.length} commits in history, ${pool.length} in the window, ${ranked.length} postable`
  );

  if (ranked.length < flags.min) {
    log(
      `digest: ${ranked.length} product change${ranked.length === 1 ? "" : "s"} in the window ` +
        `(threshold ${flags.min}) — nothing worth announcing this week`
    );
    if (ranked.length > 0) {
      log(`digest: what there is — ${ranked.map((entry) => sentence(entry.subject)).join("; ")}`);
    }
    return 0;
  }

  // One post a week is a ceiling, not a target. `--since` is the way out: naming
  // the window yourself is a decision, and a decision is allowed to override a
  // default.
  if (state.lastPostedAt && !flags.since) {
    const elapsed = Date.now() - Date.parse(state.lastPostedAt);
    if (elapsed < 5 * DAY) {
      const hours = Math.max(1, Math.round(elapsed / 3_600_000));
      const ago = hours < 24 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${Math.round(hours / 24)} days`;
      log(
        `digest: the last post was ${ago} ago — wait until ` +
          `${formatFullDay(new Date(Date.parse(state.lastPostedAt) + 5 * DAY).toISOString())}, ` +
          `or pass --since to choose the window yourself`
      );
      return 0;
    }
  }

  const draft = composeDraft({
    pool,
    ranked,
    flags,
    isFirstPost: !state.lastSha && !flags.since,
  });

  if (flags.dryRun) {
    console.log(draft.markdown);
    return 0;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, `reddit-${draft.through.date.slice(0, 10)}.md`);

  // An existing draft wins. The whole point of the file is that you edit the
  // title and the closing question in it; regenerating over those edits because
  // you re-ran the script for the numbers would be the worse failure.
  const existing = readDraft(path);
  if (existing) {
    log(`digest: keeping the draft at ${path} — delete it to regenerate`);
  } else {
    writeFileSync(path, draft.markdown);
    log(`digest: title — ${draft.title}`);
    log(`digest: wrote ${path}`);
    log("digest: the title and the closing question are proposals; edit them before posting");
  }

  if (flags.open) {
    const final = existing ?? draft;
    const title = final.title ?? draft.title;
    const body = final.body ?? draft.body;
    const copied = copyToClipboard(body);
    const opened = openSubmitForm(title);
    if (copied) log("digest: body copied to the clipboard — paste it into the form");
    if (opened) log(`digest: opened r/${SUBREDDIT}'s submit form`);
    if (!copied || !opened) {
      log(`digest: could not open the form automatically; the draft is at ${path}`);
    }
  }

  log(`digest: after posting, record it — node scripts/reddit_digest.mjs --mark-posted <url>`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`digest: ${error.stack ?? error.message}`);
    process.exit(1);
  }
);
