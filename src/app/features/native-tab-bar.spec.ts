import { describe, expect, it } from "vitest";
import {
  NATIVE_TAB_BAR_MORE_ID,
  buildNativeTabBarState,
  cssColorToHex,
  nativeTabBarOwnsNavigation,
  nativeTabSymbol,
  type NativeTabDestination,
} from "./native-tab-bar";

const destination = (
  id: string,
  extra: Partial<NativeTabDestination> = {},
): NativeTabDestination => ({ id, name: id.toUpperCase(), icon: id, active: false, ...extra });

const signedInApp = (active?: string): NativeTabDestination[] =>
  ["map", "train", "events", "shop", "about", "moderation"]
    .map((id) => destination(id, { active: id === active }))
    .concat(destination("account", { icon: "person", alwaysVisible: true, active: active === "account" }));

describe("native tab bar state", () => {
  it("shows every destination when they fit", () => {
    const state = buildNativeTabBarState(
      [destination("map", { active: true }), destination("events"), destination("account", { alwaysVisible: true })],
      { moreTitle: "More", hidden: false },
    );

    expect(state.items.map((item) => item.id)).toEqual(["map", "events", "account"]);
    expect(state.overflow).toEqual([]);
    expect(state.selectedId).toBe("map");
    expect(state.hidden).toBe(false);
  });

  it("moves lower-priority destinations behind More and keeps the profile tab last", () => {
    const state = buildNativeTabBarState(signedInApp("train"), { moreTitle: "Mehr", hidden: false });

    expect(state.items.map((item) => item.id)).toEqual(["map", "train", "events", NATIVE_TAB_BAR_MORE_ID, "account"]);
    expect(state.items[3]).toMatchObject({ title: "Mehr", symbol: "ellipsis.circle" });
    expect(state.overflow.map((item) => item.id)).toEqual(["shop", "about", "moderation"]);
    expect(state.selectedId).toBe("train");
  });

  it("selects More for an active overflow destination and the profile tab for profile routes", () => {
    expect(buildNativeTabBarState(signedInApp("about"), { moreTitle: "More", hidden: false }).selectedId)
      .toBe(NATIVE_TAB_BAR_MORE_ID);
    expect(buildNativeTabBarState(signedInApp("account"), { moreTitle: "More", hidden: false }).selectedId)
      .toBe("account");
    expect(buildNativeTabBarState(signedInApp(), { moreTitle: "More", hidden: false }).selectedId)
      .toBeNull();
  });

  it("carries live indicators as badges, also onto More", () => {
    const destinations = signedInApp();
    destinations[2] = { ...destinations[2], liveIndicator: true };
    destinations[4] = { ...destinations[4], liveIndicator: true };
    const state = buildNativeTabBarState(destinations, { moreTitle: "More", hidden: false });

    expect(state.items.find((item) => item.id === "events")?.badge).toBe(true);
    expect(state.items.find((item) => item.id === NATIVE_TAB_BAR_MORE_ID)?.badge).toBe(true);
    expect(state.items.find((item) => item.id === "map")?.badge).toBe(false);
  });

  it("maps Material navigation icons to SF Symbols", () => {
    expect(nativeTabSymbol("map")).toBe("map");
    expect(nativeTabSymbol("event")).toBe("calendar");
    expect(nativeTabSymbol("person")).toBe("person.crop.circle");
    expect(nativeTabSymbol("unknown_icon")).toBe("circle");
  });

  it("leaves the short Alain layout to the web menu", () => {
    expect(nativeTabBarOwnsNavigation(true, "bottom")).toBe(true);
    expect(nativeTabBarOwnsNavigation(true, "rail")).toBe(true);
    expect(nativeTabBarOwnsNavigation(true, "menu")).toBe(false);
    expect(nativeTabBarOwnsNavigation(false, "bottom")).toBe(false);
  });

  it("converts computed theme colors for native", () => {
    expect(cssColorToHex("rgb(139, 216, 139)")).toBe("#8bd88b");
    expect(cssColorToHex("rgba(0, 10, 255, 0.5)")).toBe("#000aff");
    expect(cssColorToHex("transparent")).toBeUndefined();
  });
});
