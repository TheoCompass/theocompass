import { AXIS_LABELS } from './_constants';
import { CONVICTION_RAMP, TIER_STEPS } from '../../lib/palette';

// --- API CONFIG HELPERS ---
export function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL!;
}

// --- REPORT LABELS ---
export type QuizMode = "quick" | "standard" | "deep";

/**
 * The name of a quiz length.
 *
 * This ternary was rebuilt in all three export cards, so a copy change meant
 * editing three files and remembering the third one.
 */
export function modeLabel(mode: QuizMode | null | undefined): string {
  if (mode === "quick") return "Quick Mode";
  if (mode === "standard") return "Standard Mode";
  if (mode === "deep") return "Deep Dive";
  return "Unknown Mode";
}

// --- AXIS HELPERS ---
// Map DB axis keys (with underscores) to frontend axis keys (no underscores)
// DB: theol_cons_lib_avg → frontend: theolconslib
export function normalizeAxisKey(dbKey: string): string {
  return dbKey.replace(/_avg$/, "").replace(/_/g, "");
}

// --- MOTION ---
/**
 * True when the reader has asked for reduced motion.
 *
 * The CSS guard in globals.css neutralises keyframes and transitions, but it
 * cannot stop a requestAnimationFrame loop. Anything that counts or eases in
 * JS has to ask this itself and paint its end state instead.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// --- CONVICTION LEVEL HELPER ---
// Conviction is a four-step weight ramp (neutral → extreme) taken from the
// palette: frosted → cerulean → cerulean-600 → navy. It drives both the dot on
// each fingerprint axis and the width of the diverging bar.
// --- AXIS POSITION (one mapping for the dot and the number) ---
// `pct` is where the dot sits, measured from the LEFT edge. `signed` is what the
// reader sees: -100 at the left pole, 0 at neutral, +100 at the right pole, the
// same for every axis including the `invert` ones.
//
// The printed numeral used to be the raw score, which is a coordinate in the
// OPPOSITE frame: on the 13 normal axes a high raw value renders on the left, so
// a dot hugging the left pole was labelled 80 while a dot hugging the right pole
// (certainty, raw 80) carried the same 80. Same number, opposite ends. Signing
// the value removes the ambiguity without moving a single stored number.
//
// Conviction colour stays on the RAW score: getConvictionStyle buckets on
// distance from 50, which is already pole-agnostic.
export function axisPosition(score: number, invert?: boolean): {
  /** Dot position, 0 (left pole) to 100 (right pole). */
  pct: number;
  /** Printed position, -100 (left pole) to +100 (right pole). */
  signed: number;
} {
  const pct = invert ? score : 100 - score;
  // `|| 0` turns the -0 that Math.round produces just left of centre into 0.
  const signed = Math.round((pct - 50) * 2) || 0;
  return { pct, signed };
}

/** `+64` / `-32` / `0` - a bare 0 must not read as "no data". */
export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function getConvictionStyle(score: number): {
  level: string;
  color: string;
  bgColor: string;
  ringColor: string;
  animate: string;
  hex: string;
  /** 0 = neutral, 3 = extreme. Feed this to the fingerprint bar. */
  step: number;
} {
  // Bands are a little wider than they were (90/75/60 -> 88/72/56 on the high
  // side). The old cut-offs meant almost every axis came back "moderate" or
  // "neutral", so the ramp never showed its top half at all.
  if (score > 88 || score < 12) {
    return {
      level: "Extreme",
      color: "text-cerulean-900",
      bgColor: "bg-cerulean-100",
      ringColor: "ring-punch/40",
      animate: "",
      hex: CONVICTION_RAMP[3],
      step: 3,
    };
  }
  if (score > 72 || score < 28) {
    return {
      level: "Strong",
      color: "text-cerulean-900",
      bgColor: "bg-cerulean-100",
      ringColor: "ring-cerulean-600/30",
      animate: "",
      hex: CONVICTION_RAMP[2],
      step: 2,
    };
  }
  if (score > 56 || score < 44) {
    return {
      level: "Moderate",
      color: "text-ink-soft",
      bgColor: "bg-cerulean-50",
      ringColor: "ring-cerulean-400",
      animate: "",
      hex: CONVICTION_RAMP[1],
      step: 1,
    };
  }
  return {
    level: "Neutral",
    color: "text-ink-muted",
    bgColor: "bg-paper",
    ringColor: "ring-rule",
    animate: "",
    hex: CONVICTION_RAMP[0],
    step: 0,
  };
}

