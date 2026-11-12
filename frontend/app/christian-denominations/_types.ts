import type { Label } from "./TheologicalLabelCloud";

export interface Answer {
  id: string;
  text: string;
  desc: string;
}

export interface Question {
  id: string;
  category: string;
  question: string;
  answers: Answer[];
}

export interface UserResponse {
  questionId: string;
  /** Primary (first) selection; "skipped" when the question was left blank. */
  answerId: string;
  /** Every option affirmed on this question, in click order. */
  answerIds?: string[];
  certainty: number;
  tolerance: number;
  isSilence: boolean;
  silenceType?: "apathetic" | "hostile";
  /**
   * UI provenance only, never read by the scoring engine. "None of the above"
   * and the apathetic-silence row resolve to the same calculation, but they are
   * two different answers on screen, so the quiz has to remember which control
   * the reader actually used to light the right row on restore. Legacy saved
   * responses omit it; they are treated as "rail".
   */
  silenceSource?: "answer-none" | "rail";
}

export interface DenominationMatch {
  id: string;
  name: string;
  family: string;
  matchPercentage: number;
  description?: string;
  foundedyear?: string;
  regionorigin?: string;
  dimCoords?: Record<string, number>;
  isActive?: boolean;
  estMembers?: number | null;
}

export interface FamilyMatch {
  family: string;
  matchPercentage: number;
  description?: string;
  topDenomination?: {
    name: string;
    matchPercentage: number;
  };
  allDenominations?: DenominationMatch[];
}

export interface CalculateResponse {
  status: string;
  dataVersion?: string;
  matches: DenominationMatch[];
  familyMatches?: FamilyMatch[];
  userDimCoords: Record<string, number>;
  userTolerance: number;
  userCertainty: number;
  /**
   * The API sends one entry per affirmed option, so this is `Label[]`, not the
   * `string[]` the labels were once assumed to be.
   */
  userLabels: Label[];
  error?: string;
}

export type DevProfileResponse = Record<string, UserResponse | undefined> & {
  error?: string;
};

export interface DevProfileResponseData {
  profile?: DevProfileResponse;
  error?: string;
}
