import { describe, expect, it } from "vitest";
import {
  attachGoogleMapsAppCheck,
  getGooglePlaceFields,
} from "./maps-api.service";

describe("MapsApiService place detail fields", () => {
  it("keeps map positioning requests within the Essentials tier", () => {
    expect(getGooglePlaceFields("location")).toEqual([
      "location",
      "types",
      "viewport",
    ]);
    expect(getGooglePlaceFields("location")).not.toEqual(
      expect.arrayContaining([
        "rating",
        "regularOpeningHours",
        "websiteURI",
      ]),
    );
  });

  it("reserves Enterprise fields for rich place cards", () => {
    expect(getGooglePlaceFields("rich")).toEqual(
      expect.arrayContaining([
        "rating",
        "regularOpeningHours",
        "websiteURI",
      ]),
    );
  });

  it("attaches App Check tokens to Google Maps requests", async () => {
    const settings = {
      fetchAppCheckToken: async () => ({ token: "" }),
    };

    attachGoogleMapsAppCheck(settings, async () => "app-check-token");

    await expect(settings.fetchAppCheckToken()).resolves.toEqual({
      token: "app-check-token",
    });
  });
});
