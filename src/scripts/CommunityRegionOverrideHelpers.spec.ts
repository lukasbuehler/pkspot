// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CommunityRegionOverrideSchema } from "../db/schemas/CommunityRegionOverrideSchema";
import {
  communityGeographyMatchesRegionOverride,
  isValidRegionOverrideRadiusKm,
  pickRegionOverrideForLocality,
} from "./CommunityRegionOverrideHelpers";

const sydney: CommunityRegionOverrideSchema = {
  target_community_key: "locality:au:nsw:sydney",
  country_code: "AU",
  region_code: "NSW",
  region_name: "New South Wales",
  region_slug: "nsw",
  center: { lat: -33.8688, lng: 151.2093 },
  radius_km: 60,
};

const nswGeography = {
  countryCode: "AU",
  regionCode: "NSW",
  regionName: "New South Wales",
  regionSlug: "nsw",
};

describe("CommunityRegionOverrideHelpers", () => {
  it("matches a region by code, name, or slug", () => {
    expect(communityGeographyMatchesRegionOverride(nswGeography, sydney)).toBe(true);
    expect(
      communityGeographyMatchesRegionOverride(
        { countryCode: "AU", regionName: "New South Wales" },
        sydney,
      ),
    ).toBe(true);
    expect(
      communityGeographyMatchesRegionOverride(
        { countryCode: "AU", regionCode: "VIC", regionName: "Victoria" },
        sydney,
      ),
    ).toBe(false);
  });

  it("treats a name-only region slug as the same region as its code", () => {
    const melbourne: CommunityRegionOverrideSchema = {
      ...sydney,
      target_community_key: "locality:au:victoria:melbourne",
      region_code: undefined,
      region_name: "Victoria",
      region_slug: "victoria",
    };
    expect(
      communityGeographyMatchesRegionOverride(
        {
          countryCode: "AU",
          regionCode: "VIC",
          regionName: "Victoria",
          regionSlug: "vic",
        },
        melbourne,
      ),
    ).toBe(true);
  });

  it("never matches across a country border", () => {
    expect(
      communityGeographyMatchesRegionOverride(
        { ...nswGeography, countryCode: "NZ" },
        sydney,
      ),
    ).toBe(false);
  });

  it("absorbs a locality in the region only within the radius", () => {
    const cronulla = {
      communityKey: "locality:au:nsw:cronulla",
      geography: nswGeography,
      center: { lat: -34.0587, lng: 151.1526 },
    };
    const newcastle = {
      communityKey: "locality:au:nsw:newcastle",
      geography: nswGeography,
      center: { lat: -32.9283, lng: 151.7817 },
    };
    expect(pickRegionOverrideForLocality(cronulla, [sydney])).toBe(sydney);
    expect(pickRegionOverrideForLocality(newcastle, [sydney])).toBeNull();
    expect(
      pickRegionOverrideForLocality({ ...cronulla, center: null }, [sydney]),
    ).toBeNull();
  });

  it("never absorbs another override's target and prefers the nearest centre", () => {
    const newcastleOverride: CommunityRegionOverrideSchema = {
      ...sydney,
      target_community_key: "locality:au:nsw:newcastle",
      center: { lat: -32.9283, lng: 151.7817 },
      radius_km: 200,
    };
    const overrides = [sydney, newcastleOverride];
    expect(
      pickRegionOverrideForLocality(
        {
          communityKey: "locality:au:nsw:newcastle",
          geography: nswGeography,
          center: newcastleOverride.center,
        },
        overrides,
      ),
    ).toBeNull();
    expect(
      pickRegionOverrideForLocality(
        {
          communityKey: "locality:au:nsw:gosford",
          geography: nswGeography,
          center: { lat: -33.4267, lng: 151.3417 },
        },
        overrides,
      ),
    ).toBe(sydney);
    expect(
      pickRegionOverrideForLocality(
        {
          communityKey: "locality:au:nsw:maitland",
          geography: nswGeography,
          center: { lat: -32.7316, lng: 151.5525 },
        },
        overrides,
      ),
    ).toBe(newcastleOverride);
  });

  it("validates the radius range", () => {
    expect(isValidRegionOverrideRadiusKm(60)).toBe(true);
    expect(isValidRegionOverrideRadiusKm(0)).toBe(false);
    expect(isValidRegionOverrideRadiusKm(500)).toBe(false);
    expect(isValidRegionOverrideRadiusKm("60")).toBe(false);
  });
});
