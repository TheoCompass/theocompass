import type {
  Question,
  UserResponse,
  CalculateResponse,
  DevProfileResponse,
} from "../app/christian-denominations/_types";
import type { RoadmapData, RoadmapStatus } from "./roadmap";

import { getApiUrl } from "../app/christian-denominations/_helpers";

export interface CoordinateData {
  id: string;
  dimCoords: Record<string, number>;
}

export async function fetchQuestions(mode: string): Promise<Question[]> {
  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/api/questions?mode=${mode}`);

  if (!response.ok) {
    throw new Error("Failed to fetch questions");
  }

  const data = (await response.json()) as Question[];
  return data;
}

export async function calculateResults(
  answers: Record<string, UserResponse>
): Promise<CalculateResponse> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answers),
  });

  const data = (await res.json()) as CalculateResponse;

  if (data.status !== "success") {
    throw new Error(data.error || "Calculation failed");
  }

  return data;
}

export async function fetchCoordinates(): Promise<CoordinateData[]> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/coordinates`);

  if (!res.ok) {
    return [];
  }

  const data = (await res.json()) as CoordinateData[];
  return data;
}

export interface MetaResponse {
  status: string;
  dataVersion: string;
  apiVersion: string;
}

export async function fetchMeta(): Promise<MetaResponse> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/meta`);
  if (!res.ok) {
    throw new Error("Failed to fetch meta");
  }
  return (await res.json()) as MetaResponse;
}

export async function fetchDevProfile(
  denomId: string
): Promise<DevProfileResponse> {
  const apiUrl = getApiUrl();
  const profileRes = await fetch(`${apiUrl}/api/dev/profile?id=${denomId}`);
  const profileData = (await profileRes.json()) as DevProfileResponse & {
    error?: string;
  };

  if (!profileRes.ok) {
    throw new Error(profileData.error || profileRes.statusText);
  }

  if (profileData.error) {
    throw new Error(profileData.error);
  }

  return profileData;
}

// ---------------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------------

export async function fetchRoadmap(): Promise<RoadmapData> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/roadmap`);

  if (!res.ok) {
    throw new Error(`Roadmap unavailable (HTTP ${res.status})`);
  }

  const body = (await res.json()) as { data?: RoadmapData };
  if (!body.data) {
    throw new Error("Roadmap response was empty");
  }
  return body.data;
}

/**
 * Validates the moderator code server-side.
 *
 * Returns false for a rejected code and throws only when the request itself
 * failed, so the caller can tell "wrong code" from "worker is asleep".
 */
export async function unlockRoadmap(code: string): Promise<boolean> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/roadmap/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Code": code },
    body: JSON.stringify({ code }),
  });

  if (res.status === 401) return false;
  if (!res.ok) {
    throw new Error(`Could not reach the API (HTTP ${res.status})`);
  }
  return true;
}

export async function updateRoadmapTask(
  taskId: string,
  status: RoadmapStatus,
  code: string
): Promise<void> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/roadmap/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Admin-Code": code },
    body: JSON.stringify({ status }),
  });

  if (res.status === 401) {
    throw new Error("That code is no longer accepted.");
  }
  if (res.status === 404) {
    throw new Error("That task no longer exists — reload the page.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Update failed (HTTP ${res.status})`);
  }
}

// ---------------------------------------------------------------------------
// Anonymous quiz statistics
// ---------------------------------------------------------------------------

export interface QuizStats {
  totalQuizzes: number;
  today: number;
  last7Days: number;
  trackingSince: string | null;
  byMode: Record<string, number>;
  topFamilies: Array<{ name: string; count: number }>;
  topMatches: Array<{ name: string; count: number }>;
  avgTopMatch: number | null;
  // Added with the collective-results panel. Optional so a frontend deploy that
  // lands before the API (or a cached response from the previous deploy) still
  // type-checks and renders the older summary.
  medianTopMatch?: number | null;
  daily?: Array<{ date: string; count: number }>;
  scoreHistogram?: number[];
  scoreSample?: number;
  familySample?: number;
  matchSample?: number;
  distinctFamilies?: number;
  posture?: { tolerance: number | null; certainty: number | null; sample: number };
}

export async function fetchQuizStats(): Promise<QuizStats> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/stats`);
  if (!res.ok) {
    throw new Error(`Stats unavailable (HTTP ${res.status})`);
  }
  const body = (await res.json()) as { data?: QuizStats };
  if (!body.data) {
    throw new Error("Stats response was empty");
  }
  return body.data;
}

export interface QuizCompletion {
  sessionId: string;
  mode: "quick" | "standard" | "deep";
  answeredCount: number;
  topFamily: string | null;
  topMatchId: string | null;
  topMatchName: string | null;
  topMatchScore: number | null;
  userTolerance: number | null;
  userCertainty: number | null;
}

/**
 * A client-generated id matching the API's `[A-Za-z0-9_-]{8,64}` rule.
 *
 * The API uses these as idempotency keys: one per completed quiz, one per
 * report, so a retry cannot double-count. `crypto.randomUUID` gives 36
 * characters whose hyphens are already legal, and it exists in every browser
 * that can run this app.
 */
export function createClientId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return uuid.slice(0, 64);
}

/** One per completed quiz, so a restored results view cannot double-count. */
export function createQuizSessionId(): string {
  return createClientId();
}

/**
 * Records one completed quiz. Never throws and never blocks the results screen:
 * a failed statistic is worth less than a results page that hangs.
 */
export async function recordQuizCompletion(completion: QuizCompletion): Promise<boolean> {
  try {
    const apiUrl = getApiUrl();
    const res = await fetch(`${apiUrl}/api/quiz/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(completion),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { data?: { recorded?: boolean } };
    return Boolean(body.data?.recorded);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// In-quiz issue reports
// ---------------------------------------------------------------------------

/**
 * The four problems a reader can flag. The API rejects anything else, so this
 * union is the contract; the dialog supplies the labels.
 */
export type IssueType = "typo" | "bad_options" | "framing" | "other";

export interface IssueReport {
  /** Per-report id: a retry after a dropped response is the same report. */
  flagId: string;
  questionId: string;
  issueType: IssueType;
  answerId?: string | null;
  /** The reader's own words, capped at 500 characters server-side. */
  note?: string | null;
  mode?: "quick" | "standard" | "deep" | null;
  questionIndex?: number | null;
  appVersion?: string | null;
}

/**
 * `recorded` and `duplicate` both mean "we have it"; only `failed` needs the
 * retry / mailto fallback. A duplicate is what a retried flag id returns, and
 * telling the reader their report failed would be a lie.
 */
export type IssueReportOutcome = "recorded" | "duplicate" | "failed";

/**
 * Files one report. Never throws: the dialog owns the messaging, and a thrown
 * error there would replace the reader's note with a blank screen.
 */
export async function reportQuestionIssue(report: IssueReport): Promise<IssueReportOutcome> {
  try {
    const apiUrl = getApiUrl();
    const res = await fetch(`${apiUrl}/api/issue-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
    if (!res.ok) return "failed";
    const body = (await res.json()) as { data?: { recorded?: unknown } };
    // An older deploy answers every unknown `/api/*` path with 200 and a health
    // payload, which is how a report against a stale API looked filed and was
    // never stored. Anything but an explicit boolean is treated as a failure, so
    // the reader gets the mailto fallback instead of false reassurance.
    if (typeof body.data?.recorded !== "boolean") return "failed";
    return body.data.recorded ? "recorded" : "duplicate";
  } catch {
    return "failed";
  }
}