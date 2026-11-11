"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Lock, Terminal } from "lucide-react";

/**
 * The roadmap's own chrome.
 *
 * The quiz header (`_PageHeader`) is a 3.5rem sticky band built for a
 * single-question view; this page needs the marketing header's shape instead:
 * a paper band, the wordmark, and one way back. It stays static so the phase
 * headings keep their own scroll position.
 */
export function RoadmapHeader({
  unlocked,
  onLock,
  onUnlock,
}: {
  unlocked: boolean;
  onLock: () => void;
  onUnlock: () => void;
}) {
  return (
    <header className="border-b border-rule bg-paper/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[64rem] items-center gap-3 px-5 py-2.5 md:px-8 md:py-3">
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
          <span className="meta hidden sm:inline">Roadmap</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {unlocked ? (
            <>
              <span className="hidden items-center gap-1.5 border border-punch-500/40 bg-punch-50 px-2 py-1 text-3xs font-bold uppercase tracking-wider text-punch-ink sm:inline-flex">
                <span className="h-1 w-1 rounded-full bg-punch-500" aria-hidden="true" />
                Editing
              </span>
              <button
                type="button"
                onClick={onLock}
                className="flex items-center gap-1.5 border border-rule-strong px-2.5 py-1.5 text-2xs font-medium text-ink-soft transition-colors hover:bg-muted-soft hover:text-ink"
              >
                <Lock aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
                Lock
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onUnlock}
              className="flex items-center gap-1.5 border border-rule-strong px-2.5 py-1.5 text-2xs font-medium text-ink-soft transition-colors hover:bg-muted-soft hover:text-ink"
            >
              <Terminal aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">Moderate</span>
              <span className="sr-only sm:hidden">Moderate the roadmap</span>
            </button>
          )}

          <Link
            href="/"
            className="flex items-center gap-1.5 border border-rule-strong px-2.5 py-1.5 text-2xs font-medium text-ink-soft transition-colors hover:bg-muted-soft hover:text-ink"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="hidden sm:inline">Main page</span>
            <span className="sr-only sm:hidden">Back to the main page</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
