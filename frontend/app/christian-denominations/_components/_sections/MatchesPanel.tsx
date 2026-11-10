"use client";

import { ArrowRight, ChevronDown } from "lucide-react";
import { getAlignmentSummary, getTierStyle } from "../../_helpers";
import { MetaRow } from "../_MetaRow";
import { MatchMeter } from "../_MatchMeter";
import { ScoreArc } from "../_ScoreArc";
import { ResultSelection } from "./_panelTypes";

/**
 * The #1 match — the only card on the page with a designed moment in it.
 *
 * Five blocks, in this order: rank/kind · name + score arc · founding facts ·
 * description · alignment summary. The 14-axis fingerprint that used to live
 * here (four bipolar tracks plus trait chips) is now ONE line with a link to
 * its own tab: the card states the outcome, the tab shows the data.
 */
export function MatchesPanel({
  selection,
  rank,
  userCoords,
  totalListed,
  listLabel,
  compareDenomId,
  onStartCompare,
  onOpenFingerprint,
  onOpenCompass,
}: {
  selection: ResultSelection | null;
  rank: number;
  userCoords: Record<string, number>;
  totalListed: number;
  listLabel: string;
  compareDenomId: string | null;
  onStartCompare: (id: string | null) => void;
  onOpenFingerprint: () => void;
  onOpenCompass: () => void;
}) {
  if (!selection) {
    return (
      <div className="card p-5 sm:p-6">
        <p className="font-display text-base text-ink">Nothing to show</p>
        <p className="mt-1.5 text-sm text-ink-soft">
          No {listLabel} matched the current filter. Turn off the active-only
          filter to include historical movements.
        </p>
      </div>
    );
  }

  const tier = getTierStyle(selection.score);
  const isFamily = selection.kind === "family";
  const summary = getAlignmentSummary(selection.dimCoords, userCoords);
  const membersInFamily = selection.membersInFamily ?? [];

  return (
    <article
      className="animate-fade-in border-l-[3px] bg-paper-raised"
      style={{ borderLeftColor: tier.hex }}
    >
      {/* The outcome, and nothing else: name, score, band. Closest match used to
          carry its own fingerprint, compass link and axes summary, which pushed
          rank 2 below the fold on a phone and made #1 look certain when the
          gap to #2 is often noise. Details live one tap down. */}
      <div className="px-4 py-4 sm:px-8 sm:py-6">
        <div className="flex items-start gap-2.5 sm:gap-4">
          <span
            className="num mt-1 shrink-0 px-1.5 py-1 font-mono text-3xs font-bold leading-none text-white"
            style={{ backgroundColor: tier.hex }}
          >
            #{String(rank).padStart(2, "0")}
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[clamp(1.15rem,2.8vw,1.85rem)] leading-[1.12] text-ink">
              {selection.name}
            </h2>

            <div className="meta mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`inline-flex items-center gap-1.5 ${tier.textColor}`}>
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: tier.hex }}
                />
                {tier.badge}
              </span>
              <span aria-hidden="true" className="text-rule-strong">
                /
              </span>
              <span>{isFamily ? "Theological family" : selection.family}</span>
              {selection.isActive === false && (
                <>
                  <span aria-hidden="true" className="text-rule-strong">
                    /
                  </span>
                  <span>Historical</span>
                </>
              )}
              <span aria-hidden="true" className="text-rule-strong">
                /
              </span>
              <span className="num">
                #1 of {totalListed}
              </span>
            </div>

            <div className="mt-2.5">
              <MatchMeter
                score={selection.score}
                showNumber={false}
                size="md"
                delay={120}
              />
            </div>
          </div>

          {/* On a phone the arc shrank out of existence; it is now rendered at a
              size that fits beside the name instead of being hidden. */}
          <ScoreArc
            score={selection.score}
            size={58}
            toneHex={tier.hex}
            className="sm:hidden"
          />
          <ScoreArc
            score={selection.score}
            size={88}
            toneHex={tier.hex}
            className="hidden sm:block"
          />
        </div>

        <p className="mt-3 text-mini leading-relaxed text-ink-soft sm:text-sm">
          {selection.description}
        </p>

        <MetaRow
          className="mt-2"
          items={[
            selection.founded ? `Founded ${selection.founded}` : null,
            selection.origin ? `Origin ${selection.origin}` : null,
            selection.members ? selection.members : null,
          ]}
        />
      </div>

      <details className="group">
        <summary className="meta flex cursor-pointer list-none items-center justify-between gap-3 border-t border-rule px-4 py-2.5 hover:bg-muted-soft sm:px-8">
          <span>
            {summary.total > 0
              ? `Aligned on ${summary.aligned} of ${summary.total} axes - open details`
              : "Open details"}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
            strokeWidth={1.75}
          />
        </summary>

        <div className="border-t border-rule px-4 py-3.5 sm:px-8">
          {summary.total > 0 && summary.widestAxis && summary.widestLeft && summary.widestRight && (
            <p className="text-mini leading-relaxed text-ink-soft">
              Largest gap:{" "}
              <span className="text-punch-ink">
                {summary.widestLeft} to {summary.widestRight}
              </span>
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!isFamily && compareDenomId !== selection.key) {
                  onStartCompare(selection.key);
                }
                onOpenFingerprint();
              }}
              className="inline-flex items-center gap-1.5 bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-deep"
            >
              {isFamily ? "See all 14 axes" : "Compare side by side"}
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
            {!isFamily && (
              <button
                type="button"
                onClick={onOpenFingerprint}
                className="border border-rule-strong px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-muted-soft"
              >
                Open fingerprint
              </button>
            )}
            <button
              type="button"
              onClick={onOpenCompass}
              className="border border-rule-strong px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-muted-soft"
            >
              Find it on the compass
            </button>
            {!isFamily && compareDenomId === selection.key && (
              <button
                type="button"
                onClick={() => onStartCompare(null)}
                className="px-1 py-2 text-xs text-ink-muted underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
              >
                Stop comparing
              </button>
            )}
          </div>

          {isFamily && selection.closestDenom && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-rule bg-cerulean-50 px-3 py-3">
              <div className="min-w-0">
                <div className="meta">Closest specific denomination</div>
                <div className="mt-1 truncate text-sm font-medium text-ink">
                  {selection.closestDenom.name}
                </div>
              </div>
              <div className="w-full sm:w-48">
                <MatchMeter
                  score={selection.closestDenom.matchPercentage}
                  size="sm"
                  delay={160}
                />
              </div>
            </div>
          )}

          {isFamily && membersInFamily.length > 1 && (
            <div className="mt-3">
              <div className="meta">Top {Math.min(5, membersInFamily.length)} in this family</div>
              <ul className="mt-1.5">
                {membersInFamily.slice(0, 5).map((denom, index) => (
                  <li
                    key={denom.name}
                    className="flex items-center gap-3 border-b border-rule py-2 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-mini text-ink-soft">
                      {denom.name}
                    </span>
                    <span className="w-28 shrink-0">
                      <MatchMeter
                        score={denom.matchPercentage}
                        size="sm"
                        delay={160 + index * 50}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </article>
  );
}
