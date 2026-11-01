import { PLATFORM_ID, TransferState, makeStateKey } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { GeoPoint, Timestamp } from "firebase/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { Spot } from "../../db/models/Spot";
import type { SpotId, SpotSchema } from "../../db/schemas/SpotSchema";
import { InitialSpotSnapshotService } from "./initial-spot-snapshot.service";

const id = "spot-test" as SpotId;
const schema: SpotSchema = {
  name: { en: { text: "Test Spot", provider: "user" } },
  description: { en: { text: "Public description", provider: "user" } },
  slug: "test",
  location: new GeoPoint(51.5, -0.1),
  location_raw: { lat: 51.5, lng: -0.1 },
  media: [],
};
const stateKey = makeStateKey<unknown>("initial-spot:v1:en:test");

function setup(platform: "server" | "browser", state: TransferState, router = { navigated: false }) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: PLATFORM_ID, useValue: platform },
    { provide: TransferState, useValue: state },
    { provide: Router, useValue: router },
  ] });
  return TestBed.inject(InitialSpotSnapshotService);
}

describe("InitialSpotSnapshotService", () => {
  beforeEach(() => TestBed.resetTestingModule());

  it("round-trips the SSR Spot through JSON, retaining coordinates, text and slug", () => {
    const serverState = new TransferState();
    const data = { ...schema, created_at: Timestamp.fromMillis(123456789) };
    setup("server", serverState).capture("test", "en", new Spot(id, data, "en"), data);
    const serialized = JSON.parse(serverState.toJson()) as Record<string, unknown>;
    const browserState = new TransferState();
    browserState.set(stateKey, serialized[stateKey]);
    const reader = setup("browser", browserState);
    const restored = reader.read("test", "en");
    expect(restored?.id).toBe(id);
    expect(restored?.name()).toBe("Test Spot");
    expect(restored?.description()).toBe("Public description");
    expect(restored?.slug).toBe("test");
    expect(restored?.location()).toEqual({ lat: 51.5, lng: -0.1 });
    expect(browserState.hasKey(stateKey)).toBe(false);
    expect(reader.read("test", "en")).toBe(restored);
  });

  it("does not reuse initial data for later navigation or another locale", () => {
    const state = new TransferState();
    setup("server", state).capture("test", "en", new Spot(id, schema, "en"), schema);
    const router = { navigated: false };
    const reader = setup("browser", state, router);
    expect(reader.read("test", "de")).toBeNull();
    expect(reader.read("test", "en")).not.toBeNull();
    router.navigated = true;
    expect(reader.read("test", "en")).toBeNull();
  });

  it("never captures browser state or unknown SDK objects", () => {
    const state = new TransferState();
    setup("browser", state).capture("test", "en", new Spot(id, schema, "en"), schema);
    expect(state.hasKey(stateKey)).toBe(false);
    class UnknownSdkObject { secret = "must-not-serialize"; }
    const unsupported = { ...schema, unexpected: new UnknownSdkObject() };
    setup("server", state).capture("test", "en", new Spot(id, schema, "en"), unsupported);
    expect(state.toJson()).not.toContain("must-not-serialize");
    expect(state.hasKey(stateKey)).toBe(false);
  });

  it("falls back cleanly when transferred data is malformed", () => {
    const state = new TransferState();
    state.set(stateKey, { id, schema: null });
    expect(setup("browser", state).read("test", "en")).toBeNull();
  });
});