// --- GAP STYLE HELPER (for comparing user vs denomination positions) ---
// Divergence is the ONLY warm signal on the page: cool = aligned, warm = apart.
// Returns a hex as well as a label: the gap is drawn as a band on the axis rail
// and as a cell in the summary strip, and neither of those can take a class.
// Measured on paper: 4.90 / 5.97 / 5.55 / 5.82 / 7.44 / 10.45:1 - all AA.
export type GapTone = "aligned" | "moderate" | "divergent";

export function getGapStyle(gap: number): {
  label: string;
  hex: string;
  tone: GapTone;
} {
  if (gap <= 5) {
    return { label: "Nearly Identical", hex: "#1f7a5f", tone: "aligned" };
  }
  if (gap <= 15) {
    return { label: "Well Aligned", hex: "#37647f", tone: "aligned" };
  }
  if (gap <= 30) {
    return { label: "Moderate Gap", hex: "#8a5a00", tone: "moderate" };
  }
  if (gap <= 50) {
    return { label: "Significant Divergence", hex: "#c1121f", tone: "divergent" };
  }
  if (gap <= 75) {
    return { label: "Strongly Opposed", hex: "#a30f1b", tone: "divergent" };
  }
  return { label: "Polar Opposites", hex: "#7a0a14", tone: "divergent" };
}

// --- GAP LEGEND HELPER (3-category simplified for visual legend) ---
export function getGapLegend(gap: number): { label: string; dotColor: string } {
  if (gap <= 15) return { label: "Aligned", dotColor: "bg-accent" };
  if (gap <= 50) return { label: "Diverging", dotColor: "bg-blue-300" };
  return { label: "Opposed", dotColor: "bg-warm" };
}


// Compute which axes are most extreme (closest to 0 or 100)
// Meta-axes (tolerance/certainty) are excluded: they sit near an extreme for
// almost everyone, so they would crowd out genuinely distinctive traits.
export function getDistinctiveAxes(userCoords: Record<string, number>, count: number = 3): string[] {
  return Object.entries(userCoords)
    .filter(([key]) => AXIS_LABELS[key] !== undefined && !AXIS_LABELS[key].meta)
    .sort((a, b) => {
      const extremityA = Math.abs(a[1] - 50);
      const extremityB = Math.abs(b[1] - 50);
      return extremityB - extremityA;
    })
    .slice(0, count)
    .map(([key]) => key);
}

// Helper: extract 2-3 defining trait pole labels for a denomination
export function getTraitTags(
  dimCoords: Record<string, number> | undefined,
  userCoords?: Record<string, number>,
  count: number = 2
): { label: string; color: string }[] {
  if (!dimCoords || Object.keys(dimCoords).length === 0) return [];
  const axes = Object.entries(dimCoords)
    .filter(([key]) => AXIS_LABELS[key] && !AXIS_LABELS[key].meta)
    .sort((a, b) => {
      const extremityA = Math.abs(a[1] - 50);
      const extremityB = Math.abs(b[1] - 50);
      return extremityB - extremityA;
    })
    .slice(0, count);

  return axes.map(([key, score]) => {
    const labels = AXIS_LABELS[key];
    const pole = score > 50 ? labels.left : labels.right;
    const aligned = userCoords && userCoords[key] !== undefined
      ? Math.abs(score - userCoords[key]) <= 15
      : false;
    return {
      label: pole,
      color: aligned
        ? "bg-sage-soft text-sage border-sage/30"
        : "bg-paper text-ink-muted border-rule",
    };
  });
}

// Tier styling helper - 5 tiers from 0-100, one per HUE (red / green / blue /
// violet / slate) so the legend swatch and the row bar are recognisably the
// same thing. Punch stays the 90+ step only: red must mean "this is the one",
// not "this is a match". Hexes come from lib/palette.ts (single source).
const TIER_STYLES = [
  { badge: "Near Perfect Match",  bg: "bg-punch-soft",   barColor: "bg-punch",     borderColor: "border-punch/40",     textColor: "text-punch-ink" },
  { badge: "Strong Affinity",     bg: "bg-tier-2/10",    barColor: "bg-tier-2",    borderColor: "border-tier-2/40",    textColor: "text-tier-2" },
  { badge: "Significant Overlap", bg: "bg-cerulean-50",  barColor: "bg-tier-3",    borderColor: "border-tier-3/40",    textColor: "text-cerulean-800" },
  { badge: "Moderate Resonance",  bg: "bg-tier-4/10",    barColor: "bg-tier-4",    borderColor: "border-tier-4/40",    textColor: "text-tier-4" },
  { badge: "Light Alignment",     bg: "bg-muted-soft",   barColor: "bg-tier-5",    borderColor: "border-tier-5/30",    textColor: "text-ink-muted" },
] as const;

