// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eventHost, type EventHostSource } from "./event-host-line.component";

const listing = (fields: Partial<EventHostSource>): EventHostSource => ({
  listingTier: "formal",
  hasOrganization: false,
  ...fields,
});

describe("eventHost", () => {
  it("treats an approved organisation as the official host, with its logo", () => {
    expect(
      eventHost(
        listing({
          hasOrganization: true,
          organizerKind: "organization",
          organizerName: "SPKA",
          organizerLogoSrc: "logo.png",
        }),
      ),
    ).toEqual({ kind: "organization", name: "SPKA", logoUrl: "logo.png", logoBackground: null });
  });

  it("still marks an organisation as verified before its name is indexed", () => {
    expect(eventHost(listing({ hasOrganization: true }))).toEqual({
      kind: "organization",
      name: null,
      logoUrl: null,
      logoBackground: null,
    });
  });

  it("marks community events and keeps the member's name when known", () => {
    expect(
      eventHost(listing({ listingTier: "community", organizerKind: "user", organizerName: "Alex Runner" })),
    ).toEqual({ kind: "community", name: "Alex Runner" });
    expect(eventHost(listing({ listingTier: "community" }))).toEqual({ kind: "community", name: null });
  });

  it("names other organisers without the verified mark, and shows nothing when unknown", () => {
    expect(eventHost(listing({ organizerKind: "name", organizerName: " Jam Crew " }))).toEqual({
      kind: "named",
      name: "Jam Crew",
    });
    expect(eventHost(listing({}))).toBeNull();
  });
});
