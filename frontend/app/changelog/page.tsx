import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import {
  ENTRIES,
  GENERATED_AT,
  changelogTypeMeta,
  groupByMonth,
  splitSections,
  type ChangelogEntry,
  type ChangelogMonth,
} from "../../lib/changelog";
import { APP_STAGE, APP_VERSION, formatBuildDate } from "../../lib/site";

/**
 * What changed, and when.
 *
 * A build-time snapshot rather than a feed: `scripts/build_changelog.mjs` reads
 * the Git history into `lib/changelog.generated.ts`, and this page renders it
 * as a server component, so the HTML a crawler gets is the same HTML a reader
 * gets. Nothing here fetches, nothing is `"use client"`, and no date or number
 * depends on the reader's clock or locale.
 *
 * The commit subject is the changelog. The project already writes conventional
 * commits with real bodies, so there is no second thing to keep in sync — the
 * page is a view of the repository, not a document about it.
 */

export const metadata: Metadata = {
  title: "Changelog | TheoCompass",
  description:
    "Every change to TheoCompass, newest first: what was added, what was fixed, and the commit it came from.",
  openGraph: {
    title: "Changelog | TheoCompass",
    description:
      "Every change to TheoCompass, newest first: what was added, what was fixed, and the commit it came from.",
    siteName: "TheoCompass",
    type: "website",
  },
};

/** The commit type as a chip, in the roadmap's visual language. */
function TypeChip({ type }: { type: string }) {
  const meta = changelogTypeMeta(type);
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider ${meta.chip}`}
    >
      {meta.label}
    </span>
  );
}

/**
 * One commit.
 *
 * The subject is the entry; the message's opening paragraph is the "why",
 * clamped to three lines so a verbose commit cannot push the list apart — the
 * full message is one click away through the commit link. That clamping is
 * visual only: the text is in the document, which keeps it selectable, findable
 * with the browser's own search, and readable without JavaScript.
 *
 * `id={entry.short}` is what `/roadmap` links to, so a task's "Latest" line can
 * point at the commit that last touched it.
 */
function CommitEntry({ entry }: { entry: ChangelogEntry }) {
  return (
    <li id={entry.short} className="scroll-mt-24 border-t border-rule py-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TypeChip type={entry.type} />
        {entry.scope && (
          <span className="font-mono text-3xs text-ink-muted">{entry.scope}</span>
        )}
        <time
          dateTime={entry.date}
          className="num ml-auto shrink-0 font-mono text-3xs text-ink-muted"
        >
          {formatBuildDate(entry.date.slice(0, 10))}
        </time>
      </div>

      <p className="mt-1.5 text-mini font-semibold leading-snug text-ink">{entry.subject}</p>

      {entry.lead && (
        <p className="mt-1 line-clamp-3 text-2xs leading-relaxed text-ink-soft">{entry.lead}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {entry.tasks.map((task) => (
          <Link
            key={task.id}
            href={`/roadmap#${task.id}`}
            title={task.name}
            aria-label={`Task ${task.label}: ${task.name} on the roadmap`}
            className="meta border border-rule px-1.5 py-[0.05rem] text-ink-soft transition-colors hover:bg-muted-soft hover:text-ink"
          >
            Task {task.label}
          </Link>
        ))}

        <a
          href={`#${entry.short}`}
          aria-label={`Permalink to ${entry.subject}`}
          className="num font-mono text-3xs text-ink-muted transition-colors hover:text-ink"
        >
          #{entry.short}
        </a>

        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-3xs text-ink-muted transition-colors hover:text-ink"
        >
          Commit
          <ArrowUpRight aria-hidden="true" className="h-3 w-3" strokeWidth={1.75} />
        </a>
      </div>
    </li>
  );
}

/**
 * A month of commits.
 *
 * The heading sticks while its own month scrolls past: ten months of entries
 * is long enough that "which month am I in" stops being obvious, and one line
 * of chrome is cheaper than a sidebar. `id={month.key}` ("2026-11") gives every
 * month an anchor of its own, and `scroll-mt-24` keeps a jumped-to commit clear
 * of that heading.
 */
