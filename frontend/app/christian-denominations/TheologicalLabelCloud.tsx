"use client";
import { useState, useMemo } from "react";
import { CERTAINTY_TEXT, HUE_BASE } from "../../lib/palette";
import { TIER_DESCRIPTIONS, TIER_LABELS } from "./_constants";
import { CertaintyMeter } from "./_components/_CertaintyMeter";

export interface Label {
  /** Usually a string; the API sometimes sends the whole label object. */
  label: string | { label?: string };
  category: string;
  certainty: number;
  tolerance: number;
  questionId: string;
  desc?: string;
}

/**
 * Reads the text out of either shape, without an `any` cast at every call site:
 * hand it the label field, the whole label object, or the doubly wrapped
 * `{ label: { label } }` that the API sometimes sends.
 */
export function labelText(value: Label | Label["label"] | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return labelText(value.label);
}

/**
 * One entry per distinct label text.
 *
 * A multi-select answer contributes one label per ticked option, and the same
 * label text also sits on options in several different questions, so the
 * payload can legitimately carry the same belief more than once. The dearest
 * instance wins: highest certainty first, then whichever one carries a
 * description.
 *
 * The results footer counts through this too, so the number it prints matches
 * the list it is counting.
 */
export function uniqueLabels(userLabels: Label[] | null | undefined): Label[] {
  if (!userLabels || userLabels.length === 0) return [];

  const map = new Map<string, Label>();
  for (const labelObj of userLabels) {
    const labelKey = labelText(labelObj.label);

    if (!labelKey) continue;

    const existing = map.get(labelKey);
    const shouldReplace =
      !existing ||
      labelObj.certainty > existing.certainty ||
      (labelObj.certainty === existing.certainty && Boolean(labelObj.desc) && !existing.desc);

    if (shouldReplace) map.set(labelKey, labelObj);
  }

  return Array.from(map.values());
}

interface TheologicalLabelCloudProps {
  userLabels: Label[];
  className?: string;
  /** When true the component is hosted inside a results panel (drops outer card). */
  embedded?: boolean;
}

type ViewMode = "importance" | "category";

// Two facts per belief, one channel each, and neither channel is colour:
//   how essential -> the tier's own WORD, on a quiet pill on the chip, plus a
//                    1/5 - 5/5 numeral in the heading that owns the group
//   how sure      -> HOW MANY of three ticks are filled
//
// The first channel has now been tried four times. Five hues had no order; a
// monotone navy ramp was ordered but unreadable at 3px, where its steps sit
// 13 L* apart and blur into one another. A word is ordinal by definition,
// needs no legend, and cannot be confused with the category dot above it.
const TOLERANCE_TEXT = TIER_LABELS;
const TOLERANCE_DESCRIPTIONS = TIER_DESCRIPTIONS;


const CATEGORY_LABELS: Record<string, string> = {
  "GOD": "The Nature of God, Christ, & the Holy Spirit",
  "CHR": "The Church: Its Nature and Structure", 
  "SCR": "Scripture and Authority",
  "SAL": "Humanity, Sin, and Salvation",
  "SAC": "Sacraments and Rites",
  "WOR": "Worship and Spiritual Life",
  "ESC": "The Last Things (Eschatology)",
  "ETH": "Christian Ethics and Life in the World",
  "MET": "Overarching Theological Approaches",
  "GEN": "General"
};

const CATEGORY_SHORT_LABELS: Record<string, string> = {
  "GOD": "God & Christ",
  "CHR": "Church",
  "SCR": "Scripture",
  "SAL": "Salvation",
  "SAC": "Sacraments",
  "WOR": "Worship",
  "ESC": "Eschatology",
  "ETH": "Ethics",
  "MET": "Approaches",
  "GEN": "General"
};



const CATEGORY_SORT_ORDER = [
  "GOD", "CHR", "SCR", "SAL", "SAC", "WOR", "ESC", "ETH", "MET", "GEN"
];

const IMPORTANCE_ORDER = [0, 1, 2, 3, 4];


