import { describe, expect, it } from "vitest";
import {
  communityEventSendAfter,
  nextFridayAtSix,
  spotQualifiesForCommunityDigest,
} from "../functions/src/communityNotificationPolicy";
import type { SpotSchema } from "./db/schemas/SpotSchema";

const qualifyingSpot = {
  name: { en: "Central" },
  address: null,
  rating: 3,
  num_reviews: 1,
  media: [{ type: "image", src: "https://example.com/spot.jpg", isInStorage: true }],
} satisfies SpotSchema;

describe("community notification policy", () => {
  it("holds distant events until the 30-day relevance boundary", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const start = Date.parse("2026-07-01T12:00:00Z");

    expect(communityEventSendAfter(start, now).toDate().toISOString()).toBe(
      "2026-06-01T12:00:00.000Z",
    );
    expect(
      communityEventSendAfter(now + 7 * 86_400_000, now).toMillis(),
    ).toBe(now);
  });

  it("requires an image, a 3.0 rating, and one review", () => {
    expect(spotQualifiesForCommunityDigest(qualifyingSpot)).toBe(true);
    expect(spotQualifiesForCommunityDigest({ ...qualifyingSpot, rating: 2.9 })).toBe(false);
    expect(spotQualifiesForCommunityDigest({ ...qualifyingSpot, num_reviews: 0 })).toBe(false);
    expect(spotQualifiesForCommunityDigest({ ...qualifyingSpot, media: [] })).toBe(false);
  });

  it("excludes reported and unavailable Spots", () => {
    expect(spotQualifiesForCommunityDigest({ ...qualifyingSpot, is_reported: true })).toBe(false);
    expect(
      spotQualifiesForCommunityDigest({
        ...qualifyingSpot,
        public_notice: { type: "destroyed", message: "Gone" },
      }),
    ).toBe(false);
  });

  it("schedules Friday at 18:00 in the user's time zone across DST", () => {
    const winter = nextFridayAtSix(Date.parse("2026-01-05T12:00:00Z"), "Europe/Zurich");
    const summer = nextFridayAtSix(Date.parse("2026-07-27T12:00:00Z"), "Europe/Zurich");

    expect(winter.timestamp.toDate().toISOString()).toBe("2026-01-09T17:00:00.000Z");
    expect(summer.timestamp.toDate().toISOString()).toBe("2026-07-31T16:00:00.000Z");
    expect(summer.week).toBe("2026-07-31");
  });
});
