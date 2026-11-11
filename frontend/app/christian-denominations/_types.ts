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
  answerId: string;
  certainty: number;
  tolerance: number;
  isSilence: boolean;
  silenceType?: "apathetic" | "hostile";
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
  userLabels: string[];
  error?: string;
}

export type DevProfileResponse = Record<string, UserResponse | undefined> & {
  error?: string;
};

export interface DevProfileResponseData {
  profile?: DevProfileResponse;
  error?: string;
}
