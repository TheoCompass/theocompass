"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Lock, Map } from "lucide-react";

/**
 * Chrome for the moderator pages.
 *
 * Same shape as `_RoadmapHeader` -- paper band, wordmark, one way back -- with
 * one addition: a link between the two moderator surfaces. This page is not
 * linked from anywhere a reader can see, so the way *out* of it has to be
 * obvious, and the way to the other half of the job has to be too.
 */
export function ModHeader({ unlocked, onLock }: { unlocked: boolean; onLock?: () => void }) {
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
          <span className="meta hidden sm:inline">Moderator</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {unlocked && onLock && (
            <button
              type="button"
              onClick={onLock}
              className="flex items-center gap-1.5 border border-rule-strong px-2.5 py-1.5 text-2xs font-medium text-ink-soft transition-colors hover:bg-muted-soft hover:text-ink"
            >
              <Lock aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
              Lock
            </button>
          )}

          <Link
            href="/roadmap"
            className="flex items-center gap-1.5 border border-rule-strong px-2.5 py-1.5 text-2xs font-medium text-ink-soft transition-colors hover:bg-muted-soft hover:text-ink"
          >
            <Map aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="hidden sm:inline">Roadmap</span>
            <span className="sr-only sm:hidden">Open the roadmap</span>
          </Link>

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
