/// <reference types="vitest" />
import { defineConfig } from "vite";
import angular from "@analogjs/vite-plugin-angular";

// Pin tests to UTC so Intl.DateTimeFormat / Date.toLocale*() output is
// deterministic across developer machines and CI runners. Several specs
// (e.g. firestore-mobile-compat.spec.ts) assert on date strings that
// would otherwise differ by ±1 day depending on the host's timezone.
//
// Set this BEFORE Node has had a chance to cache the timezone by calling
// any Date / Intl method — which means at config-load time, before
// test-setup.ts.
process.env["TZ"] = "UTC";

const generatedOutputGlobs = [
  "android/**",
  "coverage/**",
  "dist/**",
  "ios/**",
  "playwright-report/**",
];
const testFileGlobs = ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"];

export default defineConfig(({ mode }) => ({
  // Vitest does not need dependency prebundling. Leaving discovery enabled makes
  // Vite crawl every HTML file under the repo, including generated mobile and
  // SSR build outputs, which can make esbuild consume multiple GB of memory.
  optimizeDeps: {
    include: [],
    noDiscovery: true,
  },
  plugins: [angular()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/test-setup.ts"],
    include: testFileGlobs,
    exclude: ["node_modules/**", ...generatedOutputGlobs],
    reporters: ["default"],
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
