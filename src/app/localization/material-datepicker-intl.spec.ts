import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(process.cwd(), "src/app");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".spec.ts") ? [path] : [];
  });
}

describe("LocalizedDatepickerIntl", () => {
  // MatDatepickerModule re-provides an English MatDatepickerIntl to every
  // component that imports it, so its labels ("Open calendar") would ignore
  // the translated provider from app.config.
  it("is not hidden by components importing MatDatepickerModule", () => {
    const offenders = sourceFiles(appRoot)
      .filter((path) =>
        /\bMatDatepickerModule\b/.test(
          readFileSync(path, "utf8").replace(/\/\/.*$/gm, "")
        )
      )
      .map((path) => relative(appRoot, path));
    expect(offenders).toEqual([]);
  });
});
