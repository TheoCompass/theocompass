/**
 * The changelog's shape, and how a commit type is worded.
 *
 * `changelog.generated.ts` is the data (one row per commit, rewritten by
 * `node scripts/build_changelog.mjs`); this file is the vocabulary the page
 * renders it with. Keeping the type here rather than in the generated file
 * means a regeneration cannot quietly change what the page expects.
 *
 * The type chips are deliberately verbs ("Added", "Fixed") rather than the
 * commit prefixes themselves: `feat`/`fix` are Git's words, not a reader's.
 */

export { ENTRIES, GENERATED_AT } from "./changelog.generated";

import { formatMonthYear } from "./site";

/** A roadmap task a commit names through its `Task:` trailer. */
export interface ChangelogTaskRef {
  /** `p0-01` — also the roadmap row's anchor. */
  id: string;
  /** The sheet's own numbering ("0.1"), which is what a reader sees. */
  label: string;
  name: string;
}

/** The newest commit that names a task: the roadmap's "Latest" line. */
export interface LatestCommit {
  short: string;
  /** Committer date, ISO 8601 UTC. */
  date: string;
  subject: string;
}

export interface ChangelogEntry {
  sha: string;
  short: string;
  /** Committer date, ISO 8601 UTC. Grouped and printed from this string alone. */
  date: string;
  /** Conventional-commit type, lowercased; `"merge"` or `"change"` otherwise. */
  type: string;
  scope: string | null;
  /** The subject with `feat(scope):` stripped — the sentence the page shows. */
  subject: string;
  /**
   * The message's opening paragraph, trailers removed; `""` when there is none.
   *
   * Only the first paragraph, on purpose: it is the "why" a changelog needs,
   * and the full message is one link away. These bodies run to many paragraphs,
   * and shipping all of them — twice, as HTML and again in the RSC payload —
   * tripled the page's weight for prose nobody reads from a list.
   */
  lead: string;
  tasks: ChangelogTaskRef[];
  merge: boolean;
  /** Chores, CI and GitHub's own merge commits: collapsed at the foot of the page. */
  housekeeping: boolean;
  url: string;
}

export interface ChangelogTypeMeta {
  label: string;
  /** Chip classes, drawn from the same palette as `ROADMAP_STATUS_META`. */
  chip: string;
}

export const CHANGELOG_TYPE_META: Record<string, ChangelogTypeMeta> = {
  feat: { label: "Added", chip: "bg-punch-50 text-punch-ink" },
  fix: { label: "Fixed", chip: "bg-cerulean-50 text-cerulean-800" },
  perf: { label: "Faster", chip: "bg-sage-soft text-ink-soft" },
  docs: { label: "Docs", chip: "bg-sage-soft text-ink-soft" },
  refactor: { label: "Refactor", chip: "bg-muted-soft text-ink-muted" },
  merge: { label: "Merged", chip: "bg-muted-soft text-ink-muted" },
  chore: { label: "Housekeeping", chip: "bg-muted-soft text-ink-muted" },
  ci: { label: "Housekeeping", chip: "bg-muted-soft text-ink-muted" },
  build: { label: "Housekeeping", chip: "bg-muted-soft text-ink-muted" },
};

/** A type the generator has never seen still gets a styled chip. */
export const CHANGELOG_TYPE_FALLBACK: ChangelogTypeMeta = {
  label: "Change",
  chip: "bg-muted-soft text-ink-muted",
};

export function changelogTypeMeta(type: string): ChangelogTypeMeta {
  return CHANGELOG_TYPE_META[type] ?? CHANGELOG_TYPE_FALLBACK;
}

export interface ChangelogMonth {
  /** `2026-11` — the grouping key, taken from the date string, never a locale. */
  key: string;
  /** "November 2026". */
  label: string;
  entries: ChangelogEntry[];
}

/**
 * Months in the order the entries already arrive (newest first).
 *
 * A single pass rather than a `Map` of groups: the input is sorted, so
 * consecutive entries share a month and the headings come out chronological
 * without sorting strings whose labels are prose.
 */
export function groupByMonth(entries: ChangelogEntry[]): ChangelogMonth[] {
  const months: ChangelogMonth[] = [];

  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    const current = months[months.length - 1];
    if (current && current.key === key) {
      current.entries.push(entry);
      continue;
    }
    months.push({ key, label: formatMonthYear(entry.date), entries: [entry] });
  }

  return months;
}

/** Product changes lead the page; housekeeping is one collapsed block below. */
export function splitSections(entries: ChangelogEntry[]): {
  product: ChangelogEntry[];
  housekeeping: ChangelogEntry[];
} {
  return {
    product: entries.filter((entry) => !entry.housekeeping),
    housekeeping: entries.filter((entry) => entry.housekeeping),
  };
}
