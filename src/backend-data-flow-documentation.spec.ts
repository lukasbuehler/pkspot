import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const deployedFunctionExports = (): string[] => {
  const sourceText = read("functions/src/index.ts");
  return [...sourceText.matchAll(/export\s*\{([\s\S]*?)\}\s*from\s*["']/gu)]
    .flatMap((match) =>
      match[1]
        .replaceAll(/\/\/.*$/gmu, "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    );
};

describe("backend data-flow documentation", () => {
  it("names every deployed Cloud Function export", () => {
    const documentation = read("DATA_FLOW_AND_FUNCTIONS.md");
    const missing = deployedFunctionExports().filter(
      (functionName) => !documentation.includes(`\`${functionName}\``),
    );

    expect(missing).toEqual([]);
  });

  it("keeps the critical RSVP projection chain explicit", () => {
    const documentation = read("DATA_FLOW_AND_FUNCTIONS.md");

    expect(documentation).toContain("events/{eventId}/rsvps/{uid}");
    expect(documentation).toContain("events.rsvp_counts");
    expect(documentation).toContain("event_discovery.rsvp_counts");
    expect(documentation).toContain("spots.upcoming_events[].rsvp_counts");
  });
});
