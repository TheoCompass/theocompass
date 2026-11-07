"use client";

import Image from "next/image";
import { forwardRef } from "react";
import CompassChart from "../CompassChart";
import { getTierStyle, filterDenomsByActive, filterFamiliesByActive } from "../_helpers";
import type { CoordsMap } from "../_helpers";

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

const ExportCard = forwardRef<HTMLDivElement, ExportCardProps>(function ExportCard(
  {
    results,
    familyMatches,
    userCoords,
    userTolerance,
    userCertainty,
    selectedMode,
    showSpecific,
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

  const modeLabel =
    selectedMode === "quick"
      ? "Quick Mode"
      : selectedMode === "standard"
        ? "Standard Mode"
        : "Deep Dive";

  const topFive = (displayFamilies ? exportFamilies : exportResults).slice(0, 5);
  const trophyTier = getTierStyle(topScore);

  return (
    <div
      ref={ref}
      className="absolute w-[960px] bg-white text-slate-900 overflow-hidden shadow-2xl ring-1 ring-slate-200 font-sans"
      style={{ left: "-9999px", top: "0" }}
    >
      {/* ─── HEADER ─── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-10 py-6 flex justify-between items-center border-b-4 border-blue-600/40">
        <div>
          <div className="text-3xl font-bold font-serif tracking-tight">
            TheoCompass <span className="text-blue-300 text-lg font-sans tracking-widest ml-2">Open Beta</span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-blue-300 text-sm font-bold uppercase tracking-widest">
              Theological Alignment Report
            </span>
            <span className="bg-blue-600/30 text-blue-100 text-xs font-bold px-3 py-0.5 rounded-full border border-blue-400/30">
              {modeLabel} • {questionCount} questions
            </span>
          </div>
        </div>
        <div className="w-16 h-16 bg-white rounded-full flex-shrink-0 flex items-center justify-center shadow-lg border-2 border-slate-700 overflow-hidden">
          <Image src="/logo.png" alt="Logo" width={56} height={56} className="object-contain p-1" />
        </div>
      </div>

      {/* ─── HERO ─── */}
      <div className="relative bg-white text-center py-10 px-10 border-b border-slate-200 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50/50 via-white to-white pointer-events-none" />
        <div className="relative z-10">
          <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">
            {displayFamilies ? "Closest Theological Family" : "Closest Theological Alignment"}
          </div>
          <h1 className="text-4xl font-bold font-serif text-slate-900 leading-tight mb-5">{topName}</h1>
          <div className="inline-flex items-center gap-4 bg-slate-900 px-7 py-2.5 rounded-full shadow-md border border-slate-800">
            <span className="text-3xl font-bold text-white">{topScore}%</span>
            <span className="text-sm font-bold text-blue-300 uppercase tracking-widest">Match</span>
          </div>
          <div className="mt-4">
            <span
              className={`inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border`}
              style={{ color: trophyTier.hex, borderColor: trophyTier.hex + "40", backgroundColor: trophyTier.hex + "10" }}
            >
              {trophyTier.badge}
            </span>
          </div>
        </div>
      </div>

      {/* ─── TOP 5 DUAL COLUMN ─── */}
      <div className="bg-white border-b border-slate-200 px-10 py-8">
        <div className="grid grid-cols-2 gap-8">
          {/* Left: Top Family Alignments */}
          <div>
            <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-5 border-b border-slate-100 pb-2">
              Top 5 Family Alignments
            </div>
            <div className="space-y-2.5">
              {exportFamilies.slice(0, 5).map((d: any, i: number) => {
                const pct = d.matchPercentage ?? 0;
                const tier = getTierStyle(pct);
                return (
                  <div key={d.family || d.name} className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm shrink-0"
                      style={{ backgroundColor: tier.hex }}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {d.family || d.name}
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1 mt-0.5 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            backgroundColor: tier.hex,
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-xs font-bold text-slate-600 w-9 text-right shrink-0">
                      {pct}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Top Specific Traditions */}
          <div>
            <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-5 border-b border-slate-100 pb-2">
              Top 5 Specific Traditions
            </div>
            <div className="space-y-2.5">
              {exportResults.slice(0, 5).length > 0 ? (
                exportResults.slice(0, 5).map((d: any, i: number) => {
                  const pct = d.matchPercentage ?? 0;
                  const tier = getTierStyle(pct);
                  return (
                    <div key={d.name || d.family} className="flex items-center gap-3">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm shrink-0"
                        style={{ backgroundColor: tier.hex }}
                      >
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {d.name || d.family}
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1 mt-0.5 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              backgroundColor: tier.hex,
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-xs font-bold text-slate-600 w-9 text-right shrink-0">
                        {pct}%
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-center border-2 border-dashed border-slate-200 rounded-xl px-4">
                  <span className="text-2xl mb-2">🔒</span>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Upgrade to <span className="font-bold text-slate-500">Standard</span> or{" "}
                    <span className="font-bold text-slate-500">Deep Dive</span> mode to unlock
                    specific tradition matches
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── COMPASS CHART ─── */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
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

      {/* ─── FOOTER ─── */}
      <div className="bg-slate-900 px-10 py-8 text-center border-t-4 border-slate-800">
        <p className="font-serif italic text-base text-slate-300 mb-3">
          &ldquo;He is before all things, and in him all things hold together.&rdquo; — Colossians 1:17
        </p>
        <div className="w-12 h-px bg-slate-700 mx-auto my-3" />
        <p className="text-xs text-slate-400 mb-1">Built for informed decision, not persuasion.</p>
        <p className="text-xs font-bold text-slate-300 mb-1">
          {activeOnly ? "Filter: Active traditions only" : "Filter: All traditions (incl. historical)"}
        </p>
        <p className="text-xs text-slate-500 font-mono mt-2">
          theocompass.com • Generated {timestamp}
        </p>
      </div>
    </div>
  );
});

export default ExportCard;