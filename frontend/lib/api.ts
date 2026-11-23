import type {
  Question,
  UserResponse,
  CalculateResponse,
  DevProfileResponse,
} from "../app/christian-denominations/_types";
import type { RoadmapData, RoadmapStatus } from "./roadmap";

import { getApiUrl } from "../app/christian-denominations/_helpers";
import { d1LimitErrorFromBody } from "./d1-limit";

/**
 * The error a failed response should become.
 *
 * The free-tier quota is checked first because it is the one failure the reader
 * can do nothing about: reporting it as "failed to fetch" (or worse, as a broken
 * local database) sends them looking for a problem on their side that does not
 * exist. `fallback` names what was being attempted, so an unrecognised 5xx still
 * arrives as a sentence rather than a status code alone.
 */
async function errorFrom(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as unknown;

  const quota = d1LimitErrorFromBody(body, response.headers.get("Retry-After"));
  if (quota) return quota;

  const message =
    body && typeof body === "object" ? (body as { error?: unknown }).error : null;

  return new Error(
    typeof message === "string" && message ? message : `${fallback} (HTTP ${response.status})`
  );
}

export interface CoordinateData {
  id: string;
  dimCoords: Record<string, number>;
}

export async function fetchQuestions(mode: string): Promise<Question[]> {
  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/api/questions?mode=${mode}`);

  if (!response.ok) {
    throw await errorFrom(response, "Failed to fetch questions");
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

  // Checked before the body is read as a result: an error payload is not a
  // calculation, and without this the only signal was `data.status`, which made
  // a quota outage and an empty answer look the same.
  if (!res.ok) {
    throw await errorFrom(res, "Calculation failed");
  }

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
    throw await errorFrom(res, "Failed to fetch meta");
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
    throw await errorFrom(res, "Roadmap unavailable");
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
    throw await errorFrom(res, "Could not reach the API");
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
    throw await errorFrom(res, "Update failed");
  }
}

// ---------------------------------------------------------------------------
// Anonymous quiz statistics
// ---------------------------------------------------------------------------

/**
 * The match answer as a distribution (0007, reworked).
 *
 * The card offers every denomination on the run's list, so the published figure
 * is the list of places themselves rather than a handful of ranges: `counts` is
 * sparse (`{ 1: 6, 4: 2, 47: 1 }`), and the panel draws a cumulative curve from
 * it. JSON turns the numeric keys into strings, so read them through
 * `Object.entries()` with `Number(key)`.
 *
 * `none` is the picker's escape hatch (`0`, "none of these are close") -- an
 * answer about coverage, with no place on the axis. `ranked` is the sum of
 * `counts`, so `ranked + none` is the denominator. The quantiles are places, not
 * averages of places: `median` is the smallest place whose cumulative share
 * reaches 50%, which is why it always names a rank somebody could have picked.
 */
export interface RankTally {
  counts: Record<number, number>;
  none: number;
  ranked: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
}

/**
 * How close the top match is to where the reader actually is (0008) -- the four
 * answers the card offers, in the order it offers them.
 *
 * `fit` and `close` and `off` are judgements about position 1; `exploring` is
 * the answer for a reader who has no church to compare against (curious,
 * seeking, doubting, or not Christian at all). It is an answer rather than a
 * skip, and the API keeps it out of the accuracy denominator instead of
 * counting it as a miss.
 */
export const FEEDBACK_STANCES = ["fit", "close", "off", "exploring"] as const;
export type FeedbackStance = (typeof FEEDBACK_STANCES)[number];

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
  // Post-quiz feedback totals. Optional for the same reason as the fields above:
  // a cached response from the previous deploy still renders without them.
  //
  // `total`, `averageRating` and `ratingHistogram` are the *experience* ratings
  // only -- the stars changed question once (see `rating_metric` in the API), and
  // mixing the two meanings in one average would measure neither.
  //
  // `accurateYes` and `accurateNo` are the *legacy* pair: every judged row,
  // including the pre-0008 rows whose boolean answer cannot be split into
  // "exactly right" and "close". The published figure does not divide them any
  // more -- `topOneMatch()` in `lib/quiz-stats.ts` reads the stance -- and they
  // stay on the payload because the moderator queue and an older frontend bundle
  // still expect them; deleting the sums would make a stale bundle print NaN.
  feedback?: {
    total: number;
    averageRating: number | null;
    /** Legacy pooled counts, kept for older clients. Not the published figure. */
    accurateYes: number;
    accurateNo: number;
    ratingHistogram: number[];
    /**
     * Where readers' own denomination sat in the full results list (0007), as a
     * distribution. It counts only the rows that answered the picker, so
     * `matchJudged` is smaller than `accurateYes + accurateNo`: a "no" written
     * before the pickers existed named no position at all. Optional for the same
     * reason as `feedback` itself -- an older cached payload has no such keys.
     *
     * `0` is the escape hatch, and because the card asks for the closest
     * *denomination* rather than for "your church" it now means what it says: none
     * of the listed denominations were close. That is a coverage signal -- a reader
     * who is unaffiliated, of another faith, or in a tradition the database does
     * not hold -- and it is counted in `matchJudged`, because it is an answer and
     * not a skip.
     */
    matchJudged?: number;
    matchRanks?: RankTally;
    /**
     * The stance question (0008), one population in four mutually exclusive
     * buckets. `fit` is the numerator of the published top-1 figure and `close` /
     * `off` are its denominator (`topOneMatch()`); `exploring` -- a reader with no
     * church to compare against -- is an answer, in `stanceJudged` and in none of
     * those three.
     *
     * This block is the only one on the payload whose denominator is not a subset
     * of `accurateYes + accurateNo`, which is why `stanceJudged` travels beside
     * the counts instead of being inferred from them.
     */
    stanceJudged?: number;
    stanceCounts?: Record<FeedbackStance, number>;
  };
}

export async function fetchQuizStats(): Promise<QuizStats> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/stats`);
  if (!res.ok) {
    throw await errorFrom(res, "Stats unavailable");
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
// Post-quiz feedback
// ---------------------------------------------------------------------------

/**
 * The card at the bottom of the results page: how the quiz felt overall (1-5
 * stars), which denomination is closest to the reader's church, and an optional
 * sentence in their own words.
 *
 * `fitStance` is the one question every reader can answer, and it is what the
 * published accuracy figure follows: `fit` is a hit, `close` and `off` are
 * misses, and `exploring` is neither -- it is a reader with no church to compare
 * against, and the API stores it as an answer while leaving it out of the
 * accuracy denominator.
 *
 * The pick is a position and a reading of it, both tri-state through `null` (the
 * reader skipped the picker) because the API stores a skip as NULL rather than as
 * a miss. `matchRankPos` is the picked denomination's place in the full results
 * list; `0` is the escape hatch -- "none of these are close" -- and it is a real
 * answer, not a skip, so JSON keeps it and it is never dropped.
 *
 * `familyRank` and `familyName` come with the pick: the family that denomination
 * is filed under, and its place among the traditions on screen. They are context
 * for the moderator queue and are never asked for, so they are null exactly when
 * `matchRankPos` is.
 *
 * `accurate` is the pre-0007 spelling of the same answer and is still accepted
 * by the worker, so an old tab can submit after a deploy; new code sends the
 * stance (and optionally the position) and the worker derives the boolean:
 * stance first, then `matchRankPos`, then nothing.
 */
export interface QuizFeedback {
  /** Per-card id: a retry after a dropped response is the same submission. */
  sessionId: string;
  /** The quiz experience, 1-5. Not how close the match felt -- that was the old question. */
  rating: number;
  /** How close the top match is to where they are; null for a skip. */
  fitStance?: FeedbackStance | null;
  /**
   * The family of the denomination they picked, and its place among the
   * traditions on this run's list, 1-based. Both null when the pick is a skip or a
   * coverage answer: the card reads the family off the pick and never asks for it.
   */
  familyRank?: number | null;
  familyName?: string | null;
  /** Their closest denomination's place in the full results list; 0 for "none of these are close"; null for a skip. */
  matchRankPos?: number | null;
  /**
   * The name the picker printed, and how long the list was.
   *
   * Context, not an answer: the API stores the number above and never the label.
   * It travels so a position can be tied to a list this data can actually print --
   * a tab left open across a re-seed, or a body that was never a card, names a
   * denomination the bundle does not have, and the position beside it is dropped
   * instead of published as somebody's answer. A skip sends no name, and
   * `matchRankScope` is the length of the list on screen, which is what makes the
   * number a place in it.
   */
  matchName?: string | null;
  matchRankScope?: number | null;
  /** Legacy yes/no about the #1 match. Ignored when a stance or a position is sent. */
  accurate?: boolean | null;
  comment?: string | null;
  mode?: "quick" | "standard" | "deep" | null;
  topMatchId?: string | null;
  topMatchName?: string | null;
  answeredCount?: number | null;
  appVersion?: string | null;
}

/**
 * `recorded` and `duplicate` both mean "we have it"; only `failed` needs the
 * retry / mailto fallback. A duplicate is what a retried session id returns, and
 * telling the reader their feedback failed would be a lie.
 */
export type FeedbackOutcome = "recorded" | "duplicate" | "failed";

/**
 * Sends one submission. Never throws: the card owns the messaging, and a thrown
 * error there would replace the reader's note with a blank screen.
 */
export async function submitQuizFeedback(feedback: QuizFeedback): Promise<FeedbackOutcome> {
  try {
    const apiUrl = getApiUrl();
    const res = await fetch(`${apiUrl}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(feedback),
    });
    if (!res.ok) return "failed";
    const body = (await res.json()) as { data?: { recorded?: unknown } };
    // An older deploy answers every unknown `/api/*` path with 200 and a health
    // payload, which is how feedback against a stale API looked sent and was
    // never stored. Anything but an explicit boolean is treated as a failure.
    if (typeof body.data?.recorded !== "boolean") return "failed";
    return body.data.recorded ? "recorded" : "duplicate";
  } catch {
    return "failed";
  }
}

// ---------------------------------------------------------------------------
// The feedback queue (moderator)
// ---------------------------------------------------------------------------

/** The three states a row can be in. The API rejects anything else with a 400. */
export type FeedbackStatus = "new" | "reviewed" | "hidden";

export interface FeedbackRow {
  id: number;
  rating: number | null;
  /**
   * Which question that rating answered. `"experience"` is the current card
   * (how the quiz felt overall); `"fit"` is the older one (how close the match
   * felt), kept so the queue never reads a number as the wrong answer.
   *
   * Optional because a response from a worker deployed before migration 0006
   * has no such field -- and every row that predates it answered the old
   * question, so the queue labels a missing value `"fit"` too.
   */
  ratingMetric?: "experience" | "fit";
  /**
   * Tri-state: `true` yes, `false` no, `null` skipped. A skipped question is a
   * shrug, and the queue has to show it as one instead of as a disagreement.
   *
   * Derived, not asked: the stance when there is one, otherwise `matchRankPos`,
   * otherwise the old bundle's boolean. An `exploring` row is `null` here on
   * purpose -- it is judged, just not against a church.
   */
  accurate: boolean | null;
  /**
   * How close the top match is to where the reader is (0008). `null` covers both
   * a skipped question and every row written before it existed, and the queue
   * reads both as "not answered" -- which is why the stance is printed before
   * the boolean rather than instead of it.
   *
   * Optional because a worker deployed before 0008 does not send it.
   */
  fitStance?: FeedbackStance | null;
  /**
   * The family that row's denomination is filed under, and its place among the
   * traditions of that run, 1-based. `null` when the row named no denomination.
   * Optional for the same reason as `ratingMetric`: a worker deployed before 0007
   * does not send it. Context only -- the run's answer is `matchRankPos`, and the
   * family is that answer regrouped.
   */
  familyRank?: number | null;
  /**
   * Where their denomination sat in the full list, 1-based; `0` for "not one of
   * these"; `null` for a skip. This is the position `accurate` falls back to
   * when the row has no stance.
   *
   * `null` is also a "no" written before the pickers existed: that row never
   * said how far off the match was.
   */
  matchRankPos?: number | null;
  /** The reader's words, verbatim, capped at 500 characters server-side. */
  comment: string | null;
  mode: string | null;
  topMatchId: string | null;
  topMatchName: string | null;
  answeredCount: number | null;
  appVersion: string | null;
  dataVersion: string | null;
  status: FeedbackStatus;
  createdAt: string | null;
}

export interface FeedbackCounts {
  new: number;
  reviewed: number;
  hidden: number;
  /**
   * Rows that carry a note, across all three statuses. Not a status itself, and
   * it is what the queue's default view filters on.
   */
  commented: number;
}

export interface FeedbackQueue {
  counts: FeedbackCounts;
  feedback: FeedbackRow[];
}

/** `commented` is the default view; `all` and the three statuses are the rest. */
export type FeedbackFilter = "commented" | "all" | FeedbackStatus;

/** The message both queue calls throw for a refused code, so callers can tell it apart. */
const CODE_REFUSED = "That code is no longer accepted.";

/** True when the failure was the moderator code rather than the network. */
export function isCodeRefused(error: unknown): boolean {
  return error instanceof Error && error.message === CODE_REFUSED;
}

/**
 * The moderator queue.
 *
 * `?commented=1` is a filter on the server, not a filter here: paging a list of
 * bare ratings and hiding the notes in the browser would push the notes off the
 * end of the limit as soon as the table grows.
 */
export async function fetchFeedbackQueue(
  code: string,
  options: { filter?: FeedbackFilter; limit?: number } = {}
): Promise<FeedbackQueue> {
  const apiUrl = getApiUrl();
  const filter = options.filter ?? "commented";
  const params = new URLSearchParams();
  if (filter === "commented") params.set("commented", "1");
  else if (filter !== "all") params.set("status", filter);
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();

  const res = await fetch(`${apiUrl}/api/feedback${query ? `?${query}` : ""}`, {
    headers: { "X-Admin-Code": code },
  });
  if (res.status === 401) {
    throw new Error(CODE_REFUSED);
  }
  if (!res.ok) {
    throw await errorFrom(res, "Could not load the feedback queue");
  }
  const body = (await res.json()) as { data?: FeedbackQueue };
  if (!body.data) {
    throw new Error("The feedback queue came back empty");
  }
  return body.data;
}

/**
 * Moves one row between `new`, `reviewed` and `hidden`, and returns what the
 * worker stored rather than what was clicked.
 *
 * `hidden` is the only status with a public consequence: the aggregate endpoint
 * filters those rows out, so hiding one moves the average and the accuracy
 * figure on the landing page. The page says so next to the button.
 */
export async function setFeedbackStatus(
  id: number,
  status: FeedbackStatus,
  code: string
): Promise<FeedbackRow> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/feedback/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Admin-Code": code },
    body: JSON.stringify({ status }),
  });
  if (res.status === 401) {
    throw new Error(CODE_REFUSED);
  }
  if (res.status === 404) {
    throw new Error("That row no longer exists — reload the page.");
  }
  if (!res.ok) {
    throw await errorFrom(res, "Could not update the feedback row");
  }
  const body = (await res.json()) as { data?: FeedbackRow };
  if (!body.data) {
    throw new Error("The update came back empty");
  }
  return body.data;
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