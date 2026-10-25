import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { ExternalMediaPreferencesService } from "./external-media-preferences.service";

describe("External media preferences", () => {
  beforeEach(() => localStorage.clear());
  it("retains legacy file permissions without granting YouTube consent", () => {
    localStorage.setItem("pkspot.showExternalMedia.v1", "true");
    const service = TestBed.inject(ExternalMediaPreferencesService);
    expect(service.external().allowAll).toBe(true);
    expect(service.youtubeAllowed()).toBe(false);
  });
  it("persists YouTube separately and resets every permission", () => {
    const service = TestBed.inject(ExternalMediaPreferencesService);
    service.setYoutubeAllowed(true);
    service.setExternal({allowAll: false, allowedDomains: ["example.com"], temporaryAllowedDomains: {"other.test": Date.now() + 60000}});
    expect(localStorage.getItem("pkspot.youtubeEmbeds.v1")).toBe("true");
    service.reset();
    expect(service.youtubeAllowed()).toBe(false);
    expect(service.revocationVersion()).toBe(1);
    expect(service.external()).toEqual({allowAll: false, allowedDomains: [], temporaryAllowedDomains: {}});
  });
  it("ignores expired or malformed stored permissions", () => {
    localStorage.setItem("pkspot.showExternalMedia.v1", JSON.stringify({allowAll: "yes", allowedDomains: [2, "example.com"], temporaryAllowedDomains: {old: 1, bad: "forever"}}));
    const service = TestBed.inject(ExternalMediaPreferencesService);
    expect(service.external()).toEqual({allowAll:false,allowedDomains:["example.com"],temporaryAllowedDomains:{}});
  });
});
