import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface AngularWorkspace {
  projects: {
    pkspot: {
      architect: {
        build: {
          configurations: {
            cloudflare: {
              externalDependencies?: string[];
              ssr: { platform: string };
            };
          };
        };
      };
    };
  };
}

const buildScript = readFileSync(
  resolve(process.cwd(), "scripts/cloudflare-workers.mjs"),
  "utf8",
);
const angularWorkspace = JSON.parse(
  readFileSync(resolve(process.cwd(), "angular.json"), "utf8"),
) as AngularWorkspace;

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

  it("bundles dependencies used by browser chunks", () => {
    const cloudflareConfiguration =
      angularWorkspace.projects.pkspot.architect.build.configurations.cloudflare;

    expect(cloudflareConfiguration.externalDependencies).toBeUndefined();
    expect(cloudflareConfiguration.ssr.platform).toBe("neutral");
  });
});
