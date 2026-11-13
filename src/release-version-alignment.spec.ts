// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string): string =>
  readFileSync(resolve(path), "utf8");

/** Compares dotted numeric versions such as `1.2.10` and `1.2.2`. */
const compareVersions = (a: string, b: string): number => {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

describe("release version alignment", () => {
  // Every production release bumps package.json, including web-only ones, so
  // the web version can be ahead of the apps. The native projects and Fastlane
  // must agree with each other and take the current number when they next ship.
  it("keeps native projects and Fastlane aligned and not ahead of package.json", () => {
    const packageVersion = JSON.parse(readSource("package.json")).version as string;
    const fastlane = readSource("fastlane/Fastfile");
    const nativeVersion = fastlane.match(/PKSPOT_VERSION_NAME = "([\d.]+)"/)?.[1];
    const expectedBuild = 20;
    const android = readSource("android/app/build.gradle");

    expect(nativeVersion).toBeDefined();
    expect(compareVersions(nativeVersion!, packageVersion)).toBeLessThanOrEqual(0);
    expect(android).toContain(`versionName "${nativeVersion}"`);
    expect(android).toContain(`versionCode ${expectedBuild}`);
    expect(fastlane).toContain(`PKSPOT_VERSION_CODE = ${expectedBuild}`);

    for (const project of ["App.xcodeproj", "PK Spot.xcodeproj"]) {
      const xcode = readSource(`ios/App/${project}/project.pbxproj`);
      expect(xcode).toContain(`MARKETING_VERSION = ${nativeVersion};`);
      expect(xcode).toContain(`CURRENT_PROJECT_VERSION = ${expectedBuild};`);
    }
  });

  it("has localized Android changelogs for the current build", () => {
    for (const locale of ["de-DE", "en-US", "es-ES", "fr-FR", "it-IT", "nl-NL"]) {
      expect(
        existsSync(
          resolve(`fastlane/metadata/android/${locale}/changelogs/20.txt`),
        ),
      ).toBe(true);
    }
  });
});
