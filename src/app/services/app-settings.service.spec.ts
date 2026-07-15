import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { AppSettingsService } from "./app-settings.service";

const SETTINGS_KEY = "pkspot_app_settings";

function flushSignalEffects(): void {
  const testBed = TestBed as unknown as { flushEffects?: () => void };
  testBed.flushEffects?.();
}

function createSettingsService(storedSettings?: Record<string, unknown>) {
  localStorage.clear();
  if (storedSettings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(storedSettings));
  }

  TestBed.configureTestingModule({
    providers: [{ provide: PLATFORM_ID, useValue: "browser" }],
  });

  return TestBed.inject(AppSettingsService);
}

describe("AppSettingsService", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it("keeps map glass blur disabled by default", () => {
    const service = createSettingsService();

    expect(service.enableMapGlassBlur()).toBe(false);
  });

  it("restores the saved map glass blur preference", () => {
    const service = createSettingsService({ enableMapGlassBlur: true });

    expect(service.enableMapGlassBlur()).toBe(true);
  });

  it("saves changes to the map glass blur preference", () => {
    const service = createSettingsService();

    service.enableMapGlassBlur.set(true);
    flushSignalEffects();

    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}")).toMatchObject(
      { enableMapGlassBlur: true },
    );
  });
});
