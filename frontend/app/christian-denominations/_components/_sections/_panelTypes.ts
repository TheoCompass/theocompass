/**
 * Shared shapes for the results page.
 *
 * Lives in its own module so the panels can be imported by the orchestrator
 * without a circular dependency.
 */

export type ResultsTabId =
  | "matches"
  | "fingerprint"
  | "compass"
  | "labels"
  | "share";

/** One row in the runner-up list. */
export interface RunnerUpItem {
  key: string;
  rank: number;
  name: string;
  sublabel?: string;
  score: number;
  description?: string;
  founded?: string;
  origin?: string;
  members?: string;
  isActive?: boolean;
  dimCoords?: Record<string, number>;
}


/** The currently inspected tradition (a family, or a specific denomination). */
export interface ResultSelection {
  key: string;
  kind: "family" | "denomination";
  name: string;
  score: number;
  description: string;
  family?: string;
  founded?: string;
  origin?: string;
  /** Already formatted for display (e.g. "1.2M members" or "~45M"). */
  members?: string | null;
  isActive?: boolean;
  /** Present for specific denominations — powers the axis-by-axis comparison. */
  dimCoords?: Record<string, number>;
  /** Present for families — the strongest denomination inside the family. */
  closestDenom?: { name: string; matchPercentage: number } | null;
  /** Present for families — the top 5 denominations inside the family. */
  membersInFamily?: { name: string; matchPercentage: number }[];
}
