/** Raw coordinates are accepted only transiently by the check-in callable. */
export interface ConfirmCheckInRequest {
  spotId: string;
  location: { lat: number; lng: number };
  accuracyMeters: number;
  timeZone: string;
}

export interface ConfirmCheckInResponse {
  checkInId: string;
  sessionRecordId: string;
  duplicate: boolean;
}

export interface DeleteCheckInRequest {
  checkInId: string;
}

export interface DeleteCheckInResponse {
  deleted: boolean;
}

export interface DeleteAllCheckInsResponse {
  deleted: number;
}

export type CheckInAggregateEligibility = "accepted" | "excluded" | "pending";

/** The only activity data that is readable by other users. */
export interface SpotActivityPublicSchema {
  status: "recently_trained";
  bucket: "2–4" | "5–9" | "10–24" | "25+";
  window_days: 30;
}

/** Coarse public ranges deliberately avoid exposing the exact account count. */
export const checkInActivityBucket = (
  accounts: number,
): SpotActivityPublicSchema["bucket"] | null => {
  if (accounts < 2) return null;
  if (accounts < 5) return "2–4";
  if (accounts < 10) return "5–9";
  if (accounts < 25) return "10–24";
  return "25+";
};
