/// <reference types="vitest" />
import { defineConfig } from "vite";
import angular from "@analogjs/vite-plugin-angular";
import {
  appHtmlEntry,
  generatedOutputGlobs,
  testFileGlobs,
} from "./vite-scan-boundaries.mjs";

// Pin tests to UTC so Intl.DateTimeFormat / Date.toLocale*() output is
// deterministic across developer machines and CI runners. Several specs
// (e.g. firestore-mobile-compat.spec.ts) assert on date strings that
// would otherwise differ by ±1 day depending on the host's timezone.
//
// Set this BEFORE Node has had a chance to cache the timezone by calling
// any Date / Intl method — which means at config-load time, before
// test-setup.ts.
process.env["TZ"] = "UTC";

const maxTestWorkers = readPositiveInteger(
  process.env["PKSPOT_VITEST_MAX_WORKERS"],
  2
);
const maxTestHeapMb = readPositiveInteger(
  process.env["PKSPOT_VITEST_MAX_OLD_SPACE_MB"],
  4096
);

process.env["ESBUILD_WORKER_THREADS"] ??= "0";
process.env["NODE_OPTIONS"] = withMaxOldSpaceSize(
  process.env["NODE_OPTIONS"],
  maxTestHeapMb
);

export default defineConfig(({ mode }) => ({
  // Vitest does not need dependency prebundling. Leaving discovery enabled makes
  // Vite crawl every HTML file under the repo, including generated mobile and
  // SSR build outputs, which can make esbuild consume multiple GB of memory.
  optimizeDeps: {
    entries: [appHtmlEntry],
    include: [],
    noDiscovery: true,
  },
  build: {
    rollupOptions: {
      input: appHtmlEntry,
    },
  },
  plugins: [angular(), disableVitestDependencyScan()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/test-setup.ts"],
    include: testFileGlobs,
    exclude: ["node_modules/**", ...generatedOutputGlobs],
    maxWorkers: maxTestWorkers,
    reporters: ["default"],
    deps: {
      optimizer: {
        client: {
          enabled: false,
        },
        ssr: {
          enabled: false,
        },
      },
    },
    server: {
      deps: {
        inline: ["rxfire", "@angular/fire"],
      },
    },
    env: {
      TZ: "UTC",
    },
  },
  define: {
    "import.meta.vitest": mode !== "production",
  },
}));

function disableVitestDependencyScan() {
  return {
    name: "pkspot-disable-vitest-dependency-scan",
    enforce: "post" as const,
    config() {
      if (!isVitestProcess()) {
        return;
      }

      return {
        optimizeDeps: {
          entries: [],
          include: [],
          noDiscovery: true,
        },
      };
    },
    configResolved(config) {
      if (!isVitestProcess()) {
        return;
      }

      config.optimizeDeps.include = [];
      config.optimizeDeps.entries = [];
      config.optimizeDeps.noDiscovery = true;
    },
  };
}

function isVitestProcess(): boolean {
  return (
    process.env["PKSPOT_RUNNING_VITEST"] === "1" ||
    process.env["VITEST"] === "true" ||
    process.argv.some((arg) => arg.includes("vitest"))
  );
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }

  return parsedValue;
}

function withMaxOldSpaceSize(nodeOptions: string | undefined, maxOldSpaceSizeMb: number): string {
  const sanitizedOptions = (nodeOptions || "")
    .replace(/(?:^|\s)--max-old-space-size=\S+/g, " ")
    .trim();
  const heapOption = `--max-old-space-size=${maxOldSpaceSizeMb}`;

  return [sanitizedOptions, heapOption].filter(Boolean).join(" ");
}
