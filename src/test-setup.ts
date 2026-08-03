// TZ pinning happens in vite.config.mts (process.env.TZ + test.env),
// before Node has a chance to cache the timezone. Setting it here would
// be too late — Date / Intl have already initialized.

import "@angular/compiler";
import "@angular/localize/init";
import "@analogjs/vitest-angular/setup-snapshots";
import "@analogjs/vitest-angular/setup-serializers";
import { setupTestBed } from "@analogjs/vitest-angular/setup-testbed";

setupTestBed();
