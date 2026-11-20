// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  makeOrganizationReference,
  organizationReferenceMatches,
} from "../functions/src/organizationVerificationHelpers";

describe("organization references embedded in events and Spots", () => {
  const reference = makeOrganizationReference("wpf", {
    name: "World's Parkour Family",
    slug: "wpf",
    logo_url: "https://example.test/wpf.png",
    logo_background_color: "transparent",
    description: "Not part of the snapshot",
  });

  it("copies only the public identity fields, including the logo", () => {
    expect(reference).toEqual({
      id: "wpf",
      name: "World's Parkour Family",
      slug: "wpf",
      logo_url: "https://example.test/wpf.png",
      logo_background_color: "transparent",
    });
  });

  it("matches an up-to-date snapshot", () => {
    expect(organizationReferenceMatches({ ...reference }, reference)).toBe(true);
  });

  it.each([
    ["a snapshot without the logo", { id: "wpf", name: "World's Parkour Family", slug: "wpf" }],
    ["an older logo", { ...reference, logo_url: "/en/assets/logos/old.gif" }],
    ["an older background", { ...reference, logo_background_color: "white" }],
    ["a renamed organization", { ...reference, name: "WPF" }],
    ["no snapshot", undefined],
  ])("treats %s as stale", (_label, current) => {
    expect(organizationReferenceMatches(current, reference)).toBe(false);
  });

  it("treats a snapshot that still has a removed logo as stale", () => {
    const withoutLogo = makeOrganizationReference("crew", {
      name: "Crew",
      slug: "crew",
    });
    expect(
      organizationReferenceMatches(
        { ...withoutLogo, logo_url: "https://example.test/old.png" },
        withoutLogo,
      ),
    ).toBe(false);
  });
});
