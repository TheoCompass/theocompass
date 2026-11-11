"use client";

import { ReactNode } from "react";

/**
 * The one and only page container.
 *
 * Replaces the previous scatter of `max-w-2xl` / `max-w-4xl` / `max-w-5xl`
 * wrappers that made desktop feel like a stretched phone app. Every view picks
 * a width from this fixed set so vertical rhythm and gutters stay consistent.
 */
const WIDTHS = {
  /** Results, dashboards — uses desktop width. */
  page: "max-w-[84rem]",
  /** Single-column reading views: results, instructions. */
  reading: "max-w-[64rem]",
  /** Reading column: quiz questions, prose. */
  prose: "max-w-[46rem]",
  /** Edge-to-edge (heroes, export canvases). */
  full: "max-w-none",
} as const;

export type ShellWidth = keyof typeof WIDTHS;

/**
 * Gutter scale — the negative margins on sticky bands must match this exactly,
 * or the band will not sit flush with the column it belongs to.
 */
export const SHELL_GUTTERS = "px-5 md:px-8 lg:px-10";

export function Shell({
  children,
  width = "page",
  className = "",
}: {
  children: ReactNode;
  width?: ShellWidth;
  className?: string;
}) {
  return (
    <main
      id="main-content"
      className={`flex w-full flex-grow flex-col ${WIDTHS[width]} mx-auto ${SHELL_GUTTERS} ${className}`}
    >
      {children}
    </main>
  );
}
