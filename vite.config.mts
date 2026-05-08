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

export default defineConfig(({ mode }) => ({
  plugins: [angular()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/test-setup.ts"],
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
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
