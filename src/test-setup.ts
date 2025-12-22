import '@angular/localize/init';
import '@analogjs/vitest-angular/setup-zone';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

TestBed.initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting()
);
