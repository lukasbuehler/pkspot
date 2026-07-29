import { HttpsError, onCall } from "firebase-functions/v2/https";
import { eventTimeZoneAt } from "./event-time-zone";

interface ResolveEventTimeZoneRequest {
  lat?: unknown;
  lng?: unknown;
}

export const resolveEventTimeZone = onCall(
  { cors: true, invoker: "public" },
  (request): { timeZone: string } => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in to resolve a time zone.");
    }
    const { lat, lng } = (request.data ?? {}) as ResolveEventTimeZoneRequest;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      throw new HttpsError(
        "invalid-argument",
        "lat and lng must be valid map coordinates.",
      );
    }
    return { timeZone: eventTimeZoneAt({ lat, lng }) };
  },
);
