"use client";

import Image from "next/image";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { DensityToggle } from "./_DensityToggle";

interface PageHeaderProps {
  showRestart?: boolean;
  onLogoClick: () => void;
  onTitleClick: () => void;
  onBackClick: () => void;
  onRestartClick: () => void;
}

/**
 * One 3.5rem row, always.
 *
 * The previous version stacked a second "Back to Main Page" row underneath the
 * title, permanently spending ~44px of every phone's viewport. The height here
 * (`h-14`) is the anchor for the results page's sticky bar and for
 * `scroll-margin-top`, so change it in both places if you change it at all.
 */
export function PageHeader({
  showRestart = false,
  onLogoClick,
  onTitleClick,
  onBackClick,
  onRestartClick,
}: PageHeaderProps) {
  return (
    <header className="chrome-band sticky top-0 z-30 h-14 backdrop-blur">
      <div className="mx-auto flex h-full w-full max-w-[84rem] items-center gap-2 px-5 md:px-8 lg:px-10">
        <button
          type="button"
          onClick={onLogoClick}
          aria-label="TheoCompass home"
          className="flex shrink-0 items-center transition-opacity hover:opacity-70"
        >
          <Image
            src="/logo.png"
            alt=""
            width={28}
            height={28}
            className="object-contain"
            priority
          />
        </button>

        <button
          type="button"
          onClick={onTitleClick}
          className="truncate font-display text-base leading-none text-ink transition-colors hover:text-accent"
        >
          TheoCompass
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <DensityToggle />
          {showRestart && (
            <button
              type="button"
              onClick={onRestartClick}
              aria-label="Restart quiz"
              title="Restart quiz"
              className="p-2 text-ink-muted transition-colors hover:bg-muted-soft hover:text-accent"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}

          <button
            type="button"
            onClick={onBackClick}
            className="flex items-center gap-1.5 border border-rule-strong px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-muted-soft hover:text-ink"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="hidden sm:inline">Main page</span>
            <span className="sr-only sm:hidden">Back to main page</span>
          </button>
        </div>
      </div>
    </header>
  );
}
