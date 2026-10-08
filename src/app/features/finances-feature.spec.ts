import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { financesFeatureEnabled } from "./finances-feature";

// Include local native/development configurations when present, without making
// those ignored files a prerequisite for CI.
describe("finance release gate", () => {
  it("defaults to disabled", () => {
    expect(financesFeatureEnabled).toBe(false);
  });

  it("is explicitly disabled in every environment with feature settings", () => {
    const directory = resolve(process.cwd(), "src/environments");
    for (const file of readdirSync(directory).filter((name) => /^environment.*\.ts$/.test(name))) {
      const source = readFileSync(resolve(directory, file), "utf8");
      if (!source.includes("features: {")) continue;
      expect(source, file).toMatch(/finances:\s*false/);
      expect(source, file).not.toMatch(/finances:\s*true/);
    }
  });
});
