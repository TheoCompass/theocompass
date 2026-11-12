"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Shell } from "./_Shell";
import { SegmentedTabs } from "./_SegmentedTabs";
import { MatchesPanel } from "./_sections/MatchesPanel";
import { RunnerUpList } from "./_sections/RunnerUpList";
import { FingerprintPanel } from "./_sections/FingerprintPanel";
import { CompassPanel } from "./_sections/CompassPanel";
import { LabelsPanel } from "./_sections/LabelsPanel";
import { SharePanel } from "./_sections/SharePanel";
import { uniqueLabels, type Label } from "../TheologicalLabelCloud";
import {
  ResultSelection,
  ResultsTabId,
  RunnerUpItem,
} from "./_sections/_panelTypes";
import { filterFamiliesByActive, formatMembers } from "../_helpers";

/**
 * How many runner-ups show before "Show all N".
 *
 * Nine, not ten: the top match is a separate card above this list, so nine
 * here makes the default view read as "your top ten" - the number people
 * expect - instead of an unexplained eleven.
 */
const PAGE_SIZE = 9;

export interface ResultsDashboardProps {
  results: any[];
  familyMatches: any[];
  userCoords: Record<string, number>;
  userTolerance: number;
  userCertainty: number;
  userLabels: Label[];
  selectedMode: "quick" | "standard" | "deep" | null;
  isCalculating: boolean;
  showSpecific: boolean;
  activeOnly: boolean;
  compareDenomId: string | null;
  expandedAxis: string | null;
  collapsedCategories: Record<string, boolean>;
  allCoordinates: Map<string, { name: string; family: string; dimCoords: Record<string, number>; isActive?: boolean; estMembers?: number | null }>;
  isExporting: boolean;
  isExportingLabels: boolean;
  isExportingFingerprint: boolean;
  onSetShowSpecific: (val: boolean) => void;
  onSetActiveOnly: (val: boolean) => void;
  onSetCompareDenomId: (id: string | null) => void;
  onSetExpandedAxis: (axis: string | null) => void;
  onSetCollapsedCategories: (cats: Record<string, boolean>) => void;
  onDownloadImage: () => void;
  onDownloadLabels: () => void;
  onDownloadFingerprint: () => void;
  onRetake: () => void;
}

