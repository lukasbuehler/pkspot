import { TestBed } from "@angular/core/testing";
import { AnalyticsService } from "./analytics.service";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import { MapLinkResolverService } from "./map-link-resolver.service";

describe("MapLinkResolverService", () => {
  const functions = { callAppChecked: vi.fn() };
  const analytics = { trackEvent: vi.fn(), reportError: vi.fn() };
  let service: MapLinkResolverService;

  beforeEach(() => {
    functions.callAppChecked.mockReset();
    analytics.trackEvent.mockReset();
    analytics.reportError.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: FunctionsAdapterService, useValue: functions },
        { provide: AnalyticsService, useValue: analytics },
      ],
    });
    service = TestBed.inject(MapLinkResolverService);
  });

  it("parses Google place IDs without contacting the backend", async () => {
    await expect(
      service.resolve(
        "https://www.google.com/maps/search/?api=1&query=Josefhalle&query_place_id=ChIJ123",
      ),
    ).resolves.toMatchObject({
      provider: "google",
      format: "direct",
      placeId: "ChIJ123",
      query: "Josefhalle",
    });
    expect(functions.callAppChecked).not.toHaveBeenCalled();
  });

  it("parses Apple coordinates and labels", async () => {
    await expect(
      service.resolve("https://maps.apple.com/?ll=47.3769,8.5417&q=Josefhalle"),
    ).resolves.toMatchObject({
      provider: "apple",
      location: { lat: 47.3769, lng: 8.5417 },
      query: "Josefhalle",
    });
  });

  it("parses modern Apple place links", async () => {
    await expect(
      service.resolve(
        "https://maps.apple.com/place?coordinate=47.3769,8.5417&name=Josefhalle",
      ),
    ).resolves.toMatchObject({
      provider: "apple",
      location: { lat: 47.3769, lng: 8.5417 },
      query: "Josefhalle",
    });
  });

  it("expands Google short links through the App Checked callable", async () => {
    functions.callAppChecked.mockResolvedValue({
      finalUrl: "https://www.google.com/maps/place/Josefhalle/@47.3769,8.5417,17z",
    });

    await expect(service.resolve("https://maps.app.goo.gl/abc123")).resolves.toMatchObject({
      provider: "google",
      format: "short",
      location: { lat: 47.3769, lng: 8.5417 },
      query: "Josefhalle",
    });
    expect(functions.callAppChecked).toHaveBeenCalledWith(
      "resolveMapShortLink",
      { url: "https://maps.app.goo.gl/abc123" },
    );
  });

  it("rejects lookalike and non-HTTPS hosts", () => {
    expect(service.isSupportedUrl("https://maps.google.com.evil.test/maps")).toBe(false);
    expect(service.isSupportedUrl("http://maps.apple.com/?q=Zurich")).toBe(false);
    expect(service.isSupportedUrl("https://www.google.com/search?q=secret")).toBe(false);
    expect(service.isSupportedUrl("https://goo.gl/not-a-map")).toBe(false);
  });
});
