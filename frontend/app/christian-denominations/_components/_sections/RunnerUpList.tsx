"use client";

import { ChevronDown, GitCompareArrows } from "lucide-react";
import { getTierStyle } from "../../_helpers";
import { MatchMeter, TierLegendLine } from "../_MatchMeter";
import { MetaRow } from "../_MetaRow";
import { RunnerUpItem } from "./_panelTypes";

/**
 * Everything below the top match, as one plain list.
 *
 * Deliberately simple: a row per tradition, tap to open its description inline.
 * Only one row is open at a time, which keeps the list from turning into the
 * wall of text the previous design produced.
 */
export function RunnerUpList({
  items,
  total,
  expandedKey,
  onToggle,
  showAll,
  onShowAll,
  compareDenomId,
  onCompare,
  onOpenFingerprint,
  listLabel,
  pageSize,
}: {
  items: RunnerUpItem[];
  total: number;
  expandedKey: string | null;
  onToggle: (key: string) => void;
  showAll: boolean;
  onShowAll: () => void;
  compareDenomId: string | null;
  onCompare: (id: string | null) => void;
  onOpenFingerprint: () => void;
  listLabel: string;
  /** Collapsed page size, so "Show fewer" can agree with the caller. */
  pageSize: number;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-12" aria-labelledby="runner-ups-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-2">
        <h2 id="runner-ups-heading" className="meta">
          Other close {listLabel}
        </h2>
        <span className="meta num">{total} ranked</span>
      </div>
      <TierLegendLine className="mt-2.5" />

      <ul className="mt-3 border-y border-rule">
        {items.map((item, index) => {
          const tier = getTierStyle(item.score);
          const isOpen = expandedKey === item.key;
          const bodyId = `runner-up-${item.key}`;
          const isCompared = compareDenomId === item.key;
          // Ranks 2–3 stay visible as "the other likely answers" — past that the
          // list is reference material and should recede.
          const isFrontRunner = item.rank <= 3;
          // The list assembles top-down; the cap keeps the tenth row from
          // waiting nearly half a second to exist.
          const stagger = Math.min(index, 8) * 40;

          return (
            <li
              key={item.key}
              className="border-b border-rule last:border-b-0 animate-fade-in"
              style={{ animationDelay: `${stagger}ms` }}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => onToggle(item.key)}
                className={`group block w-full py-2.5 text-left transition-colors ${
                  isOpen
                    ? "bg-cerulean-50"
                    : isFrontRunner
                    ? "bg-cerulean-50/50 hover:bg-cerulean-50"
                    : "hover:bg-cerulean-50/60"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="h-8 w-[3px] shrink-0"
                    style={{ backgroundColor: tier.hex }}
                  />
                  <span className="meta num w-4 shrink-0 text-right">
                    {String(item.rank).padStart(2, "0")}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-mini leading-tight ${
                        isFrontRunner
                          ? "font-semibold text-ink"
                          : "font-medium text-ink-soft"
                      }`}
                    >
                      {item.name}
                    </span>
                    <span className="meta block truncate normal-case tracking-normal">
                      {item.sublabel}
                      {item.isActive === false ? " / historical" : ""}
                    </span>
                  </span>

                  <span className="num shrink-0 font-mono text-mini font-semibold text-ink">
                    {item.score}
                    <span className="text-ink-muted">%</span>
                  </span>

                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    strokeWidth={1.75}
                  />
                </span>

                {/* Same bar under every rank. Scanning down the list, the bar
                    lengths say "these three are effectively tied" before any
                    number is read. */}
                <span className="mt-1.5 block pl-[1.6rem] pr-6">
                  <MatchMeter
                    score={item.score}
                    showNumber={false}
                    size="sm"
                    delay={stagger + 80}
                  />
                </span>
              </button>

              {isOpen && (
                <div
                  id={bodyId}
                  className="border-t border-rule px-3 pb-5 pt-4 sm:pl-16"
                >
                  <p className="max-w-[65ch] text-sm leading-relaxed text-ink-soft">
                    {item.description || "No description available for this tradition."}
                  </p>

                  <MetaRow
                    className="mt-2"
                    items={[
                      item.founded ? `Founded ${item.founded}` : null,
                      item.origin ? `Origin ${item.origin}` : null,
                      item.members ?? null,
                    ]}
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {item.dimCoords && (
                      <button
                        type="button"
                        onClick={() => {
                          onCompare(isCompared ? null : item.key);
                          onOpenFingerprint();
                        }}
                        className="inline-flex items-center gap-1.5 border border-rule-strong px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-paper"
                      >
                        <GitCompareArrows
                          aria-hidden="true"
                          className="h-3.5 w-3.5"
                          strokeWidth={1.75}
                        />
                        {isCompared ? "Stop comparing" : "Compare with my fingerprint"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {total - 1 > items.length && !showAll && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-3 text-xs font-medium text-accent underline decoration-accent/30 underline-offset-4 transition-colors hover:decoration-accent"
        >
          Show all {total} {listLabel}
        </button>
      )}
      {showAll && total - 1 > pageSize && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-3 text-xs font-medium text-accent underline decoration-accent/30 underline-offset-4 transition-colors hover:decoration-accent"
        >
          Show fewer
        </button>
      )}
    </section>
  );
}
