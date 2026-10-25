import { describe, expect, it } from "vitest";
import type { CommunityPageSchema } from "../db/schemas/CommunityPageSchema";
import { communityPlaceFingerprint } from "./CommunityPlaceNames";
import type { EntityPlaceNames } from "./EntityPlaceNames";
import {
  communitySearchNames,
  localizedLocalityLabel,
  localizedPlaceLabel,
  localizedSearchNames,
  placeLabelNames,
  samePlaceFields,
} from "./LocalizedPlaceLabels";

const liege: EntityPlaceNames = {
  key: "BE:liege:51:6",
  source: "geonames",
  geonamesId: 2792413,
  center: [50.63, 5.57],
  names: { de: "Lüttich", fr: "Liège", nl: "Luik", en: "Liège", "zh-Hans": "列日", bad: "x", it: " " },
  region: { geonamesId: 1, names: { de: "Wallonien", fr: "Wallonie" } } as EntityPlaceNames["region"],
};

describe("localized place labels", () => {
  it("keeps only valid locale names and the source key", () => {
    expect(placeLabelNames(liege)).toEqual({
      key: "BE:liege:51:6",
      locality: { de: "Lüttich", fr: "Liège", nl: "Luik", en: "Liège", "zh-Hans": "列日" },
      region: { de: "Wallonien", fr: "Wallonie" },
    });
    expect(placeLabelNames({ ...liege, names: {} })).toBeUndefined();
  });

  it("picks the locale, then the language, then the original", () => {
    const names = placeLabelNames(liege)!;
    expect(localizedPlaceLabel("Liège", names.locality, "de-CH")).toBe("Lüttich");
    expect(localizedPlaceLabel("Liège", names.locality, "it")).toBe("Liège");
    expect(localizedLocalityLabel("Liège, Belgium", names, "nl")).toBe("Luik");
    expect(localizedLocalityLabel("Liège, Belgium", undefined, "nl")).toBe("Liège, Belgium");
  });

  it("collects every spelling once, case-insensitively, with countries in the app languages", () => {
    const names = localizedSearchNames({
      locality: "Liège", region: "Wallonia", countryCode: "be", names: placeLabelNames(liege),
    });
    expect(names.slice(0, 4)).toEqual(["Liège", "Lüttich", "Luik", "列日"]);
    expect(names).toContain("Wallonien");
    expect(names).toContain("Belgien");
    expect(names).toContain("Belgique");
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(names.length);
  });

  it("lets countries match their names but keeps towns out of country searches", () => {
    const geography = { countryCode: "BE", regionName: "Wallonia", localityName: "Liège" };
    const town = {
      communityKey: "locality:be:liege", scope: "locality", displayName: "Liège", geography,
      place_name_overrides: { de: "Lüttich (Stadt)" },
    } as unknown as CommunityPageSchema;
    town.place_localization = {
      source: "geonames", geonamesId: 2792413, names: { de: "Lüttich" }, fingerprint: communityPlaceFingerprint(town), updatedAtMs: 1,
    };
    expect(communitySearchNames(town)).toEqual(["Liège", "Lüttich (Stadt)", "Lüttich", "Wallonia"]);
    const country = { communityKey: "country:be", scope: "country", displayName: "Belgium", geography } as unknown as CommunityPageSchema;
    expect(communitySearchNames(country)).toEqual(expect.arrayContaining(["Belgium", "Belgien", "België"]));
    // A page created or merged before its geography exists still gets its name.
    expect(communitySearchNames({ communityKey: "locality:x", scope: "locality", displayName: "Dortmund" } as unknown as CommunityPageSchema))
      .toEqual(["Dortmund"]);
    // A stale localization from an earlier geography is ignored.
    expect(communitySearchNames({ ...town, communityKey: "locality:be:other" })).not.toContain("Lüttich");
  });

  it("compares stored fields regardless of key order", () => {
    expect(samePlaceFields({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(samePlaceFields(undefined, null)).toBe(true);
    expect(samePlaceFields(["a", "b"], ["b", "a"])).toBe(false);
  });
});
