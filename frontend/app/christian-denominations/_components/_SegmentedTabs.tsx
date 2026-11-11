"use client";

import { useEffect, useRef } from "react";

export interface TabDef {
  id: string;
  label: string;
}

/**
 * Section switcher for the results page.
 *
 * Implements the WAI-ARIA tabs pattern with roving focus: arrow keys /
 * Home / End move the selection, and each tab is a real <button> wired to its
 * panel via aria-controls. Horizontally scrollable on narrow screens.
 */
export function SegmentedTabs({
  tabs,
  active,
  onChange,
  idPrefix = "results",
  ariaLabel = "Result sections",
  className = "",
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  idPrefix?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the selected tab in view. With five sections and a scrolling row, the
  // last two (Labels, Share) used to sit entirely off-screen on a phone with no
  // hint that they existed.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `#${idPrefix}-tab-${active}`
    );
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active, idPrefix]);

  const focusTab = (index: number) => {
    const next = tabs[index];
    if (!next) return;
    onChange(next.id);
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `#${idPrefix}-tab-${next.id}`
    );
    el?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusTab((index + 1) % tabs.length);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusTab((index - 1 + tabs.length) % tabs.length);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(tabs.length - 1);
        break;
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`flex snap-x items-stretch gap-0 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-rule-strong [&::-webkit-scrollbar-track]:bg-transparent ${className}`}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`shrink-0 snap-start whitespace-nowrap border-b-2 px-2.5 py-3 text-2xs font-medium transition-colors sm:px-4 sm:py-3.5 sm:text-sm ${
              isActive
                ? "border-accent text-accent-deep"
                : "border-transparent text-ink-muted hover:border-rule-strong hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
