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

  it("accepts share-sheet text containing a place title before a URL", async () => {
    const text = "Dropped pin\nhttps://maps.app.goo.gl/example?g_st=ac";
    functions.callAppChecked.mockResolvedValue({finalUrl: "https://www.google.com/maps?q=47.58,7.58"});
    expect(service.isSupportedUrl(text)).toBe(true);
    await expect(service.resolve(text)).resolves.toMatchObject({location: {lat: 47.58, lng: 7.58}});
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
      query: "Josefhalle",
    });
    expect(functions.callAppChecked).toHaveBeenCalledWith(
      "resolveMapShortLink",
      { url: "https://maps.app.goo.gl/abc123" },
    );
  });

  it("extracts the destination from modern Google place URLs", async () => {
    functions.callAppChecked.mockResolvedValue({
      finalUrl:
        "https://www.google.com/maps/place/Spital+Lachen+AG/@47.1887254,8.8399137,4111m/data=!3m2!1e3!4m6!3m5!1s0x479ab6093abf4e7b:0x42f90d610a59c0cf!8m2!3d47.1893231!4d8.8592046!16s%2Fg%2F1thd0sd3",
    });

    await expect(
      service.resolve("https://maps.app.goo.gl/v53ih4b5vdjweTB57"),
    ).resolves.toMatchObject({
      provider: "google",
      format: "short",
      query: "Spital Lachen AG",
      location: { lat: 47.1893231, lng: 8.8592046 },
    });
  });

  it("accepts iOS Google Maps root redirects without inventing coordinates", async () => {
    functions.callAppChecked.mockResolvedValue({finalUrl: "https://maps.google.com?q=Seedammstrasse,+8808+Freienbach&ftid=example"});
    const result = await service.resolve("https://maps.app.goo.gl/example?g_st=ic");
    expect(result.query).toBe("Seedammstrasse, 8808 Freienbach");
    expect(result.location).toBeUndefined();
  });

  it("does not mistake Google camera coordinates for the shared pin", async () => {
    const result = await service.resolve("https://www.google.com/maps/place/Training/@48,9,15z?ll=48,9");
    expect(result.location).toBeUndefined();
    expect(result.query).toBe("Training");
  });

  it("opens a saved address-only root URL without calling the cloud resolver", async () => {
    await expect(service.resolve("https://maps.google.com/?q=Spielplatz,+Hafenweg+1,+8808+Freienbach&ftid=example"))
      .resolves.toEqual({provider: "google", format: "direct", query: "Spielplatz, Hafenweg 1, 8808 Freienbach"});
    expect(functions.callAppChecked).not.toHaveBeenCalled();
  });

  it.each(["https://user@maps.google.com/?q=Training", "https://maps.google.com:444/?q=Training"])("rejects unsafe URL %s", url => {
    expect(service.isSupportedUrl(url)).toBe(false);
  });

  it("rejects lookalike and non-HTTPS hosts", () => {
    expect(service.isSupportedUrl("https://maps.google.com.evil.test/maps")).toBe(false);
    expect(service.isSupportedUrl("http://maps.apple.com/?q=Zurich")).toBe(false);
    expect(service.isSupportedUrl("https://www.google.com/search?q=secret")).toBe(false);
    expect(service.isSupportedUrl("https://goo.gl/not-a-map")).toBe(false);
  });
});
