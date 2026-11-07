import { AXIS_LABELS } from './_constants';

// --- API CONFIG HELPERS ---
export function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL!;
}

// --- AXIS HELPERS ---
// Map DB axis keys (with underscores) to frontend axis keys (no underscores)
// DB: theol_cons_lib_avg → frontend: theolconslib
export function normalizeAxisKey(dbKey: string): string {
  return dbKey.replace(/_avg$/, "").replace(/_/g, "");
}

// --- CONVICTION LEVEL HELPER ---
export function getConvictionStyle(score: number): {
  level: string;
  color: string;
  bgColor: string;
  dotColor: string;
  ringColor: string;
  animate: string;
} {
  if (score > 90 || score < 10) {
    return {
      level: "Extreme",
      color: "text-purple-700",
      bgColor: "bg-purple-100",
      dotColor: "bg-purple-500",
      ringColor: "ring-purple-300",
      animate: "animate-pulse",
    };
  }
  if (score > 75 || score < 25) {
    return {
      level: "Strong",
      color: "text-red-700",
      bgColor: "bg-red-100",
      dotColor: "bg-red-500",
      ringColor: "ring-red-300",
      animate: "animate-float",
    };
  }
  if (score > 60 || score < 40) {
    return {
      level: "Moderate",
      color: "text-amber-700",
      bgColor: "bg-amber-100",
      dotColor: "bg-amber-500",
      ringColor: "ring-amber-300",
      animate: "",
    };
  }
  return {
    level: "Neutral",
    color: "text-slate-600",
    bgColor: "bg-slate-100",
    dotColor: "bg-slate-500",
    ringColor: "ring-slate-300",
    animate: "",
  };
}

// --- GAP STYLE HELPER (for comparing user vs denomination positions) ---
export function getGapStyle(gap: number): {
  label: string;
  color: string;
  lineColor: string;
} {
  if (gap <= 5) {
    return { label: "Nearly Identical", color: "text-emerald-600 font-medium", lineColor: "bg-emerald-400" };
  }
  if (gap <= 15) {
    return { label: "Well Aligned", color: "text-green-600 font-medium", lineColor: "bg-green-400" };
  }
  if (gap <= 30) {
    return { label: "Moderate Gap", color: "text-amber-600 font-medium", lineColor: "bg-amber-400" };
  }
  if (gap <= 50) {
    return { label: "Significant Divergence", color: "text-orange-600 font-medium", lineColor: "bg-orange-400" };
  }
  if (gap <= 75) {
    return { label: "Strongly Opposed", color: "text-red-600 font-medium", lineColor: "bg-red-400" };
  }
  return { label: "Polar Opposites", color: "text-rose-600 font-medium", lineColor: "bg-rose-400" };
}

// --- GAP LEGEND HELPER (3-category simplified for visual legend) ---
export function getGapLegend(gap: number): { label: string; dotColor: string } {
  if (gap <= 15) return { label: "Aligned", dotColor: "bg-emerald-400" };
  if (gap <= 50) return { label: "Diverging", dotColor: "bg-amber-400" };
  return { label: "Opposed", dotColor: "bg-red-500" };
}

// Compute which axes are most extreme (closest to 0 or 100)
export function getDistinctiveAxes(userCoords: Record<string, number>, count: number = 3): string[] {
  return Object.entries(userCoords)
    .filter(([key]) => AXIS_LABELS[key] !== undefined)
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
    .filter(([key]) => AXIS_LABELS[key])
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
        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
        : "bg-slate-100 text-slate-600 border-slate-200",
    };
  });
}

// Tier styling helper — 5 tiers from 0–100
export function getTierStyle(percentage: number): {
  badge: string;
  bg: string;
  barColor: string;
  barGradient?: string;
  borderColor: string;
  textColor: string;
  hex: string;
} {
  if (percentage >= 90) return { badge: "Near Perfect Match",    bg: "bg-amber-50/60",   barColor: "", barGradient: "bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500", borderColor: "border-amber-200", textColor: "text-amber-700", hex: "#f59e0b" };
  if (percentage >= 75) return { badge: "Strong Affinity",       bg: "bg-emerald-50/60", barColor: "bg-emerald-500", borderColor: "border-emerald-200", textColor: "text-emerald-700", hex: "#10b981" };
  if (percentage >= 60) return { badge: "Significant Overlap",   bg: "bg-sky-50/60",     barColor: "bg-sky-500",   borderColor: "border-sky-200",     textColor: "text-sky-700",     hex: "#0ea5e9" };
  if (percentage >= 40) return { badge: "Moderate Resonance",    bg: "bg-slate-50/60",   barColor: "bg-slate-400",  borderColor: "border-slate-200",  textColor: "text-slate-600",  hex: "#94a3b8" };
  return                     { badge: "Light Alignment",         bg: "bg-stone-50/60",   barColor: "bg-stone-400",  borderColor: "border-stone-200",  textColor: "text-stone-600",  hex: "#a8a29e" };
}

// --- MEMBERSHIP FORMAT HELPER (est_members_global) ---
export function formatMembers(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return Math.round(n / 1_000) + "K";
  return String(n);
}