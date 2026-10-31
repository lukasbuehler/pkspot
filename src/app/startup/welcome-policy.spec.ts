import { describe, expect, it, vi } from "vitest";
import { isBot } from "../../scripts/BrowserAgents";
import { recordWelcomeAcceptance, WHATS_NEW_RELEASE, WHATS_NEW_STORAGE_KEY } from "../services/whats-new";
import { shouldShowEarlyWelcome, withoutLocalePrefix } from "./welcome-policy";

const visitor = {
  pathname: "/en/map", acceptedVersion: null,
  native: false, bot: false, embedded: false, notFound: false,
};

describe("early welcome policy", () => {
  it.each(["/en/map", "/de/map/spots/imax", "/fr/events/example", "/account"])(
    "uses the early view for a fresh web visitor at %s", pathname => {
      expect(shouldShowEarlyWelcome({ ...visitor, pathname })).toBe(true);
    },
  );

  it.each([
    { native: true }, { bot: true }, { embedded: true }, { notFound: true },
    { acceptedVersion: "7" }, { acceptedVersion: "6" },
    { pathname: "/de/about" }, { pathname: "/en/privacy-policy" },
    { pathname: "/fr/terms-of-service" }, { pathname: "/en/embedded/map" },
    { pathname: "/de/__visual/markers" }, { pathname: "/en/shop/item/test" },
  ])("leaves existing app ownership intact for %j", overrides => {
    expect(shouldShowEarlyWelcome({ ...visitor, ...overrides })).toBe(false);
  });

  it("does not treat unrelated prefixes as legal routes or locales", () => {
    expect(shouldShowEarlyWelcome({ ...visitor, pathname: "/en/about-us-community" })).toBe(true);
    expect(withoutLocalePrefix("/unknown/map")).toBe("/unknown/map");
    expect(withoutLocalePrefix("/")).toBe("/");
    expect(withoutLocalePrefix("")).toBe("/");
  });

  it.each(["Googlebot/2.1", "Bingbot", "Twitterbot", "ExampleCrawler"])("recognizes %s", agent => {
    expect(isBot(agent)).toBe(true);
    expect(shouldShowEarlyWelcome({ ...visitor, bot: isBot(agent) })).toBe(false);
  });

  it("records the same agreement state in either entry point", () => {
    const setItem = vi.fn();
    recordWelcomeAcceptance({ setItem }, "7");
    expect(setItem.mock.calls).toEqual([["acceptedVersion", "7"], [WHATS_NEW_STORAGE_KEY, WHATS_NEW_RELEASE]]);
  });

});
