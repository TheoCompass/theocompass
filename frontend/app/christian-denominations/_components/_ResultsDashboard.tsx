"use client";

import { useState } from "react";
import CompassChart from "../CompassChart";
import TheologicalLabelCloud from "../TheologicalLabelCloud";
import { FamilyCard } from "./_FamilyCard";
import { DenominationCard } from "./_DenominationCard";
import { ConvictionSwatch } from "./_ConvictionSwatch";
import { getTierStyle, getConvictionStyle, getGapStyle } from "../_helpers";
import { AXIS_LABELS, FINGERPRINT_CATEGORIES } from "../_constants";

export interface ResultsDashboardProps {
  results: any[];
  familyMatches: any[];
  userCoords: Record<string, number>;
  userTolerance: number;
  userLabels: any[];
  selectedMode: "quick" | "standard" | "deep" | null;
  isCalculating: boolean;
  showSpecific: boolean;
  showTopFamilyDenoms: boolean;
  compareDenomId: string | null;
  expandedAxis: string | null;
  collapsedCategories: Record<string, boolean>;
  allCoordinates: Map<string, { name: string; family: string; dimCoords: Record<string, number>; isActive?: boolean; estMembers?: number | null }>;
  isExporting: boolean;
  exportRef: React.RefObject<HTMLDivElement | null>;
  isExportingLabels: boolean;
  isExportingFingerprint: boolean;
  onSetShowSpecific: (val: boolean) => void;
  onSetShowTopFamilyDenoms: (val: boolean) => void;
  onSetCompareDenomId: (id: string | null) => void;
  onSetExpandedAxis: (axis: string | null) => void;
  onSetCollapsedCategories: (cats: Record<string, boolean>) => void;
  onDownloadImage: () => void;
  onDownloadLabels: () => void;
  onDownloadFingerprint: () => void;
  onRetake: () => void;
  onDevMenu: () => void;
}

