import { describe, expect, it } from "vitest";
import {
  appHtmlEntry,
  generatedOutputGlobs,
  testFileGlobs,
} from "../vite-scan-boundaries.mjs";

describe("Vite scan boundaries", () => {
  it("pins dependency discovery to the app entry instead of generated output", () => {
    expect(appHtmlEntry).toBe("src/index.html");
    expect(testFileGlobs).toEqual([
      "src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
    ]);
  });

  it("keeps generated app output outside Vitest discovery", () => {
    expect(generatedOutputGlobs).toEqual([
      "android/**",
      "coverage/**",
      "dist/**",
      "ios/**",
      "playwright-report/**",
    ]);
  });
});