export default function TheologicalLabelCloud({ userLabels, className = "", embedded = false }: TheologicalLabelCloudProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("importance");
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());

  // Unique beliefs by label text. The shared helper also feeds the results
  // footer, so that count and this list can never disagree.
  const labelMap = useMemo(() => {
    const map = new Map<string, Label>();
    for (const labelObj of uniqueLabels(userLabels)) {
      map.set(labelText(labelObj.label), labelObj);
    }
    return map;
  }, [userLabels]);

  // All labels as array, filtered by search & category
  const filteredLabels = useMemo(() => {
    const all = Array.from(labelMap.values());
    
    return all.filter(labelObj => {
      const text = labelText(labelObj.label);
      
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSearch = text.toLowerCase().includes(q) || 
          (labelObj.desc && labelObj.desc.toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }

      // Category filter (only when not empty)
      if (activeCategories.size > 0) {
        if (!activeCategories.has(labelObj.category || "GEN")) return false;
      }

      return true;
    });
  }, [labelMap, searchQuery, activeCategories]);

  // Importance mode groups - include ALL tiers (empty ones too) for the card layout
  const allImportanceGroups = useMemo(() => {
    return IMPORTANCE_ORDER.map(tol => ({
      tolerance: tol,
      title: TOLERANCE_TEXT[tol],
      labels: filteredLabels
        .filter(l => l.tolerance === tol)
        .sort((a, b) => (b.certainty - a.certainty) || labelText(a.label).localeCompare(labelText(b.label)))
    }));
  }, [filteredLabels]);

  // Category mode groups
  const categoryGroups = useMemo(() => {
    const groups: Record<string, Label[]> = {};
    filteredLabels.forEach(labelObj => {
      const catKey = labelObj.category || "GEN";
      if (!groups[catKey]) groups[catKey] = [];
      groups[catKey].push(labelObj);
    });

    return Object.entries(groups)
      .map(([cat, labels]) => ({
        id: cat,
        title: CATEGORY_LABELS[cat] || cat,
        shortTitle: CATEGORY_SHORT_LABELS[cat] || cat,
        // Tier first, so the tier pills cluster into runs. That makes the word
        // do the grouping job inside a topic without adding five sub-headers to
        // a list that may only hold eight beliefs.
        labels: labels.sort((a, b) => 
          ((a.tolerance ?? 2) - (b.tolerance ?? 2)) ||
          (b.certainty - a.certainty) || 
          labelText(a.label).localeCompare(labelText(b.label))
        )
      }))
      .sort((a, b) => {
        const indexA = CATEGORY_SORT_ORDER.indexOf(a.id);
        const indexB = CATEGORY_SORT_ORDER.indexOf(b.id);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      });
  }, [filteredLabels]);

  // Accordion state: which groups are expanded (for category view only)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set([]));

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  // Available categories for chips (derived from all labels, not just filtered)
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    labelMap.forEach(labelObj => cats.add(labelObj.category || "GEN"));
    return Array.from(cats).sort((a, b) => {
      const indexA = CATEGORY_SORT_ORDER.indexOf(a);
      const indexB = CATEGORY_SORT_ORDER.indexOf(b);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });
  }, [labelMap]);

  const toggleCategoryFilter = (cat: string) => {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setActiveCategories(new Set());
  };

  const hasActiveFilters = searchQuery.length > 0 || activeCategories.size > 0;

  const toggleExpandedLabel = (labelKey: string) => {
    setExpandedLabel(prev => prev === labelKey ? null : labelKey);
  };

  const totalLabels = labelMap.size;

  // Calculate tier distribution for summary bar (using all labels, not filtered)
  const tierCounts = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    labelMap.forEach(labelObj => {
      const tol = labelObj.tolerance ?? 2;
      if (tol >= 0 && tol <= 4) counts[tol]++;
    });
    return counts;
  }, [labelMap]);

  // Check if all beliefs fall into a single tier
  const dominantTier = useMemo(() => {
    const maxCount = Math.max(...tierCounts);
    if (maxCount === totalLabels && totalLabels > 0) {
      const tierIdx = tierCounts.indexOf(maxCount);
      return { idx: tierIdx, name: TOLERANCE_TEXT[tierIdx] };
    }
    return null;
  }, [tierCounts, totalLabels]);

  // Hook order: the empty-state guard has to sit AFTER every useMemo. Returning
  // early above them made the hook count differ between the first render (no
  // labels yet) and the next one (labels arrived), which React treats as an
  // error rather than a no-op.
  if (!userLabels || userLabels.length === 0) return null;

  // One belief: its name, its certainty as a tick count, and - only when the
  // surrounding heading does not already say it - its tier as a word.
  //
  // That rule is why the importance view shows no pill: it sits inside a card
  // headed "[1/5] Core Dogma", so twelve chips each repeating "Core Dogma"
  // would be twelve lines of noise. The topic view interleaves tiers under a
  // category heading, so there the chip must speak for itself.
  const renderLabelPill = (labelObj: Label, keyPrefix: string, idx: number, showTier = true) => {
    const actualLabelText = labelText(labelObj.label);
    const tolerance = Math.max(0, Math.min(4, labelObj.tolerance ?? 2));
    const certainty = Math.max(0, Math.min(3, labelObj.certainty ?? 0));
    const isExpandedLabel = expandedLabel === actualLabelText;
    const certaintyWord = CERTAINTY_TEXT[certainty];
    const tierName = TOLERANCE_TEXT[tolerance];
    const categoryName = CATEGORY_SHORT_LABELS[labelObj.category] || labelObj.category;

    return (
      <div
        key={`${keyPrefix}-${idx}-${actualLabelText}`}
        className={isExpandedLabel ? "w-full" : ""}
      >
        <button
          type="button"
          onClick={() => toggleExpandedLabel(actualLabelText)}
          onMouseEnter={() => setHoveredLabel(actualLabelText)}
          onMouseLeave={() => setHoveredLabel(null)}
          aria-expanded={isExpandedLabel}
          aria-label={`${actualLabelText}. ${certaintyWord}, ${tierName}.`}
          className={`inline-flex max-w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-[3px] border border-rule bg-paper-raised px-2.5 py-1.5 text-left text-mini font-medium leading-tight text-ink transition-colors hover:border-rule-strong hover:bg-paper ${
            hoveredLabel && hoveredLabel !== actualLabelText ? "opacity-40" : "opacity-100"
          } ${isExpandedLabel ? "border-ink" : ""}`}
        >
          <span className="min-w-0">{actualLabelText}</span>
          {showTier && (
            <span className="shrink-0 rounded-[2px] bg-muted-soft px-1.5 py-0.5 text-3xs font-semibold leading-none text-ink-soft">
              {tierName}
            </span>
          )}
          <CertaintyMeter value={certainty} className="ml-auto" />
        </button>

        {/* Full-row inspector: the chip wraps onto its own line, so on a phone
            the description gets the whole width instead of a 24rem sliver. */}
        {isExpandedLabel && (
          <div className="mt-1.5 animate-fade-in border border-rule bg-paper-raised">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-rule px-3 py-2">
              <span className="flex items-center gap-1.5 text-2xs font-semibold text-ink">
                <CertaintyMeter value={certainty} size="sm" />
                {certaintyWord}
              </span>
              <span className="flex items-center gap-1.5 text-2xs text-ink-soft">
                <span className="num rounded-[2px] bg-ink px-1 py-0.5 font-mono text-3xs font-bold leading-none text-paper">
                  {tolerance + 1}/5
                </span>
                {tierName}
              </span>
              <span className="text-2xs text-ink-muted">{categoryName}</span>
            </div>
            <div className="space-y-1 px-3 py-2">
              <p className="text-2xs leading-snug text-ink-muted">
                {TOLERANCE_DESCRIPTIONS[tolerance]}
              </p>
              {labelObj.desc ? (
                <p className="text-mini leading-relaxed text-ink-soft">{labelObj.desc}</p>
              ) : (
                <p className="text-mini italic text-ink-muted">No additional context available.</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`${embedded ? "space-y-4" : "space-y-6"} ${className}`}>
      {/* ─── HEADER: Title + View Toggle + Legend ─── */}
      <div className={`${embedded ? "card p-4 md:p-6 sm:p-8 space-y-4" : "card p-6 space-y-5"}`}>
        {/* Title Row */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <h3 className="font-serif text-xl font-bold text-ink">Theological Labels</h3>
            <p className="text-sm text-ink-muted">
              {totalLabels} beliefs, ranked from core dogma to personal preference.
            </p>
          </div>
          
          {/* View Toggle — restyled */}
          <div className="flex shrink-0 gap-1 border border-rule bg-muted-soft p-1">
            <button
              onClick={() => setViewMode("importance")}
              className={`px-3 py-1.5 text-2xs font-semibold transition-colors ${
                viewMode === "importance" 
                  ? "bg-ink text-white" 
                  : "text-ink-muted hover:text-ink-soft hover:bg-paper-raised/50"
              }`}
            >
              By importance
            </button>
            <button
              onClick={() => setViewMode("category")}
              className={`px-3 py-1.5 text-2xs font-semibold transition-colors ${
                viewMode === "category" 
                  ? "bg-ink text-white" 
                  : "text-ink-muted hover:text-ink-soft hover:bg-paper-raised/50"
              }`}
            >
              By topic
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="space-y-2 md:space-y-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search labels..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-paper border border-rule rounded-[4px] focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-ink placeholder:text-ink-muted"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-soft"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Category Filter Chips */}
          {availableCategories.length > 1 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-3xs font-bold uppercase tracking-wider text-ink-muted mr-1 shrink-0">Filter:</span>
              {availableCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => toggleCategoryFilter(cat)}
                  className={`border px-2.5 py-1 text-2xs font-medium transition-colors ${
                    activeCategories.has(cat)
                      ? "bg-accent-soft border-accent text-accent"
                      : "bg-paper-raised border-rule text-ink-muted hover:border-rule-strong hover:text-ink-soft"
                  }`}
                >
                  {CATEGORY_SHORT_LABELS[cat] || cat}
                  <span className="ml-1 opacity-60">
                    {Array.from(labelMap.values()).filter(l => (l.category || "GEN") === cat).length}
                  </span>
                </button>
              ))}
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="border border-punch-300 px-2.5 py-1 text-2xs font-medium text-punch-ink transition-colors hover:bg-punch-soft"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>

        {/* Legend — explains only what is actually on screen. The tier pill
            appears in the topic view alone (the importance view names the tier
            in its card heading), so the pill key only appears there too. */}
        <div className="flex flex-col gap-2 border border-rule bg-paper p-2.5 lg:flex-row lg:items-center lg:gap-6">
          {viewMode === "category" && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                aria-hidden="true"
                className="shrink-0 rounded-[2px] bg-muted-soft px-1.5 py-0.5 text-3xs font-semibold leading-none text-ink-soft"
              >
                {TOLERANCE_TEXT[1]}
              </span>
              <span className="text-2xs text-ink-muted">
                = how essential, <span className="num">1/5</span> core to{" "}
                <span className="num">5/5</span> optional
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="meta shrink-0">Ticks = how sure</span>
            {CERTAINTY_TEXT.map((text, i) => (
              <span key={text} className="flex items-center gap-1 text-2xs text-ink-muted">
                <CertaintyMeter value={i} size="sm" />
                {text}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* TIER SUMMARY BAR (Importance view only) */}
      {viewMode === "importance" && totalLabels > 0 && (
        <div className="border border-rule bg-paper-raised p-4 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-3xs font-bold uppercase tracking-wider text-ink-muted">Belief Distribution</span>
            {dominantTier && (
              <span className="border border-rule bg-paper px-2 py-0.5 text-3xs font-bold text-ink-soft">
                All beliefs are {dominantTier.name}
              </span>
            )}
          </div>
          {/* A ranked table, not a five-segment bar. The bar needed a legend to
              be read at all, and the legend was the only place the tier names
              appeared; here each name sits on its own row and the bar carries
              length, which needs no key. Rows run most -> least essential, so
              the order is the scale. */}
          <div className="space-y-1.5">
            {IMPORTANCE_ORDER.map((i) => {
              const count = tierCounts[i];
              const pct = totalLabels > 0 ? Math.round((count / totalLabels) * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="num w-7 shrink-0 font-mono text-3xs text-ink-muted">
                    {i + 1}/5
                  </span>
                  <span className="w-24 shrink-0 truncate text-2xs font-semibold text-ink sm:w-32">
                    {TOLERANCE_TEXT[i]}
                  </span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden bg-muted-soft">
                    <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="num w-6 shrink-0 text-right font-mono text-3xs text-ink-muted">
                    {count}
                  </span>
                  <span className="num hidden w-8 shrink-0 text-right font-mono text-3xs text-ink-muted sm:inline-block">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── LABEL CLOUD ─── */}
      <div key={viewMode} className="animate-fade-in space-y-2 md:space-y-3">
        {viewMode === "importance" ? (
          allImportanceGroups.every((group) => group.labels.length === 0) ? (
            <div className="bg-paper-raised p-8 sm:p-12 rounded-[4px] border border-rule text-center">
              <p className="text-ink-muted font-medium">No labels match your current filters.</p>
              {hasActiveFilters && (
                <button onClick={clearAllFilters} className="mt-2 text-sm text-accent hover:text-accent font-medium">
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            /* ─── IMPORTANCE VIEW: Persistent Tier Cards ─── */
            <div className="space-y-2 md:space-y-3">
              {allImportanceGroups.filter((group) => group.labels.length > 0).map((group) => {
                return (
                  <div
                    key={group.tolerance}
                    className="overflow-hidden border border-rule bg-paper-raised"
                  >
                    {/* Card Header — the tier's place in the scale (1/5 … 5/5)
                        and its meaning, on every width. The numeral replaces
                        the colour rail: a number is ordinal without being a
                        shade anyone has to tell apart. */}
                    <div className="border-b border-rule bg-paper/80 px-3 py-2.5 sm:px-5 sm:py-3">
                      <div className="flex items-center gap-2">
                        <span className="num flex shrink-0 items-center rounded-[2px] bg-ink px-1.5 py-0.5 font-mono text-3xs font-bold leading-none text-paper">
                          {group.tolerance + 1}/5
                        </span>
                        <span className="font-serif font-bold text-ink">{group.title}</span>
                        <span className="num ml-auto font-mono text-3xs text-ink-muted">
                          {group.labels.length} {group.labels.length === 1 ? "label" : "labels"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-2xs leading-snug text-ink-muted">
                        {TOLERANCE_DESCRIPTIONS[group.tolerance]}
                      </p>
                    </div>

                    {/* Card Body */}
                    <div className="px-3 py-3 sm:px-5 sm:py-4">
                      <div className="flex flex-wrap gap-2">
                        {group.labels.map((labelObj, idx) =>
                          renderLabelPill(labelObj, `imp-${group.tolerance}`, idx, false)
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : categoryGroups.length === 0 ? (
          <div className="bg-paper-raised p-8 sm:p-12 rounded-[4px] border border-rule text-center">
            <p className="text-ink-muted font-medium">No labels match your current filters.</p>
            {hasActiveFilters && (
              <button onClick={clearAllFilters} className="mt-2 text-sm text-accent hover:text-accent font-medium">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          /* ─── CATEGORY VIEW (Accordion) ─── */
          <div className="space-y-2">
            {categoryGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.title);
              return (
                <div key={group.id} className="bg-paper-raised rounded-[4px] border border-rule overflow-hidden transition-all">
                  {/* Accordion Header */}
                  <button
                    onClick={() => toggleGroup(group.title)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-paper sm:px-5 sm:py-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: HUE_BASE[group.id] ?? HUE_BASE.GEN }}
                      />
                      <span className="font-bold text-ink">{group.shortTitle}</span>
                      <span className="rounded-[3px] bg-muted-soft px-2 py-0.5 text-3xs font-medium text-ink-muted">
                        {group.labels.length}
                      </span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-ink-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Accordion Content */}
                  <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
                    isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                  }`}>
                    <div className="px-3 pb-3 pt-1 sm:px-5 sm:pb-4">
                      <div className="flex flex-wrap gap-2">
                        {group.labels.map((labelObj, idx) =>
                          renderLabelPill(labelObj, `cat-${group.id}`, idx)
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Result summary */}
        <div className="text-center text-xs text-ink-muted pt-1">
          Showing {filteredLabels.length} of {totalLabels} labels
          {hasActiveFilters && ` (filtered)`}
        </div>
      </div>
    </div>
  );
}