function tierIndex(percentage: number): number {
  if (percentage >= 90) return 0;
  if (percentage >= 75) return 1;
  if (percentage >= 60) return 2;
  if (percentage >= 40) return 3;
  return 4;
}

export function getTierStyle(percentage: number): {
  badge: string;
  bg: string;
  barColor: string;
  barGradient?: string;
  borderColor: string;
  textColor: string;
  hex: string;
} {
  const index = tierIndex(percentage);
  return { ...TIER_STYLES[index], hex: TIER_STEPS[index].hex };
}


// --- ALIGNMENT SUMMARY (one line instead of the whole fingerprint) ---
// The results card states the outcome, not the data: "Aligned on 11 of 14 axes
// · largest gap: Progressive ↔ Orthodox". The 14-axis view has its own tab.
const ALIGNED_THRESHOLD = 20;

export function getAlignmentSummary(
  dimCoords: Record<string, number> | undefined,
  userCoords: Record<string, number>
): {
  aligned: number;
  total: number;
  widestAxis: string | null;
  widestGap: number;
  widestLeft: string | null;
  widestRight: string | null;
} {
  const empty = {
    aligned: 0,
    total: 0,
    widestAxis: null,
    widestGap: 0,
    widestLeft: null,
    widestRight: null,
  };
  if (!dimCoords) return empty;

  const axes = Object.entries(dimCoords).filter(
    ([key, value]) =>
      AXIS_LABELS[key] &&
      !AXIS_LABELS[key].meta &&
      typeof value === "number" &&
      typeof userCoords[key] === "number"
  );
  if (axes.length === 0) return empty;

  let aligned = 0;
  let widestGap = -1;
  let widestAxis: string | null = null;

  for (const [key, value] of axes) {
    const gap = Math.abs(value - userCoords[key]);
    if (gap <= ALIGNED_THRESHOLD) aligned += 1;
    if (gap > widestGap) {
      widestGap = gap;
      widestAxis = key;
    }
  }

  const labels = widestAxis ? AXIS_LABELS[widestAxis] : undefined;

  return {
    aligned,
    total: axes.length,
    widestAxis: widestGap > ALIGNED_THRESHOLD ? widestAxis : null,
    widestGap,
    widestLeft: labels?.left ?? null,
    widestRight: labels?.right ?? null,
  };
}



// --- MEMBERSHIP FORMAT HELPER (est_members_global) ---
export function formatMembers(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return Math.round(n / 1_000) + "K";
  return String(n);
}

// --- ACTIVE-ONLY FILTER HELPERS (shared by the results list and the export image) ---
export type CoordsMap = Map<
  string,
  {
    name: string;
    family: string;
    dimCoords: Record<string, number>;
    isActive?: boolean;
    estMembers?: number | null;
  }
>;

// Treat an unknown active-state as active so we never hide a tradition by accident.
export function isActiveDenom(denom: any, allCoordinates: CoordsMap): boolean {
  if (denom?.isActive !== undefined && denom?.isActive !== null) {
    return denom.isActive !== false;
  }
  const coord = allCoordinates.get(denom?.id);
  return coord?.isActive !== false;
}

// Filter a ranked denomination list to active traditions (order preserved).
export function filterDenomsByActive(results: any[], allCoordinates: CoordsMap): any[] {
  return results.filter((d: any) => isActiveDenom(d, allCoordinates));
}

// Filter families: keep only active members, drop families with no active members,
// recompute each family percentage from its surviving members, and re-sort.
export function filterFamiliesByActive(familyMatches: any[], allCoordinates: CoordsMap): any[] {
  const kept = familyMatches
    .map((fam: any) => {
      const members = (fam.allDenominations ?? []).filter((d: any) =>
        isActiveDenom(d, allCoordinates)
      );
      if (members.length === 0) return null;
      const avg =
        members.reduce((sum: number, d: any) => sum + (d.matchPercentage ?? 0), 0) /
        members.length;
      return {
        ...fam,
        allDenominations: members,
        topDenomination: members[0],
        matchPercentage: Number(avg.toFixed(2)),
      };
    })
    .filter(Boolean) as any[];
  return kept.sort((a, b) => b.matchPercentage - a.matchPercentage);
}