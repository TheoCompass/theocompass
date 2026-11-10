"use client";

import { forwardRef } from "react";
import { Lock } from "lucide-react";
import CompassChart from "../CompassChart";
import {
  filterDenomsByActive,
  filterFamiliesByActive,
  getTierStyle,
  modeLabel,
} from "../_helpers";
import type { CoordsMap } from "../_helpers";
import ExportFrame from "./_ExportFrame";

interface ExportCardProps {
  results: any[];
  familyMatches: any[];
  userCoords: Record<string, number>;
  userTolerance: number;
  userCertainty?: number;
  selectedMode: "quick" | "standard" | "deep" | null;
  showSpecific: boolean;
  displayFamilies: boolean;
  activeOnly: boolean;
  allCoordinates: CoordsMap;
  timestamp: string;
  questionCount: number;
}

/**
 * One row of a ranked list.
 *
 * The rank disc was a `rounded-full` with a `shadow-sm`, above a `rounded-full`
 * pill of a bar: three circles on a canvas whose every other line is square.
 * It also set the rank numeral in white on the tier colour, which measures
 * 4.17:1 on the top tier's punch red - under AA, for a 10px numeral.
 *
 * So the numeral moved onto the navy plate the rest of the product uses, and
 * the tier colour stayed where it means something: the bar, which is the
 * quantity. The shape goes square so the row reads as a table.
 */
function RankRow({ rank, name, pct }: { rank: number; name: string; pct: number }) {
  const tier = getTierStyle(pct);
  return (
    <div className="flex items-center gap-3">
      <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] bg-ink font-mono text-3xs font-bold text-paper">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-ink">{name}</p>
        <div className="mt-1 h-1.5 w-full bg-muted-soft">
          <div
            className="h-full"
            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: tier.hex }}
          />
        </div>
      </div>
      <span className="num w-9 shrink-0 text-right font-mono text-xs text-ink-soft">{pct}%</span>
    </div>
  );
}

const ExportCard = forwardRef<HTMLDivElement, ExportCardProps>(function ExportCard(
  {
    results,
    familyMatches,
    userCoords,
    userTolerance,
    userCertainty,
    selectedMode,
    displayFamilies,
    activeOnly,
    allCoordinates,
    timestamp,
    questionCount,
  },
  ref
) {
  // Reflect the results-page "Active only" filter inside the exported image.
  const exportResults = activeOnly ? filterDenomsByActive(results, allCoordinates) : results;
  const exportFamilies = activeOnly ? filterFamiliesByActive(familyMatches, allCoordinates) : familyMatches;

  const topName = displayFamilies
    ? exportFamilies?.[0]?.family ?? "Unknown"
    : exportResults?.[0]?.name ?? "Unknown";

  const topScore = displayFamilies
    ? exportFamilies?.[0]?.matchPercentage ?? 0
    : exportResults?.[0]?.matchPercentage ?? 0;

  const trophyTier = getTierStyle(topScore);

  return (
    <ExportFrame
      ref={ref}
      artefact="Theological Alignment Report"
      modeLabel={modeLabel(selectedMode)}
      questionCount={questionCount}
      timestamp={timestamp}
      footnote={activeOnly ? "Active traditions only" : "All traditions, including historical"}
    >
      {/* ─── HERO ───
          The radial wash is gone: this language allows one gradient and it is
          the chrome band. Ruled chart paper says "instrument" instead. */}
      <div className="chart-grid border-b border-rule bg-paper-raised px-10 py-8 text-center">
        <p className="meta">
          {displayFamilies ? "Closest theological family" : "Closest theological alignment"}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-tight text-ink">{topName}</h1>

        <div className="mt-4 inline-flex items-baseline gap-2 border border-rule px-4 py-1.5">
          <span className="num font-mono text-2xl font-bold leading-none text-ink">{topScore}%</span>
          <span className="meta">match</span>
        </div>

        <p className="mt-3">
          <span
            className="inline-block rounded-[2px] border px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.14em]"
            style={{ color: trophyTier.hex, borderColor: `${trophyTier.hex}55` }}
          >
            {trophyTier.badge}
          </span>
        </p>
      </div>

      {/* ─── RANKED ─── */}
      <div className="border-b border-rule bg-paper-raised px-10 py-7">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="meta border-b border-rule pb-2">Top 5 family alignments</p>
            <div className="mt-4 space-y-3">
              {exportFamilies.slice(0, 5).map((d: any, i: number) => (
                <RankRow
                  key={d.family || d.name}
                  rank={i + 1}
                  name={d.family || d.name}
                  pct={d.matchPercentage ?? 0}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="meta border-b border-rule pb-2">Top 5 specific traditions</p>
            <div className="mt-4 space-y-3">
              {exportResults.length > 0 ? (
                exportResults.slice(0, 5).map((d: any, i: number) => (
                  <RankRow
                    key={d.name || d.family}
                    rank={i + 1}
                    name={d.name || d.family}
                    pct={d.matchPercentage ?? 0}
                  />
                ))
              ) : (
                <div className="flex min-h-[132px] flex-col items-center justify-center border border-dashed border-rule-strong px-4 text-center">
                  <Lock aria-hidden="true" className="h-4 w-4 text-ink-muted" strokeWidth={1.5} />
                  <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                    Standard or Deep Dive mode unlocks specific tradition matches.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── COMPASS CHART ─── */}
      <div className="bg-paper-raised border-b border-rule px-8 py-6">
        <CompassChart
          userCoords={userCoords}
          userTolerance={userTolerance}
          userCertainty={userCertainty}
          isExport={true}
          selectedMode={selectedMode}
          familyMatches={exportFamilies}
          displayFamilies={displayFamilies}
          hideInactive={activeOnly}
        />
      </div>
    </ExportFrame>
  );
});

export default ExportCard;