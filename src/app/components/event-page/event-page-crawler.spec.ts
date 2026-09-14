import { signal } from "@angular/core";
import { convertToParamMap, ParamMap } from "@angular/router";
import { describe, it, expect, vi } from "vitest";
import { EventInfoPageComponent } from "./event-page.component";

describe("event crawler failures", () => {
  it.each([404, 503] as const)("returns HTTP %s instead of a loading page with status 200", async (status) => {
    const response = { status: vi.fn() };
    const meta = { setRobotsContent: vi.fn() };
    const loading = signal(true), failed = signal(false);
    const component = Object.assign(Object.create(EventInfoPageComponent.prototype), {
      _eventLoadRequestVersion: 0,
      _eventPageData: { loadEventBySlugOrId: status === 404 ? vi.fn().mockResolvedValue(null) : vi.fn().mockRejectedValue(new Error("unavailable")) },
      serverResponse: response, _metaTags: meta,
      _structuredData: { removeStructuredData: vi.fn() },
      featureTelemetry: { failure: vi.fn() },
      event: signal(null), isLoadingEvent: loading, eventLoadFailed: failed,
    }) as { _loadEventFromRoute(params: ParamMap): Promise<void> };
    await component._loadEventFromRoute(convertToParamMap({ slug: "missing" }));
    expect(response.status).toHaveBeenCalledWith(status);
    expect(meta.setRobotsContent).toHaveBeenCalledWith("noindex,follow");
    expect(loading()).toBe(false); expect(failed()).toBe(true);
  });
});

describe("event structured schedule", () => {
  it("preserves exact times, cancellation and country without inventing date-only times", () => {
    const component = Object.assign(Object.create(EventInfoPageComponent.prototype), {
      _locale: "en", _safeExternalUrl: () => undefined,
      _eventStructuredImages: () => [], _buildOrganizerStructuredData: () => undefined,
      _buildEventPerformers: () => undefined, _buildEventOffers: () => undefined,
      _buildEventSeriesStructuredData: () => undefined,
    }) as { _buildEventStructuredData(event: unknown, path: string, description: string): Record<string, unknown> };
    const event = {
      name: "Test event", start: new Date("2026-09-10T16:00:00Z"), end: new Date("2026-09-10T18:00:00Z"),
      timing: { mode: "exact", start_date: "2026-09-10", start_time: "18:00", end_time: "20:00" },
      lifecycleStatus: "cancelled", location: { lat: 47, lng: 8 }, countryCode: "CH",
    };
    const exact = component._buildEventStructuredData(event, "/events/test", "Test");
    expect(exact['startDate']).toBe("2026-09-10T16:00:00.000Z");
    expect(exact['endDate']).toBe("2026-09-10T18:00:00.000Z");
    expect(exact['eventStatus']).toBe("https://schema.org/EventCancelled");
    expect(exact['location']).toMatchObject({ address: { addressCountry: "CH" } });
    const dateOnly = component._buildEventStructuredData({ ...event, timing: { mode: "date_only", start_date: "2026-09-10" } }, "/events/test", "Test");
    expect(dateOnly['startDate']).toBe("2026-09-10");
    const open = component._buildEventStructuredData({ ...event, timing: { mode: "open_end", start_date: "2026-09-10", start_time: "18:00" } }, "/events/test", "Test");
    expect(open['endDate']).toBeUndefined();
  });
});


describe("restricted event metadata", () => {
  it.each([
    { viewerPolicy: { audience: "invited" } },
    { viewerPolicy: { audience: "organization_members", organization_id: "club" } },
    { listingTier: "community" },
  ])("keeps restricted public legacy records out of search: %j", (restriction) => {
    const meta = { setStaticPageMetaTags: vi.fn(), setRobotsContent: vi.fn(), setEventMetaTags: vi.fn() };
    const structured = { removeStructuredData: vi.fn(), addStructuredData: vi.fn() };
    const component = Object.assign(Object.create(EventInfoPageComponent.prototype), {
      _metaTags: meta, _structuredData: structured,
      _eventPageData: { eventCanonicalPath: () => "/events/restricted" },
    }) as { _syncEventSeoData(event: unknown): void };
    component._syncEventSeoData({ published: true, visibility: "public", name: "Restricted name", ...restriction });
    expect(meta.setRobotsContent).toHaveBeenCalledWith("noindex,nofollow");
    expect(meta.setEventMetaTags).not.toHaveBeenCalled();
    expect(structured.addStructuredData).not.toHaveBeenCalled();
    expect(structured.removeStructuredData).toHaveBeenCalledWith("event");
  });
});
