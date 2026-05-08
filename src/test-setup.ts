// TZ pinning happens in vite.config.mts (process.env.TZ + test.env),
// before Node has a chance to cache the timezone. Setting it here would
// be too late — Date / Intl have already initialized.

import '@angular/localize/init';
import '@analogjs/vitest-angular/setup-zone';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

TestBed.initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting()
);
