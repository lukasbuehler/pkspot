import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string): string =>
  readFileSync(resolve(path), "utf8");

describe("release version alignment", () => {
  it("keeps native projects and Fastlane aligned with package.json", () => {
    const packageVersion = JSON.parse(readSource("package.json")).version as string;
    const expectedBuild = 18;
    const android = readSource("android/app/build.gradle");
    const fastlane = readSource("fastlane/Fastfile");

    expect(android).toContain(`versionName "${packageVersion}"`);
    expect(android).toContain(`versionCode ${expectedBuild}`);
    expect(fastlane).toContain(`PKSPOT_VERSION_NAME = "${packageVersion}"`);
    expect(fastlane).toContain(`PKSPOT_VERSION_CODE = ${expectedBuild}`);

    for (const project of ["App.xcodeproj", "PK Spot.xcodeproj"]) {
      const xcode = readSource(`ios/App/${project}/project.pbxproj`);
      expect(xcode).toContain(`MARKETING_VERSION = ${packageVersion};`);
      expect(xcode).toContain(`CURRENT_PROJECT_VERSION = ${expectedBuild};`);
    }
  });

  it("has localized Android changelogs for the current build", () => {
    for (const locale of ["de-DE", "en-US", "es-ES", "fr-FR", "it-IT", "nl-NL"]) {
      expect(
        existsSync(
          resolve(`fastlane/metadata/android/${locale}/changelogs/18.txt`),
        ),
      ).toBe(true);
    }
  });
});
