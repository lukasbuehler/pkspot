import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestBed } from "@angular/core/testing";
import { SpotsService } from "./spots.service";
import { Firestore } from "@angular/fire/firestore";
import { Spot } from "../../../../db/models/Spot";
import { SpotId } from "../../../../db/schemas/SpotSchema";

// Mock Firestore with partial mock
vi.mock("@angular/fire/firestore", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@angular/fire/firestore")
  >();
  return {
    ...actual,
    doc: vi.fn(() => ({})),
    getDoc: vi.fn().mockResolvedValue({
      exists: () => false,
      data: () => null,
    }),
    collection: vi.fn(() => ({})),
    collectionData: vi.fn(),
    docData: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
  };
});

// Mock Firestore instance
const mockFirestore = {};

describe("SpotsService", () => {
  let service: SpotsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SpotsService,
        { provide: Firestore, useValue: mockFirestore },
      ],
    });

    service = TestBed.inject(SpotsService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  describe("docRef", () => {
    it("should be a function", () => {
      expect(typeof service.docRef).toBe("function");
    });
  });

  describe("_checkMediaDiffAndDeleteFromStorageIfNecessary", () => {
    it("should handle null old media", () => {
      expect(() => {
        service._checkMediaDiffAndDeleteFromStorageIfNecessary(null as any, []);
      }).not.toThrow();
    });

    it("should handle null new media", () => {
      expect(() => {
        service._checkMediaDiffAndDeleteFromStorageIfNecessary([], null as any);
      }).not.toThrow();
    });

    it("should handle empty arrays", () => {
      expect(() => {
        service._checkMediaDiffAndDeleteFromStorageIfNecessary([], []);
      }).not.toThrow();
    });
  });
});

describe("Spot Model", () => {
  it("should create a Spot from schema data", () => {
    const mockData = {
      name: { en: "Test Spot" },
      description: { en: "A test spot" },
      location: { latitude: 48.1234, longitude: 11.5678 },
      type: "outdoor",
      access: "public",
      tile_coordinates: {
        z16: { x: 12345, y: 23456 },
      },
    };

    const spot = new Spot("test-id" as SpotId, mockData as any, "en");

    expect(spot.id).toBe("test-id");
    // name is a computed signal, so we need to call it
    expect(typeof spot.name === "function" ? spot.name() : spot.name).toBe(
      "Test Spot"
    );
  });

  it("should handle missing locale with fallback", () => {
    const mockData = {
      name: { de: "German Name" },
      location: { latitude: 48.1234, longitude: 11.5678 },
      tile_coordinates: {
        z16: { x: 12345, y: 23456 },
      },
    };

    const spot = new Spot("test-id" as SpotId, mockData as any, "en");

    // Should fallback to first available locale
    // name is a computed signal, so we need to call it
    const nameValue = typeof spot.name === "function" ? spot.name() : spot.name;
    expect(nameValue).toBeTruthy();
  });
});
