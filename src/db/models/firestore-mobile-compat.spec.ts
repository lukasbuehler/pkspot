import { describe, expect, it } from "vitest";
import { SpotEdit } from "./SpotEdit";
import { SpotChallenge } from "./SpotChallenge";
import { convertLocalSpotToSpot, LocalSpot, Spot } from "./Spot";
import { SpotId } from "../schemas/SpotSchema";

describe("Firestore mobile compatibility models", () => {
  it("should format SpotEdit timestamps when only plain mobile timestamp objects are available", () => {
    const edit = new SpotEdit("edit-1", {
      data: {},
      user: {
        uid: "user-1",
        display_name: "Tester",
      },
      type: "UPDATE",
      timestamp: {
        seconds: 1_700_000_000,
        nanoseconds: 123_000_000,
      } as any,
      likes: 0,
      approved: false,
    } as any);

    expect(edit.getTimestampString("en-US")).toContain("11/14/23");
  });

  it("should hydrate SpotChallenge from plain mobile timestamps and locations", () => {
    const spot = new Spot(
      "spot-1" as SpotId,
      {
        name: { en: "Base Spot" },
        location: { latitude: 48.1234, longitude: 11.5678 } as any,
        tile_coordinates: { z16: { x: 1, y: 1 } } as any,
      } as any,
      "en"
    );

    const challenge = new SpotChallenge(
      "challenge-1",
      {
        spot: { id: "spot-1", name: "Base Spot" },
        name: { en: { text: "Cat Pass" } },
        description: {},
        user: {
          uid: "user-1",
          display_name: "Tester",
        },
        created_at: {
          seconds: 1_700_000_000,
          nanoseconds: 123_000_000,
        } as any,
        release_date: {
          seconds: 1_700_000_100,
          nanoseconds: 0,
        } as any,
        location: { latitude: 47.3769, longitude: 8.5417 } as any,
      } as any,
      spot,
      "en"
    );

    expect(challenge.createdAt.toISOString()).toBe("2023-11-14T22:13:20.123Z");
    expect(challenge.releaseDate?.toISOString()).toBe(
      "2023-11-14T22:15:00.000Z"
    );
    expect(challenge.location()).toEqual({ lat: 47.3769, lng: 8.5417 });
  });

  it("should convert a just-created LocalSpot into a real Spot instance", () => {
    const localSpot = new LocalSpot(
      {
        name: { en: "New Spot" },
        location_raw: { lat: 47.3769, lng: 8.5417 },
        address: null,
      },
      "en"
    );

    const spot = convertLocalSpotToSpot(localSpot, "spot-new" as SpotId);

    expect(spot).toBeInstanceOf(Spot);
    expect(spot.id).toBe("spot-new");
    expect(spot.name()).toBe("New Spot");
  });
});
