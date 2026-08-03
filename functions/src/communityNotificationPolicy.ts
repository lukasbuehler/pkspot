import { Timestamp } from "firebase-admin/firestore";
import type { SpotSchema } from "../../src/db/schemas/SpotSchema";

const DAY_MS = 24 * 60 * 60 * 1000;
export const COMMUNITY_EVENT_NOTICE_MS = 30 * DAY_MS;

export function communityEventSendAfter(
  startMs: number,
  nowMs: number,
): Timestamp {
  return Timestamp.fromMillis(
    Math.max(nowMs, startMs - COMMUNITY_EVENT_NOTICE_MS),
  );
}

export function spotQualifiesForCommunityDigest(
  spot: SpotSchema | null,
): boolean {
  return Boolean(
    spot &&
      publicSpotImage(spot) &&
      (spot.rating ?? 0) >= 3 &&
      (spot.num_reviews ?? 0) >= 1 &&
      spot.is_reported !== true &&
      spot.public_notice?.type !== "destroyed" &&
      spot.public_notice?.type !== "inaccessible",
  );
}

export function publicSpotImage(spot: SpotSchema): string {
  return (
    spot.media?.find((media) => media.type === "image" && media.isReported !== true)
      ?.src ?? ""
  );
}

export function nextFridayAtSix(
  nowMs: number,
  timeZone: string,
): { timestamp: Timestamp; week: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const start = Math.ceil((nowMs + 1) / 900_000) * 900_000;
  for (let candidate = start; candidate <= start + 8 * DAY_MS; candidate += 900_000) {
    const parts = Object.fromEntries(
      formatter.formatToParts(candidate).map((part) => [part.type, part.value]),
    );
    if (parts["weekday"] === "Fri" && parts["hour"] === "18" && parts["minute"] === "00") {
      return {
        timestamp: Timestamp.fromMillis(candidate),
        week: `${parts["year"]}-${parts["month"]}-${parts["day"]}`,
      };
    }
  }
  throw new Error(`Could not calculate Friday delivery for ${timeZone}.`);
}
