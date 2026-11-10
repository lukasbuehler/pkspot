// TZ pinning happens in vite.config.mts (process.env.TZ + test.env),
// before Node has a chance to cache the timezone. Setting it here would
// be too late — Date / Intl have already initialized.

import "@angular/compiler";
import "@angular/localize/init";

// Specs that need no DOM opt into `// @vitest-environment node`, which skips
// jsdom. They do not use TestBed either, so only initialise the zoneless
// Analog TestBed (and its fixture snapshot serializers) under jsdom. A node
// spec that reaches for TestBed fails loudly instead of running half-set-up.
if (typeof document !== "undefined") {
  await import("@analogjs/vitest-angular/setup-snapshots");
  await import("@analogjs/vitest-angular/setup-serializers");
  const { setupTestBed } = await import("@analogjs/vitest-angular/setup-testbed");
  setupTestBed();
}