/** A small segmented control used for the results filters. */
function Toggle<T extends string | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="meta hidden sm:inline">{label}</span>
      <div role="group" aria-label={label} className="flex border border-rule-strong">
        {options.map((option) => {
          const isActive = value === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(option.value)}
              className={`px-2.5 py-1 text-2xs font-medium transition-colors ${
                isActive
                  ? "bg-accent text-white"
                  : "text-ink-muted hover:bg-muted-soft hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ResultsDashboard({
  results,
  familyMatches,
  userCoords,
  userTolerance,
  userCertainty,
  userLabels,
  selectedMode,
  isCalculating,
  showSpecific,
  activeOnly,
  compareDenomId,
  expandedAxis,
  collapsedCategories,
  allCoordinates,
  isExporting,
  isExportingLabels,
  isExportingFingerprint,
  onSetShowSpecific,
  onSetActiveOnly,
  onSetCompareDenomId,
  onSetExpandedAxis,
  onSetCollapsedCategories,
  onDownloadImage,
  onDownloadLabels,
  onDownloadFingerprint,
  onRetake,
}: ResultsDashboardProps) {
  const [tab, setTab] = useState<ResultsTabId>("matches");
  const [showAll, setShowAll] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Tolerance and certainty are separate meta-axes computed server-side.
  const userCoordsWithDerived: Record<string, number> = {
    ...userCoords,
    tolerance: userTolerance,
    certainty: userCertainty,
  };

  // Same dedupe the label cloud applies. A multi-select answer can contribute
  // three raw entries but only two chips, because two options in the data can
  // carry the same label text, and this count has to agree with the list it is
  // counting rather than with the payload's length.
  const uniqueLabelCount = useMemo(() => uniqueLabels(userLabels).length, [userLabels]);

  const familyMatchesFiltered = useMemo(
    () => (activeOnly ? filterFamiliesByActive(familyMatches, allCoordinates) : familyMatches),
    [activeOnly, familyMatches, allCoordinates]
  );

  const displayFamilies =
    selectedMode === "quick" && !showSpecific && familyMatchesFiltered.length > 0;

  const listResults = useMemo(() => {
    const enriched = results.map((d: any) => {
      const coord = allCoordinates.get(d.id);
      return {
        ...d,
        isActive: d.isActive ?? coord?.isActive,
        estMembers: d.estMembers ?? coord?.estMembers,
      };
    });
    return activeOnly ? enriched.filter((d: any) => d.isActive !== false) : enriched;
  }, [results, allCoordinates, activeOnly]);

  const total = displayFamilies ? familyMatchesFiltered.length : listResults.length;
  const listLabel = displayFamilies ? "families" : "traditions";

  /** The #1 result, normalised into one shape for either mode. */
  const selection: ResultSelection | null = useMemo(() => {
    if (displayFamilies) {
      const fam = familyMatchesFiltered[0];
      if (!fam) return null;
      return {
        key: fam.family,
        kind: "family",
        name: fam.family,
        score: fam.matchPercentage ?? 0,
        description: fam.description || "No description available for this family.",
        founded: fam.founded || undefined,
        origin: fam.origin || undefined,
        members: fam.members || undefined,
        closestDenom: fam.topDenomination
          ? {
              name: fam.topDenomination.name,
              matchPercentage: fam.topDenomination.matchPercentage ?? 0,
            }
          : null,
        membersInFamily: (fam.allDenominations ?? []).map((denom: any) => ({
          name: denom.name,
          matchPercentage: denom.matchPercentage ?? 0,
        })),
      };
    }

    const denom = listResults[0];
    if (!denom) return null;
    return {
      key: denom.id,
      kind: "denomination",
      name: denom.name,
      score: denom.matchPercentage ?? 0,
      description: denom.description || "No description available for this tradition.",
      family: denom.family,
      founded: denom.foundedyear || undefined,
      origin: denom.regionorigin || undefined,
      members: denom.estMembers ? `~${formatMembers(denom.estMembers)} members` : undefined,
      isActive: denom.isActive,
      dimCoords: denom.dimCoords,
    };
  }, [displayFamilies, familyMatchesFiltered, listResults]);

  /** Ranks 2..N, trimmed to PAGE_SIZE unless expanded. */
  const runnerUps: RunnerUpItem[] = useMemo(() => {
    if (displayFamilies) {
      const rest = familyMatchesFiltered.slice(1);
      const shown = showAll ? rest : rest.slice(0, PAGE_SIZE);
      return shown.map((fam: any, index: number) => ({
        key: fam.family,
        rank: index + 2,
        name: fam.family,
        sublabel: fam.topDenomination?.name
          ? `Closest: ${fam.topDenomination.name}`
          : undefined,
        score: fam.matchPercentage ?? 0,
        description: fam.description,
        founded: fam.founded || undefined,
        origin: fam.origin || undefined,
        members: fam.members || undefined,
      }));
    }

    const rest = listResults.slice(1);
    const shown = showAll ? rest : rest.slice(0, PAGE_SIZE);
    return shown.map((denom: any, index: number) => ({
      key: denom.id,
      rank: index + 2,
      name: denom.name,
      sublabel: denom.family,
      score: denom.matchPercentage ?? 0,
      description: denom.description,
      founded: denom.foundedyear || undefined,
      origin: denom.regionorigin || undefined,
      members: denom.estMembers ? `~${formatMembers(denom.estMembers)} members` : undefined,
      isActive: denom.isActive,
      dimCoords: denom.dimCoords,
    }));
  }, [displayFamilies, familyMatchesFiltered, listResults, showAll]);

  const compareName =
    compareDenomId !== null ? allCoordinates.get(compareDenomId)?.name : undefined;

  /**
   * The download button follows the active tab. It used to be hard-wired to the
   * match-summary PNG, so "Download" on the Labels tab handed you a compass.
   * Compass has no dedicated export card yet, so it falls back to the summary.
   */
  const download = {
    matches: { label: "Download matches", run: onDownloadImage, busy: isExporting },
    fingerprint: { label: "Download fingerprint", run: onDownloadFingerprint, busy: isExportingFingerprint },
    compass: { label: "Download summary", run: onDownloadImage, busy: isExporting },
    labels: { label: "Download labels", run: onDownloadLabels, busy: isExportingLabels },
    share: { label: "Download summary", run: onDownloadImage, busy: isExporting },
  }[tab];


  const tabs = [
    { id: "matches", label: "Matches" },
    { id: "fingerprint", label: "Fingerprint" },
    { id: "compass", label: "Compass" },
    { id: "labels", label: "Labels" },
    { id: "share", label: "Share" },
  ];

  if (isCalculating) {
    return (
      <Shell width="reading">
        <div
          className="flex flex-col items-center justify-center gap-4 py-24"
          aria-live="polite"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rule border-t-accent" />
          <p className="font-display text-lg text-ink-soft">Calculating alignment…</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell width="reading" className="pb-24">
      {/* ── Sticky: where you are + how to move ───────────────────────── */}
      <div className="chrome-band sticky top-14 z-20 -mx-5 px-5 backdrop-blur md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="meta">Your closest match</div>
            <div className="flex items-baseline gap-2">
              {/* Two lines on a phone: a 34-character tradition name used to be
                  cut to "Independent/Liberal Cat…" next to the download button. */}
              <span
                className="line-clamp-2 break-words font-display text-sm leading-snug text-ink sm:line-clamp-1 sm:truncate sm:text-base sm:leading-tight"
                title={selection?.name ?? undefined}
              >
                {selection?.name ?? "No matches yet"}
              </span>
              {selection && (
                <span className="num shrink-0 font-mono text-sm text-accent">
                  {selection.score}%
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={download.run}
            disabled={download.busy}
            aria-label={download.label}
            title={download.label}
            className="inline-flex shrink-0 items-center gap-1.5 border border-cerulean-600 bg-cerulean-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cerulean-800 disabled:opacity-60 sm:px-3"
          >
            <Download aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">
              {download.busy ? "Generating…" : download.label}
            </span>
          </button>
        </div>
        <SegmentedTabs
          tabs={tabs}
          active={tab}
          onChange={(id) => setTab(id as ResultsTabId)}
        />
      </div>

      {/* ── Filters: one short row instead of ~450px of chrome ────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule py-2">
        <Toggle
          label="Status"
          value={activeOnly}
          onChange={onSetActiveOnly}
          options={[
            { value: false, label: "All traditions" },
            { value: true, label: "Active only" },
          ]}
        />
        {selectedMode === "quick" && (
          <Toggle
            label="Rank by"
            value={showSpecific}
            onChange={onSetShowSpecific}
            options={[
              { value: true, label: "Traditions" },
              { value: false, label: "Families" },
            ]}
          />
        )}
        <details className="ml-auto">
          <summary className="meta cursor-pointer select-none list-none hover:text-ink">
            {activeOnly ? "Historical hidden" : "Historical included"}
            <span className="ml-1 text-rule-strong">· explain</span>
          </summary>
          <p className="mt-1.5 max-w-md text-2xs leading-snug text-ink-muted">
            {activeOnly
              ? "Only traditions that are active today. Historical and extinct movements are hidden from the matches, the compass and the exports."
              : "Every tradition, including historical and no-longer-active movements. Choose “Active only” to hide them from the matches, the compass and the exports."}
          </p>
          {selectedMode === "quick" && (
            <p className="mt-1.5 max-w-md text-2xs leading-snug text-ink-muted">
              Matches are ranked by individual tradition. Each score will show its
              margin of error once the deeper question sets ship — until then, treat
              gaps of a few points as ties.
            </p>
          )}
        </details>
      </div>


      <div
        role="tabpanel"
        id={`results-panel-${tab}`}
        aria-labelledby={`results-tab-${tab}`}
        className="mt-5 sm:mt-8"
      >
        {tab === "matches" && (
          <>
            <MatchesPanel
              selection={selection}
              rank={1}
              userCoords={userCoordsWithDerived}
              totalListed={total}
              listLabel={listLabel}
              compareDenomId={compareDenomId}
              onStartCompare={onSetCompareDenomId}
              onOpenFingerprint={() => setTab("fingerprint")}
              onOpenCompass={() => setTab("compass")}
            />

            <RunnerUpList
              items={runnerUps}
              total={total}
              expandedKey={expandedKey}
              onToggle={(key) =>
                setExpandedKey((current) => (current === key ? null : key))
              }
              showAll={showAll}
              onShowAll={() => setShowAll((value) => !value)}
              compareDenomId={compareDenomId}
              onCompare={onSetCompareDenomId}
              onOpenFingerprint={() => setTab("fingerprint")}
              listLabel={listLabel}
              pageSize={PAGE_SIZE}
            />
          </>
        )}

        {tab === "fingerprint" && (
          <FingerprintPanel
            userCoords={userCoordsWithDerived}
            collapsedCategories={collapsedCategories}
            onSetCollapsedCategories={onSetCollapsedCategories}
            expandedAxis={expandedAxis}
            onSetExpandedAxis={onSetExpandedAxis}
            compareDenomId={compareDenomId}
            onSetCompareDenomId={onSetCompareDenomId}
            allCoordinates={allCoordinates}
            activeOnly={activeOnly}
          />
        )}

        {tab === "compass" && (
          <CompassPanel
            userCoords={userCoordsWithDerived}
            userTolerance={userTolerance}
            userCertainty={userCertainty}
            activeOnly={activeOnly}
          />
        )}

        {tab === "labels" && <LabelsPanel userLabels={userLabels} />}

        {tab === "share" && (
          <SharePanel
            isExporting={isExporting}
            isExportingLabels={isExportingLabels}
            isExportingFingerprint={isExportingFingerprint}
            onDownloadImage={onDownloadImage}
            onDownloadLabels={onDownloadLabels}
            onDownloadFingerprint={onDownloadFingerprint}
            onRetake={onRetake}
          />
        )}
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-4">
        <span className="meta">
          {compareName ? `Comparing against ${compareName}` : `${total} ${listLabel} ranked`}
        </span>
        <span className="meta">{uniqueLabelCount} beliefs in your profile</span>
      </div>
    </Shell>
  );
}

