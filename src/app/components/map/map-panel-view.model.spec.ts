import { describe, expect, it } from "vitest";
import { Spot } from "../../../db/models/Spot";
import { SpotChallenge } from "../../../db/models/SpotChallenge";
import { PoiData } from "../../../db/models/PoiData";
import { getMapPanelView, MapPanelViewState } from "./map-panel-view.model";

const spot = {
  name: () => "Josefhalle",
} as Spot;

const baseState = (): MapPanelViewState => ({
  poi: null,
  spot: null,
  pendingSpot: null,
  selectedChallenge: null,
  showAllChallenges: false,
  showSpotEditHistory: false,
  event: null,
  pendingEvent: null,
  community: null,
  pendingCommunity: null,
});

describe("getMapPanelView", () => {
  it("falls back to the object list when no routed or preview panel is active", () => {
    expect(getMapPanelView(baseState()).kind).toBe("objects");
  });

  it("prioritizes point-of-interest panels above spot previews", () => {
    const state = baseState();
    state.poi = { name: "Water fountain" } as PoiData;
    state.pendingSpot = { id: "spot-1", name: "Josefhalle" };

    expect(getMapPanelView(state).kind).toBe("poi");
  });

  it("routes plain selected spots to the spot details panel", () => {
    const state = baseState();
    state.spot = spot;

    expect(getMapPanelView(state)).toMatchObject({
      kind: "spot-details",
      spot,
    });
  });

  it("routes spot challenge and edit subviews before event or community panels", () => {
    const challengeState = baseState();
    challengeState.spot = spot;
    challengeState.selectedChallenge = {} as SpotChallenge;
    challengeState.event = {} as never;

    expect(getMapPanelView(challengeState)).toMatchObject({
      kind: "spot-challenges",
      spotName: "Josefhalle",
    });

    const editState = baseState();
    editState.spot = spot;
    editState.showSpotEditHistory = true;
    editState.pendingEvent = { idOrSlug: "event-1" };

    expect(getMapPanelView(editState)).toMatchObject({
      kind: "spot-edits",
      spotName: "Josefhalle",
    });
  });
});