export function ResultsDashboard({
  results,
  familyMatches,
  userCoords,
  userTolerance,
  userLabels,
  selectedMode,
  isCalculating,
  showSpecific,
  showTopFamilyDenoms,
  compareDenomId,
  expandedAxis,
  collapsedCategories,
  allCoordinates,
  isExporting,
  exportRef,
  isExportingLabels,
  isExportingFingerprint,
  onSetShowSpecific,
  onSetShowTopFamilyDenoms,
  onSetCompareDenomId,
  onSetExpandedAxis,
  onSetCollapsedCategories,
  onDownloadImage,
  onDownloadLabels,
  onDownloadFingerprint,
  onRetake,
  onDevMenu,
}: ResultsDashboardProps) {
  // 0.5: filter state for the ranked list (driven by live is_active)
  const [activeOnly, setActiveOnly] = useState(false);

  // --- Derived values ---
  const userCoordsWithTolerance: Record<string, number> = {
    ...userCoords,
    tolerance: userTolerance,
  };
  const displayFamilies = selectedMode === "quick" && !showSpecific && familyMatches.length > 0;
  const topFamily = displayFamilies ? familyMatches?.[0] : null;
  // 0.5: enrich results with isActive/estMembers from the coordinates map
  const enrichedResults = results.map((d: any) => {
    const coord = allCoordinates.get(d.id);
    return { ...d, isActive: d.isActive ?? coord?.isActive, estMembers: d.estMembers ?? coord?.estMembers };
  });
  const listResults = activeOnly
    ? enrichedResults.filter((d: any) => d.isActive !== false)
    : enrichedResults;
  const topDenom = listResults[0] ?? results?.[0] ?? null;

  const topName = displayFamilies
    ? topFamily?.family ?? "Calculating..."
    : topDenom?.name ?? "Calculating...";

  const topScore = displayFamilies
    ? topFamily?.matchPercentage ?? 0
    : topDenom?.matchPercentage ?? 0;

  const topSubtitle = displayFamilies
    ? "Closest Theological Family"
    : "Closest Theological Alignment";

  const topDescription = displayFamilies
    ? topFamily?.description || "No description available for this family."
    : topDenom?.description || "No description available for this tradition.";

  const topMetaLabel = displayFamilies
    ? `Closest Individual Match: ${topFamily?.topDenomination?.name ?? "Unknown"}`
    : topDenom?.family ?? "Unknown Tradition";

  // Wrapper functions that match the prop names in the old code but use the new callback props
  const setShowSpecific = onSetShowSpecific;
  const setShowTopFamilyDenoms = onSetShowTopFamilyDenoms;
  const setCompareDenomId = onSetCompareDenomId;
  const setExpandedAxis = onSetExpandedAxis;
  const setCollapsedCategories = onSetCollapsedCategories;
  const handleDownloadImage = onDownloadImage;
  const setShowRestartModal = onRetake;

  return (
    <main className="flex-grow p-4 md:p-8 max-w-4xl mx-auto w-full flex flex-col">
      {isCalculating ? (
        <div className="flex flex-col items-center justify-center h-64 space-y-6">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-800 rounded-full animate-spin"></div>
          <h2 className="text-xl font-serif font-bold text-slate-700 animate-pulse">Calculating Alignment...</h2>
        </div>
      ) : (
        <div className="animate-fade-in-up">
          <div className="text-center mb-10">
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              Your Results
            </span>
            <h1 className="font-serif text-3xl md:text-5xl font-bold mt-4 mb-4 text-slate-900">
              Your Theological Matches
            </h1>
            <p className="text-slate-600 max-w-xl mx-auto">
              Based on your stances, certainty, and tolerance, here are the traditions that most closely align with your framework.
            </p>
          </div>

          {/* NEW: Specific Denominations Toggle & Disclaimer */}
          {selectedMode === 'quick' && (
            <div className="mb-8 bg-blue-50/50 border border-blue-100 rounded-2xl p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-blue-900 text-lg">Viewing {showSpecific ? 'Specific Denominations' : 'Denomination Families'}</h4>
                  <p className="text-sm text-blue-700 mt-1 max-w-md">
                    {showSpecific 
                      ? "Showing granular matches based on your 30 answers." 
                      : "Quick Mode groups results into broad theological families for accuracy."}
                  </p>
                </div>
                <button
                  onClick={() => setShowSpecific(!showSpecific)}
                  className="bg-white border-2 border-blue-600 text-blue-700 hover:bg-blue-50 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm whitespace-nowrap"
                >
                  {showSpecific ? '← Back to Families' : 'Show Specific Traditions'}
                </button>
              </div>
              
              {/* Disclaimer renders only when specific view is toggled ON */}
              {showSpecific && (
                <div className="mt-4 p-4 bg-white rounded-xl border border-amber-200 text-sm text-slate-700 shadow-sm flex gap-3">
                  <span className="text-amber-500 text-xl leading-none">⚠️</span>
                  <div>
                    <span className="font-bold text-amber-700">Disclaimer: </span> 
                    Because Quick Mode only asks 30 questions, it lacks the data to definitively distinguish between highly granular traditions. These specific matches carry a higher margin of error. We highly recommend taking the Standard or Deep Dive quiz for exact alignment.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* HERO / TOP RESULT */}
          {(displayFamilies ? familyMatches.length > 0 : listResults.length > 0) && (() => {
            const topPct = displayFamilies ? (topFamily?.matchPercentage ?? 0) : (topDenom?.matchPercentage ?? 0);
            const heroTier = getTierStyle(topPct);
            const isTopScore95 = topPct >= 95;
            return (
            <div className={`bg-white rounded-2xl border-2 shadow-xl overflow-hidden mb-8 relative ${heroTier.borderColor} ${isTopScore95 ? 'ring-2 ring-amber-300/50 ring-offset-4 ring-offset-slate-50' : ''}`}>
              <div className={`absolute top-0 right-0 font-bold px-4 py-1 rounded-bl-lg text-sm shadow-sm text-white`}
                style={{ background: `linear-gradient(135deg, ${heroTier.hex}, ${heroTier.hex}CC)` }}
              >
                #1 Match
              </div>

              <div className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 border-b border-slate-100">
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    {topSubtitle}
                  </div>
                  <h2 className="font-serif text-2xl md:text-4xl font-bold" style={{ color: heroTier.hex }}>
                    {topName}
                  </h2>
                  <div className="mt-2 text-sm text-slate-500 font-medium">
                    {topMetaLabel}
                  </div>
                </div>

                <div className={`flex flex-col items-center justify-center rounded-full w-32 h-32 border-4 shrink-0 shadow-inner ${heroTier.bg} ${heroTier.borderColor}`}>
                  <span className={`text-3xl font-bold ${heroTier.textColor} ${isTopScore95 ? 'animate-pulse' : ''}`}>{topScore}%</span>
                  <span className={`text-xs uppercase font-bold tracking-widest mt-1 ${heroTier.textColor.replace('text-', 'text-').replace('700', '500').replace('600', '400').replace('500', '400')}`}>
                    Match
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 p-6 md:p-8">
                <p className="text-slate-700 text-base md:text-lg leading-relaxed font-medium">
                  {topDescription}
                </p>

                {displayFamilies && topFamily?.topDenomination && (() => {
                  const topDenomPct = topFamily.topDenomination.matchPercentage ?? 0;
                  const denomTier = getTierStyle(topDenomPct);
                  return (
                  <div className="mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
                    {/* Top denomination (always visible) */}
                    <div className="p-4 border-b border-slate-100">
                      <div className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">
                        Best specific denomination inside this family
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className={`font-semibold text-slate-800`}>
                            {topFamily.topDenomination.name}
                          </div>
                          <div className="text-sm text-slate-500">
                            {topFamily.family}
                          </div>
                        </div>
                        <div className={`font-bold ${denomTier.textColor}`}>
                          {topFamily.topDenomination.matchPercentage}%
                        </div>
                      </div>
                      {/* Visual progress bar */}
                      <div className="mt-3 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${denomTier.barGradient || denomTier.barColor}`}
                          style={{ width: `${Math.min(topDenomPct, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Expandable: all denominations in this family */}
                    {topFamily.allDenominations && topFamily.allDenominations.length > 1 && (
                      <>
                        <div
                          className="px-4 py-2.5 flex items-center justify-between cursor-pointer select-none hover:bg-slate-50/60 transition-colors text-left"
                          onClick={() => setShowTopFamilyDenoms(!showTopFamilyDenoms)}
                        >
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Show the top 5 Denominations in Family
                          </span>
                          <div className={`text-slate-400 transform transition-transform duration-300 ${showTopFamilyDenoms ? 'rotate-180' : ''}`}>
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                          </div>
                        </div>
                        {showTopFamilyDenoms && (
                          <div className="px-4 pb-4 pt-1 bg-slate-50/80 border-t border-slate-100">
                            <div className="flex flex-col gap-1.5">
                              {topFamily.allDenominations.slice(0, 5).map((denom: any) => {
                                const rowTier = getTierStyle(denom.matchPercentage ?? 0);
                                return (
                                <div key={denom.id} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-100">
                                  <span className="text-sm font-medium text-slate-700">{denom.name}</span>
                                  <span className={`text-sm font-bold ${rowTier.textColor}`}>{denom.matchPercentage}%</span>
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  );
                })()}
              </div>
            </div>
            );
          })()}

          {/* TIER LEGEND */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
            <h4 className="text-xs font-bold uppercase text-slate-500 mb-3 tracking-wider flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Match Tier Legend
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { range: "90–100%", badge: "Near Perfect Match", bg: "bg-amber-50/60", borderColor: "border-amber-200", barColor: "bg-amber-400", barGradient: "bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500", hex: "#f59e0b" },
                { range: "75–89%",  badge: "Strong Affinity",    bg: "bg-emerald-50/60", borderColor: "border-emerald-200", barColor: "bg-emerald-500", hex: "#10b981" },
                { range: "60–74%",  badge: "Significant Overlap", bg: "bg-sky-50/60",    borderColor: "border-sky-200",     barColor: "bg-sky-500",    hex: "#0ea5e9" },
                { range: "40–59%",  badge: "Moderate Resonance",  bg: "bg-slate-50/60",  borderColor: "border-slate-200",  barColor: "bg-slate-400",  hex: "#94a3b8" },
                { range: "0–39%",   badge: "Light Alignment",     bg: "bg-stone-50/60",  borderColor: "border-stone-200",  barColor: "bg-stone-400",  hex: "#a8a29e" },
              ].map(t => (
                <div key={t.badge} className={`flex items-center gap-2 p-2 rounded-lg ${t.bg} ${t.borderColor} border`}>
                  <div className={`w-3 h-3 rounded-full shrink-0 ${t.barGradient || t.barColor}`} />
                  <div className="min-w-0">
                    <div className={`text-[10px] font-bold leading-tight truncate`}>
                      {t.badge}
                    </div>
                    <div className="text-[9px] text-slate-400 leading-tight">{t.range}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 0.5: filter control (denominations / specific view only) */}
          {!displayFamilies && (
            <div className="flex items-center justify-end mb-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(e) => setActiveOnly(e.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-600"
                />
                Active denominations only
              </label>
            </div>
          )}

          {/* RUNNER UPS */}
          <h3 className="font-bold text-slate-800 mb-4 text-lg border-b pb-2">
            {displayFamilies ? 'Runner-Up Families' : 'Runner-Up Traditions'}
          </h3>
          <div className="flex flex-col gap-2 mb-12">
            {displayFamilies ? (
              familyMatches.slice(1).map((fam: any, index: number) => (
                <FamilyCard key={fam.family} familyData={fam} rank={index + 2} />
              ))
            ) : (
              listResults.slice(1).map((denom: any, index: number) => (
                <DenominationCard key={denom.id} denom={denom} rank={index + 2} />
              ))
            )}
          </div>

          {/* THEOLOGICAL FINGERPRINT (13-AXIS CHART — OVERHAULED) */}
          <div className="mt-12 mb-8">
            <h3 className="font-serif text-2xl font-bold text-slate-800 mb-2">Your Theological Fingerprint</h3>
            <p className="text-slate-600 mb-6 text-sm">
              Your positions on 13 bipolar dimensions of Christian theology, grouped by category.
              Click any axis or toggle compare to see how you line up with your top match.
            </p>

            {/* === COMPARISON DROPDOWN + DISTINCTIVE VIEWS === */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Compare:</span>
                <select
                  value={compareDenomId ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCompareDenomId(val === "" ? null : val);
                  }}
                  className="px-3 py-2 rounded-full text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 transition-all cursor-pointer"
                >
                  <option value="">— None —</option>
                  {allCoordinates.size > 0
                    ? Array.from(allCoordinates.entries())
                        .sort((a, b) => a[1].name.localeCompare(b[1].name))
                        .map(([id, data]) => (
                          <option key={id} value={id}>
                            {data.name}
                          </option>
                        ))
                    : results.map((denom: any) => (
                        <option key={denom.id} value={denom.id}>
                          {denom.name} ({denom.matchPercentage}%)
                        </option>
                      ))}
                </select>
              </div>

              {/* === COMPARISON LEGEND (visible when a denomination is selected) === */}
              {compareDenomId !== null && (
                <div className="w-full bg-slate-50 rounded-lg p-3 mb-3 animate-fade-in border border-slate-200/60">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border-2 border-white shadow-sm bg-slate-800 shrink-0" />
                      <span className="text-slate-600">Your Position — <span className="font-semibold text-slate-800">colored by conviction</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-amber-500 border border-white rotate-45 shadow-sm shrink-0" />
                      <span className="text-slate-600"><span className="font-semibold text-slate-800">{allCoordinates.get(compareDenomId)?.name || compareDenomId}</span> (amber diamond)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-10 h-1 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-slate-500">Aligned (≤15)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-10 h-1 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-slate-500">Diverging (≤50)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-10 h-1 rounded-full bg-red-500 shrink-0" />
                      <span className="text-slate-500">{"Opposed (>50)"}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pt-2 border-t border-slate-200/60 text-[11px]">
                <ConvictionSwatch score={5} label="Extreme (<10 or >90)" />
                <ConvictionSwatch score={20} label="Strong (<25 or >75)" />
                <ConvictionSwatch score={50} label="Moderate (<40 or >60)" />
                <ConvictionSwatch score={55} label="Neutral (40–60)" />
              </div>

            </div>

            {/* === CATEGORIZED ACCORDION FINGERPRINT === */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {Object.entries(FINGERPRINT_CATEGORIES).map(([catKey, catData]) => {
                const isCollapsed = collapsedCategories[catKey] ?? false;
                return (
                  <div key={catKey} className="border-b border-slate-100 last:border-b-0">
                    {/* Category Header */}
                    <button
                      type="button"
                      className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                      onClick={() =>
                        setCollapsedCategories({
                          ...collapsedCategories,
                          [catKey]: !isCollapsed,
                        })
                      }
                    >
                      <div>
                        <span className="font-bold text-slate-800 text-sm">{catData.label}</span>
                        <span className="text-xs text-slate-400 ml-2">{catData.desc}</span>
                      </div>
                      <svg
                        className={`w-4 h-4 text-slate-400 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Category Body */}
                    {!isCollapsed && (
                      <div className="px-5 pb-4 pt-1 bg-slate-50/50">
                        {catData.axes.map((axis) => {
                          const labels = AXIS_LABELS[axis];
                          const score = userCoordsWithTolerance[axis];
                          if (score === undefined || score === null) return null;

                          const isLeft = score > 50;
                          const intensity = Math.abs(score - 50) / 50;
                          const dotPercent = 100 - score;
                          const poleLabel = isLeft ? labels.left : labels.right;
                          const isZoomed = expandedAxis === axis;

                          // Comparison data (selected denomination from allCoordinates)
                          const compareDenomCoord = compareDenomId !== null ? allCoordinates.get(compareDenomId) : undefined;
                          const compareScore = compareDenomCoord?.dimCoords?.[axis];
                          const hasCompare = compareDenomCoord !== undefined && compareScore !== undefined;

                          return (
                            <div key={axis} className="mb-3 last:mb-0">
                              <button
                                type="button"
                                className="w-full text-left"
                                onClick={() => setExpandedAxis(isZoomed ? null : axis)}
                              >
                                {/* Pole Labels */}
                                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1 px-1">
                                  <span className={isLeft ? "text-blue-700" : ""}>{labels.left}</span>
                                  <span className={!isLeft ? "text-blue-700" : ""}>{labels.right}</span>
                                </div>

                                {/* Gradient Track + Lollipop Dot */}
                                <div className="relative h-6 flex items-center">
                                  {/* Track */}
                                  <div className="absolute inset-y-0 left-0 right-0 flex items-center">
                                    <div className="w-full h-1.5 rounded-full bg-gradient-to-r from-slate-400 via-slate-200 to-blue-500 relative">
                                      {/* Center tick */}
                                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-4 bg-slate-400 z-10" />
                                    </div>
                                  </div>

                                  {/* User Lollipop Dot (colored by conviction level) */}
                                  <div
                                    className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow z-20 transition-all ${getConvictionStyle(score).dotColor} ${
                                      getConvictionStyle(score).animate
                                        ? getConvictionStyle(score).animate
                                          : ""
                                    } ring-1 ${getConvictionStyle(score).ringColor}`}
                                    style={{ left: `${dotPercent}%` }}
                                  />

                                  {/* Comparison Diamond (Selected Denomination — fixed indigo) */}
                                  {hasCompare && (
                                    <div
                                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
                                      style={{ left: `${100 - compareScore}%` }}
                                      title={compareDenomCoord?.name}
                                    >
                                      <div className="w-2.5 h-2.5 bg-amber-500 border border-white rotate-45 shadow-sm" />
                                    </div>
                                  )}

                                  {/* Gap Indicator (when both present — colored by gap size) */}
                                  {hasCompare && (
                                    <div
                                      className={`absolute top-1/2 h-1.5 -translate-y-0.75 z-10 rounded-full opacity-70 ${getGapStyle(Math.abs(score - compareScore)).lineColor}`}
                                      style={{
                                        left: `${Math.min(dotPercent, 100 - compareScore)}%`,
                                        width: `${Math.abs(dotPercent - (100 - compareScore))}%`,
                                      }}
                                    />
                                  )}
                                </div>

                                {/* Score + Pole on Hover */}
                                <div className="flex justify-end mt-0.5">
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {score}/100 • {poleLabel}
                                  </span>
                                </div>
                              </button>

                              {/* Zoom Card */}
                              {isZoomed && (
                                <div className="mt-2 p-4 bg-white rounded-lg border border-slate-200 shadow-inner text-sm">
                                  <p className="text-slate-700 font-medium mb-1">{labels.desc}</p>
                                  <p className="text-slate-500 text-xs">
                                    Your position (<strong>{score}/100</strong>) leans toward{" "}
                                    <strong>{poleLabel}</strong>.
                                    {score > 90 || score < 10
                                      ? " This is an extreme conviction."
                                      : score > 75 || score < 25
                                      ? " This is a strong conviction."
                                      : score > 60 || score < 40
                                      ? " This is a moderate lean."
                                      : " This is a neutral / balanced position."}
                                    <span className={`ml-1.5 inline-block w-2 h-2 rounded-full ${getConvictionStyle(score).dotColor}`} />
                                  </p>
                                  {hasCompare && (
                                    <p className="text-slate-500 text-xs mt-1">
                                      <strong>{compareDenomCoord?.name}</strong> scores{" "}
                                      <strong>{compareScore}/100</strong> on this axis —{" "}
                                      <span
                                        className={getGapStyle(Math.abs(score - compareScore)).color}
                                      >
                                        {getGapStyle(Math.round(Math.abs(score - compareScore))).label} ({Math.round(Math.abs(score - compareScore))}pt)
                                      </span>
                                      .
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          </div>

          {/* 2D COMPASS CHART */}
          <div className="mb-16">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <CompassChart 
                userCoords={userCoords} 
                userTolerance={userTolerance} 
              />
            </div>
          </div>

          {/* THEOLOGICAL LABEL CLOUD */}
          <div className="mb-16">
            <TheologicalLabelCloud userLabels={userLabels} />
          </div>

          {/* NEXT STEPS & SHARE FOOTER */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12 mb-8">
            
            {/* Save / Share Card */}
            <div className="bg-gradient-to-br from-blue-900 to-slate-900 p-8 rounded-2xl text-white shadow-xl text-center flex flex-col justify-center items-center">
              <h4 className="font-serif font-bold text-2xl mb-2 text-blue-100">Save Your Results</h4>
              <p className="text-sm text-blue-200 mb-6 opacity-80">
                Download a clean summary image of your top matches and compass to share on social media.
              </p>
              <div className="flex flex-col gap-3 w-full sm:w-auto">
                <button 
                  onClick={handleDownloadImage} 
                  disabled={isExporting}
                  className={`bg-white text-blue-900 font-bold py-3 px-8 rounded-full shadow-lg transition-transform flex items-center justify-center gap-2 ${isExporting ? 'opacity-70 cursor-not-allowed' : 'hover:scale-105'}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {isExporting ? "Generating PNG..." : "Download Image"}
                </button>
                <button 
                  onClick={onDownloadLabels} 
                  disabled={isExportingLabels}
                  className={`bg-white text-slate-700 font-bold py-3 px-8 rounded-full shadow-lg transition-transform flex items-center justify-center gap-2 border border-blue-200 ${isExportingLabels ? 'opacity-70 cursor-not-allowed' : 'hover:scale-105'}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  {isExportingLabels ? "Generating PNG..." : "Download Belief Labels"}
                </button>
                <button 
                  onClick={onDownloadFingerprint} 
                  disabled={isExportingFingerprint}
                  className={`bg-white/90 text-slate-700 font-bold py-3 px-8 rounded-full shadow-lg transition-transform flex items-center justify-center gap-2 border border-amber-200 ${isExportingFingerprint ? 'opacity-70 cursor-not-allowed' : 'hover:scale-105'}`}
                >
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  {isExportingFingerprint ? "Generating PNG..." : "Download Fingerprint"}
                </button>
                <a href="https://www.reddit.com/r/TheoCompass/submit/?type=IMAGE" target="_blank" rel="noreferrer" className="text-blue-200 font-medium text-sm hover:text-white underline decoration-blue-500/50 underline-offset-4 transition-colors">
                  Post on r/TheoCompass
                </a>
              </div>
            </div>

            {/* Support Card */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center flex flex-col justify-center items-center">
              <h4 className="font-bold text-slate-800 text-lg mb-2">Deep Dive Visualizations</h4>
              <p className="text-sm text-slate-500 mb-6">
                Coming Soon: <span className="font-medium text-slate-700">Historical/Creedal Timeline</span> & <span className="font-medium text-slate-700">Creedal Alignment Score.</span>
              </p>
              <div className="w-full h-px bg-slate-100 mb-6"></div>
              <h4 className="font-bold text-slate-800 text-lg mb-2">Support TheoCompass</h4>
              <p className="text-sm text-slate-500 mb-6 max-w-sm">
                Help me expand the database to 230+ denominations and build the full v2.0 experience.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <a href="https://ko-fi.com/oroq" target="_blank" rel="noreferrer" className="bg-[#FF5E5B] hover:bg-[#E55350] text-white py-2 px-6 rounded-full font-bold shadow transition-colors flex items-center gap-2">
                  Support on Ko-Fi
                </a>
                <button 
                  onClick={() => setShowRestartModal()} 
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 px-6 rounded-full font-bold transition-colors"
                >
                  Retake Quiz
                </button>
              </div>
            </div>
          </div>

        </div>
      )}
    </main>
  );
}