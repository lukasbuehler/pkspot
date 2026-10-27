import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("owns navigation wherever the native bar exists, except embedded views", () => {
    expect(nativeTabBarOwnsNavigation(true, false)).toBe(true);
    expect(nativeTabBarOwnsNavigation(true, true)).toBe(false);
    expect(nativeTabBarOwnsNavigation(false, false)).toBe(false);
  });

  it("converts computed theme colors for native", () => {
    expect(cssColorToHex("rgb(139, 216, 139)")).toBe("#8bd88b");
    expect(cssColorToHex("rgba(0, 10, 255, 0.5)")).toBe("#000aff");
    expect(cssColorToHex("transparent")).toBeUndefined();
  });
});

describe("native tab bar layout contract", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("skips the Alain menu clearance on pages when the native bar navigates", () => {
    const alainRule = /@media \(max-height: 499[^{]*\{\s*([^{]+)\{/gu;
    const scoped: string[] = [];
    for (const file of readdirSync(join(process.cwd(), "src/app/components"), { recursive: true })) {
      const path = `src/app/components/${String(file)}`;
      // Embedded views never get the native bar.
      if (!path.endsWith(".scss") || path.includes("embed-page")) continue;
      for (const match of read(path).matchAll(alainRule)) {
        expect(match[1], path).toContain(":host-context(app-root:not(.has-native-tab-bar))");
        scoped.push(path);
      }
    }
    expect(scoped.length).toBeGreaterThan(5);
  });

  it("clears the native bar through the published bottom safe area", () => {
    expect(read("src/styles.scss")).toMatch(
      /&\.has-native-tab-bar\s*\{[^}]*--navigation-bottom-clearance:\s*var\(--safe-area-inset-bottom,\s*0px\)/su,
    );
    const app = read("src/app/app.component.ts");
    expect(app).toContain('"[class.has-native-tab-bar]": "usesNativeTabBar()"');
    expect(read("src/app/app.component.html")).toContain("@if(showsAlainMenu())");
  });
});
