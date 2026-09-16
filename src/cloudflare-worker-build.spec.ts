import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const buildScript = readFileSync(
  resolve(process.cwd(), "scripts/cloudflare-workers.mjs"),
  "utf8",
);

describe("Cloudflare Worker build", () => {
  it("packages Angular's localized SSR output as one Worker", () => {
    expect(buildScript).toContain('"--localize"');
    expect(buildScript).not.toMatch(/--localize=/u);
    expect(buildScript).toContain('name: "pkspot-web"');
    expect(buildScript).toContain(
      'import handler from "./server/server.mjs";',
    );
    expect(buildScript).toContain('main: "worker.mjs"');
    expect(buildScript).toContain('directory: "browser"');
    expect(buildScript).not.toContain("cpu_ms");
  });
});
