// @vitest-environment node
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
              fileReplacements: Array<{ replace: string; with: string }>;
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
const profileScript = readFileSync(resolve(process.cwd(), "scripts/cloudflare-build-profiles.mjs"), "utf8");
const hostPolicy = readFileSync(resolve(process.cwd(), "src/cloudflare-hosts.ts"), "utf8");
const stagingEnvironment = readFileSync(
  resolve(process.cwd(), "src/environments/environment.staging.ts"),
  "utf8",
);
const cloudflareServer = readFileSync(
  resolve(process.cwd(), "server.cloudflare.ts"),
  "utf8",
);
const indexHtml = readFileSync(
  resolve(process.cwd(), "src/index.html"),
  "utf8",
);
const angularWorkspace = JSON.parse(
  readFileSync(resolve(process.cwd(), "angular.json"), "utf8"),
) as AngularWorkspace;

describe("Cloudflare Worker build", () => {
  it("packages Angular's localized SSR output as one Worker", () => {
    expect(buildScript).toContain('"--localize"');
    expect(buildScript).not.toMatch(/--localize=/u);
    expect(profileScript).toContain('workerName: "pkspot-web"');
    expect(buildScript).toContain(
      'import { handleWorkerRequest } from "./server.mjs";',
    );
    expect(profileScript).toContain('main: "server/worker.mjs"');
    expect(profileScript).toContain("no_bundle: true");
    expect(profileScript).toContain('directory: "browser"');
    expect(buildScript).toContain("rewriteFirebaseMessagingServiceWorkers");
    expect(buildScript).toContain('"firebase-messaging-sw.js"');
    expect(buildScript).not.toContain("cpu_ms");
  });

  it("accepts the stable test host and its branch preview hosts", () => {
    expect(hostPolicy).toContain('"test.pkspot.app"');
    expect(hostPolicy).toContain('"*.test.pkspot.app"');
    expect(cloudflareServer).not.toContain("edge-test.pkspot.app");
    expect(cloudflareServer).toContain("cloudflareSsrAllowedHosts(environment.name)");
  });

  it("bundles dependencies used by browser chunks", () => {
    const cloudflareConfiguration =
      angularWorkspace.projects.pkspot.architect.build.configurations.cloudflare;

    expect(cloudflareConfiguration.externalDependencies).toBeUndefined();
    expect(cloudflareConfiguration.ssr.platform).toBe("neutral");
  });

  it("uses the dedicated staging browser environment instead of production", () => {
    const cloudflareConfiguration =
      angularWorkspace.projects.pkspot.architect.build.configurations.cloudflare;

    expect(cloudflareConfiguration.fileReplacements).toEqual([
      {
        replace: "src/environments/environment.default.ts",
        with: "src/environments/environment.staging.ts",
      },
    ]);
    expect(profileScript).toContain('"src/environments/firebase.staging.json"');
    expect(stagingEnvironment).toContain('name: "Staging"');
    expect(stagingEnvironment).toContain(
      'from "./firebase.staging.json"',
    );
    expect(stagingEnvironment).not.toContain(
      "1:294969617102:web:08b892460adf0b16313e9f",
    );
  });

  it("keeps browser icons inside each localized build", () => {
    expect(indexHtml).toContain('href="assets/icons/favicon-16x16.png"');
    expect(indexHtml).toContain('href="assets/icons/apple-touch-icon.png"');
    expect(indexHtml).toContain('href="favicon.ico"');
    expect(indexHtml).not.toMatch(
      /href="\/(?:assets\/icons\/)?(?:favicon|apple-touch-icon)/u,
    );
  });
});
