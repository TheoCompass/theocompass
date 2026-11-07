import type {
  Question,
  UserResponse,
  CalculateResponse,
  DevProfileResponse,
} from "../app/christian-denominations/_types";

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