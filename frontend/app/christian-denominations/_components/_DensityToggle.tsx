"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * The size control.
 *
 * Every type step in the app is rem-based (see `--text-*` in globals.css), so
 * the root font-size IS the size setting: one attribute rescales type,
 * padding, icons and charts together. That root size is itself fluid
 * (`--type-base`), so a phone already starts smaller than a desktop; this
 * control is the reader's override on top of it, and the choice persists.
 */
const ORDER = ["compact", "regular", "comfortable"] as const;

export type Density = (typeof ORDER)[number];

const STORAGE_KEY = "theocompass:density";

const LABELS: Record<Density, string> = {
  compact: "Small",
  regular: "Normal",
  comfortable: "Large",
};

/** The glyph grows with the setting, so the control previews its own effect. */
const GLYPH_SIZE: Record<Density, string> = {
  compact: "text-3xs",
  regular: "text-2xs",
  comfortable: "text-mini",
};

function isDensity(value: string | null): value is Density {
  return value === "compact" || value === "regular" || value === "comfortable";
}

function apply(density: Density) {
  document.documentElement.dataset.density = density;
  try {
    window.localStorage.setItem(STORAGE_KEY, density);
  } catch {
    /* private mode - the attribute still applies for this session */
  }
}

/** The DOM attribute is the single source of truth, so the label cannot drift. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-density"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Density {
  const value = document.documentElement.dataset.density ?? null;
  return isDensity(value) ? value : "regular";
}

function getServerSnapshot(): Density {
  return "regular";
}

/** Applies the remembered density (or the phone default) without rendering a control. */
export function initDensity(): Density {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  // The fluid root already shrinks type on phones, so "regular" is the honest
  // default everywhere; compact is an opt-in, not a phone fallback.
  const initial: Density = isDensity(saved) ? saved : "regular";
  apply(initial);
  return initial;
}

export function DensityToggle({ className = "" }: { className?: string }) {
  const density = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    // First mount only: adopt the remembered size, or the phone default.
    if (!document.documentElement.dataset.density) initDensity();
  }, []);

  // Three sizes side by side, drawn in the size they select.
  //
  // The old control was one button labelled "Aa Normal" that cycled on click:
  // it looked like a label, gave no hint that pressing it did anything, and
  // never showed what the other two options were. A segmented control answers
  // all three at once - it looks pressable, it is filled with the interaction
  // blue, and the option you are not on is visible next to you.
  return (
    <div
      role="group"
      aria-label="Text size"
      className={`flex items-stretch divide-x divide-accent/30 border border-accent/60 bg-accent-soft ${className}`}
    >
      {ORDER.map((option) => {
        const isActive = option === density;
        return (
          <button
            key={option}
            type="button"
            onClick={() => apply(option)}
            aria-pressed={isActive}
            aria-label={`Text size: ${LABELS[option]}`}
            title={`Text size: ${LABELS[option]}`}
            className={`flex cursor-pointer items-center justify-center px-1.5 py-1 transition-colors active:scale-95 ${
              isActive
                ? "bg-accent text-white"
                : "text-accent-ink hover:bg-accent/15 hover:text-accent-deep"
            }`}
          >
            <span aria-hidden="true" className={`font-mono leading-none ${GLYPH_SIZE[option]}`}>
              A
            </span>
          </button>
        );
      })}
    </div>
  );
}
