import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { UrlSegment } from "@angular/router";
import { RELEASES, Release, releaseTier, renderReleaseNotesMarkdown, replaceReadmeReleaseNotes, visibleHeroIcons } from "./release-notes";
import { RELEASE_HIGHLIGHTS } from "./release-highlights";
import { releaseExistsGuard } from "./release-exists.guard";

const root = resolve(__dirname, "../../..");

describe("release notes", () => {
  it("lists every release once, newest first, with a valid date", () => {
    const versions = RELEASES.map((release) => release.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (const release of RELEASES) {
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(Number.isNaN(Date.parse(release.date))).toBe(false);
      expect(release.notes.length).toBeGreaterThan(0);
    }
    const dates = RELEASES.map((release) => release.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("only uses icons that are in the Material Symbols subset", () => {
    const available = new Set(
      readFileSync(resolve(root, "src/assets/fonts/icons_list.txt"), "utf8").split(/\r?\n/u).filter(Boolean),
    );
    const used = RELEASES.flatMap((release) => [...release.hero.icons, release.hero.centerpiece].map((item) => item.icon));
    const highlightIcons = Object.values(RELEASE_HIGHLIGHTS).flatMap((items) => items.map((item) => item.icon));
    expect([...used, ...highlightIcons].filter((icon) => !available.has(icon))).toEqual([]);
    for (const release of RELEASES) expect(release.hero.icons.length).toBeLessThanOrEqual(6);
  });

  it("has highlights for exactly the releases that exist", () => {
    expect(Object.keys(RELEASE_HIGHLIGHTS).sort()).toEqual(RELEASES.map((release) => release.version).sort());
    for (const release of RELEASES) expect(RELEASE_HIGHLIGHTS[release.version].length).toBeGreaterThan(0);
  });

  it("draws each highlight's icon from what its banner shows, in the same live or gold colour", () => {
    const mismatches = RELEASES.flatMap((release) => {
      const banner = [...visibleHeroIcons(release), release.hero.centerpiece];
      return RELEASE_HIGHLIGHTS[release.version]
        .filter((highlight) => {
          const match = banner.find((item) => item.icon === highlight.icon);
          if (!match) return true;
          const special = (tone: string | undefined) => (tone === "live" || tone === "gold" ? tone : undefined);
          return special(match.tone) !== special(highlight.tone);
        })
        .map((highlight) => `${release.version}: ${highlight.icon}`);
    });
    expect(mismatches).toEqual([]);
  });

  it("sizes releases by tier: new minor versions are major, web-only patches the smallest", () => {
    const release = (version: string, extra: Partial<Release> = {}): Release => ({
      version,
      date: "2027-01-01",
      hero: { icons: [], centerpiece: { icon: "map" } },
      notes: ["x"],
      ...extra,
    });
    expect(releaseTier(release("1.3"))).toBe("major");
    expect(releaseTier(release("1.3.0"))).toBe("major");
    expect(releaseTier(release("1.3.1"))).toBe("update");
    expect(releaseTier(release("1.3.2", { platforms: ["web"] }))).toBe("web");
    expect(releaseTier(release("1.3.2", { platforms: ["ios", "android"] }))).toBe("update");
    expect(releaseTier(release("1.1.1", { tier: "major" }))).toBe("major");
    expect(Object.fromEntries(RELEASES.map((item) => [item.version, releaseTier(item)]))).toMatchObject({
      "1.2.2": "web",
      "1.2.1": "update",
      "1.2": "major",
      "1.1.1": "major",
    });
  });

  it("keeps the README in sync (run `npm run releases:readme`)", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    expect(replaceReadmeReleaseNotes(readme)).toBe(readme);
  });

  it("renders headings in the README style, with nested notes", () => {
    const markdown = renderReleaseNotesMarkdown([
      {
        version: "9.0.1",
        name: "Test",
        date: "2027-03-05",
        platforms: ["web"],
        hero: { icons: [], centerpiece: { icon: "map" } },
        notes: ["One", { text: "Fixes:", items: ["Two"] }],
      },
    ]);
    expect(markdown).toBe('### Version 9.0.1 - 5.3.2027 "Test" (web)\n\n- One\n- Fixes:\n  - Two');
  });

  it("refuses to rewrite a README without the markers", () => {
    expect(() => replaceReadmeReleaseNotes("# Readme")).toThrow(/markers/u);
  });

  it("only matches release pages for known versions", () => {
    const match = (version: string) =>
      releaseExistsGuard({}, [new UrlSegment("releases", {}), new UrlSegment(version, {})]);
    expect(match(RELEASES[0].version)).toBe(true);
    expect(match("0.0.1")).toBe(false);
  });
});
