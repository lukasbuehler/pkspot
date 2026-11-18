import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { UrlSegment } from "@angular/router";
import { RELEASES, renderReleaseNotesMarkdown, replaceReadmeReleaseNotes } from "./release-notes";
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

  it("has highlights only for releases that exist", () => {
    const versions = new Set(RELEASES.map((release) => release.version));
    expect(Object.keys(RELEASE_HIGHLIGHTS).filter((version) => !versions.has(version))).toEqual([]);
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