function MonthSection({ month }: { month: ChangelogMonth }) {
  return (
    <section id={month.key} className="scroll-mt-24">
      <h2 className="sticky top-0 z-10 -mx-5 flex items-baseline justify-between gap-3 border-b border-rule bg-paper/95 px-5 py-2 backdrop-blur-md md:-mx-8 md:px-8">
        <span className="font-serif text-base font-bold tracking-tight text-ink">{month.label}</span>
        <span className="meta">{month.entries.length} changes</span>
      </h2>
      <ol>
        {month.entries.map((entry) => (
          <CommitEntry key={entry.sha} entry={entry} />
        ))}
      </ol>
    </section>
  );
}

export default function ChangelogPage() {
  const { product, housekeeping } = splitSections(ENTRIES);
  const months = groupByMonth(product);

  return (
    <div className="flex min-h-screen flex-col bg-paper font-sans text-ink">
      <header className="border-b border-rule bg-paper/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-5 py-2.5 md:px-8 md:py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt=""
              width={32}
              height={32}
              className="h-7 w-7 object-contain"
              priority
            />
            <span className="font-serif text-base font-bold tracking-tight text-ink md:text-lg">
              TheoCompass
            </span>
            <span className="meta hidden sm:inline">Changelog</span>
          </Link>

          <Link
            href="/roadmap"
            className="ml-auto flex items-center gap-1.5 border border-rule-strong px-2.5 py-1.5 text-2xs font-medium text-ink-soft transition-colors hover:bg-muted-soft hover:text-ink"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="hidden sm:inline">Roadmap</span>
            <span className="sr-only sm:hidden">Back to the roadmap</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 md:px-8 md:pb-20">
        <div className="pt-8 md:pt-12">
          <p className="meta">Changelog</p>
          <h1 className="mt-2 font-serif text-3xl font-bold leading-tight tracking-tight text-ink md:text-4xl">
            Every change, newest first
          </h1>
          <p className="mt-3 max-w-[54ch] text-sm leading-relaxed text-ink-soft">
            TheoCompass is built in the open, one commit at a time. This page is generated
            from the history of <code className="font-mono text-2xs">main</code>, so it holds
            what actually shipped rather than what a release note remembered to mention.
          </p>

          <dl className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-y border-rule py-2.5">
            <div className="flex items-baseline gap-1.5">
              <dt className="meta">Current to</dt>
              <dd className="num font-mono text-3xs text-ink-soft">
                {formatBuildDate(GENERATED_AT.slice(0, 10))}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="meta">Changes</dt>
              <dd className="num font-mono text-3xs text-ink-soft">{product.length}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="meta">Build</dt>
              <dd className="num font-mono text-3xs text-ink-soft">
                {APP_VERSION} &middot; {APP_STAGE}
              </dd>
            </div>
          </dl>
        </div>

        {months.length > 0 ? (
          <div className="mt-2">
            {months.map((month) => (
              <MonthSection key={month.key} month={month} />
            ))}
          </div>
        ) : (
          <p className="mt-8 border-t border-rule pt-4 text-sm leading-relaxed text-ink-soft">
            Nothing published yet. The first change to reach <code className="font-mono text-2xs">main</code>{" "}
            will appear here.
          </p>
        )}

        {housekeeping.length > 0 && (
          <details className="mt-10 border-t border-rule pt-4">
            <summary className="meta cursor-pointer select-none transition-colors hover:text-ink">
              Housekeeping ({housekeeping.length})
            </summary>
            <p className="mt-2 max-w-[54ch] text-2xs leading-relaxed text-ink-soft">
              Dependencies, configuration, builds and merge commits: real work, but not
              changes a reader can use. Kept here so the list above stays honest.
            </p>
            <ol className="mt-3">
              {housekeeping.map((entry) => (
                <CommitEntry key={entry.sha} entry={entry} />
              ))}
            </ol>
          </details>
        )}

        <footer className="mt-12 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule pt-5 text-2xs">
          <Link href="/roadmap" className="text-ink-soft transition-colors hover:text-ink">
            What is still ahead
          </Link>
          <Link href="/" className="text-ink-soft transition-colors hover:text-ink">
            Main page
          </Link>
          <p className="ml-auto text-3xs text-ink-muted">
            Generated from Git &middot; {ENTRIES.length} commits
          </p>
        </footer>
      </main>
    </div>
  );
}

