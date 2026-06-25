import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpotId } from "../../../../db/schemas/SpotSchema";
import { AnalyticsService } from "../../analytics.service";
import { ConsentService } from "../../consent.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { SlugsService } from "./slugs.service";

const createConsentService = () => ({
  executeWithConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
  executeWhenConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
  hasConsent: vi.fn(() => true),
  isSSR: vi.fn(() => false),
  isBrowser: vi.fn(() => true),
});

describe("SlugsService", () => {
  let service: SlugsService;
  let adapter: {
    getCollection: ReturnType<typeof vi.fn>;
    getDocument: ReturnType<typeof vi.fn>;
    setDocument: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    adapter = {
      getCollection: vi.fn(),
      getDocument: vi.fn(),
      setDocument: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        SlugsService,
        { provide: FirestoreAdapterService, useValue: adapter },
        { provide: ConsentService, useValue: createConsentService() },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
      ],
    });

    service = TestBed.inject(SlugsService);
  });

  it("loads slug mappings through the Firestore adapter", async () => {
    adapter.getDocument.mockResolvedValueOnce({
      id: "the-wall",
      spot_id: "spot-123",
    });

    await expect(service.getSpotIdFromSpotSlug("the-wall")).resolves.toBe(
      "spot-123" as SpotId
    );
    expect(adapter.getDocument).toHaveBeenCalledWith("spot_slugs/the-wall");
  });

  it("does not fetch REST data during slug lookup", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    adapter.getDocument.mockResolvedValueOnce({
      id: "the-wall",
      spot_id: "spot-123",
    });

    await expect(service.getSpotIdFromSpotSlug("the-wall")).resolves.toBe(
      "spot-123" as SpotId
    );

    expect(adapter.getDocument).toHaveBeenCalledWith("spot_slugs/the-wall");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not fall back to REST when adapter-backed slug lookup fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    adapter.getDocument.mockRejectedValueOnce(new Error("adapter failed"));

    await expect(service.getSpotIdFromSpotSlug("the-wall")).rejects.toThrow(
      "adapter failed"
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
