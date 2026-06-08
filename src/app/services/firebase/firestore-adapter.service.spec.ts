import { describe, it, expect, beforeEach, vi, Mock } from "vitest";
import { TestBed } from "@angular/core/testing";
import { Firestore } from "@angular/fire/firestore";
import {
  GeoPoint,
  Timestamp,
  deleteField,
  serverTimestamp,
} from "firebase/firestore";
import { of } from "rxjs";

// Note: vi.mock calls are hoisted, so we need inline mocks
vi.mock("@angular/fire/firestore", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@angular/fire/firestore")
  >();
  return {
    ...actual,
    doc: vi.fn(() => ({ id: "test-doc-id" })),
    getDoc: vi.fn().mockResolvedValue({
      exists: () => true,
      id: "test-id",
      data: () => ({ name: "Test" }),
    }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    addDoc: vi.fn().mockResolvedValue({ id: "new-id" }),
    getDocs: vi.fn().mockResolvedValue({
      docs: [{ id: "doc1", data: () => ({ name: "Doc 1" }) }],
    }),
    collection: vi.fn(() => ({})),
    collectionGroup: vi.fn(() => ({})),
    collectionData: vi.fn(() => of([{ id: "doc1", name: "Test" }])),
    docData: vi.fn(() => of({ id: "doc1", name: "Test" })),
    query: vi.fn((ref) => ref),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
});

vi.mock("@capacitor-firebase/firestore", () => {
  class MockTimestamp {
    constructor(
      public seconds: number,
      public nanoseconds: number
    ) {}

    static fromDate(date: Date): MockTimestamp {
      const ms = date.getTime();
      return new MockTimestamp(
        Math.floor(ms / 1000),
        (ms % 1000) * 1_000_000
      );
    }

    toJSON(): Record<string, unknown> {
      return {
        __type__: "timestamp",
        seconds: this.seconds,
        nanoseconds: this.nanoseconds,
      };
    }
  }

  class MockGeoPoint {
    constructor(
      public latitude: number,
      public longitude: number
    ) {}

    toJSON(): Record<string, unknown> {
      return {
        __type__: "geopoint",
        latitude: this.latitude,
        longitude: this.longitude,
      };
    }
  }

  class MockDocumentReference {
    id: string;

    constructor(public path: string) {
      this.id = path.substring(path.lastIndexOf("/") + 1);
    }

    static fromPath(path: string): MockDocumentReference {
      return new MockDocumentReference(path);
    }

    toJSON(): Record<string, unknown> {
      return {
        __type__: "documentReference",
        id: this.id,
        path: this.path,
      };
    }
  }

  class MockFieldValue {
    constructor(private marker: Record<string, unknown>) {}

    static serverTimestamp(): MockFieldValue {
      return new MockFieldValue({ __type__: "serverTimestamp" });
    }

    static arrayUnion(...elements: unknown[]): MockFieldValue {
      return new MockFieldValue({ __type__: "arrayUnion", elements });
    }

    static arrayRemove(...elements: unknown[]): MockFieldValue {
      return new MockFieldValue({ __type__: "arrayRemove", elements });
    }

    static delete(): MockFieldValue {
      return new MockFieldValue({ __type__: "delete" });
    }

    static increment(operand: number): MockFieldValue {
      return new MockFieldValue({ __type__: "increment", operand });
    }

    toJSON(): Record<string, unknown> {
      return { ...this.marker };
    }
  }

  return {
    FirebaseFirestore: {
      getDocument: vi.fn().mockResolvedValue({
        snapshot: { id: "native-doc-id", data: { name: "Native Doc" } },
      }),
      setDocument: vi.fn().mockResolvedValue(undefined),
      updateDocument: vi.fn().mockResolvedValue(undefined),
      deleteDocument: vi.fn().mockResolvedValue(undefined),
      addDocument: vi.fn().mockResolvedValue({
        reference: { path: "collection/new-id" },
      }),
      getCollection: vi.fn().mockResolvedValue({
        snapshots: [{ id: "doc1", data: { name: "Doc 1" } }],
      }),
      getCollectionGroup: vi.fn().mockResolvedValue({
        snapshots: [{ id: "group-doc1", data: { name: "Group Doc 1" } }],
      }),
      addDocumentSnapshotListener: vi.fn().mockResolvedValue("listener-1"),
      addCollectionSnapshotListener: vi.fn().mockResolvedValue("listener-2"),
      addCollectionGroupSnapshotListener: vi.fn().mockResolvedValue("listener-3"),
      removeSnapshotListener: vi.fn().mockResolvedValue(undefined),
    },
    Timestamp: MockTimestamp,
    GeoPoint: MockGeoPoint,
    DocumentReference: MockDocumentReference,
    FieldValue: MockFieldValue,
  };
});

// Import after mocks are set up
import {
  FirestoreAdapterService,
  QueryFilter,
  QueryConstraintOptions,
} from "./firestore-adapter.service";
import { PlatformService } from "../platform.service";
import { FirebaseAppCheckService } from "./app-check.service";

// Mock Firestore instance
const mockFirestore = {};

// Create mock PlatformService
const createMockPlatformService = (
  isNative: boolean,
  platform: "web" | "ios" | "android"
) => ({
  isNative: vi.fn().mockReturnValue(isNative),
  getPlatform: vi.fn().mockReturnValue(platform),
});

const createMockAppCheckService = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
});

describe("FirestoreAdapterService", () => {
  let service: FirestoreAdapterService;
  let mockPlatformService: ReturnType<typeof createMockPlatformService>;
  let mockAppCheckService: ReturnType<typeof createMockAppCheckService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatformService = createMockPlatformService(false, "web");
    mockAppCheckService = createMockAppCheckService();

    TestBed.configureTestingModule({
      providers: [
        FirestoreAdapterService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: PlatformService, useValue: mockPlatformService },
        { provide: FirebaseAppCheckService, useValue: mockAppCheckService },
      ],
    });

    service = TestBed.inject(FirestoreAdapterService);
  });

  describe("initialization", () => {
    it("should be created", () => {
      expect(service).toBeTruthy();
    });

    it("should report web platform", () => {
      expect(service.isNative()).toBe(false);
      expect(service.getPlatform()).toBe("web");
    });
  });

  describe("getDocument (web)", () => {
    it("waits for App Check initialization before using the web SDK", async () => {
      const { getDoc } = await import("@angular/fire/firestore");
      let resolveAppCheck!: () => void;
      mockAppCheckService.initialize.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveAppCheck = resolve;
        })
      );

      const resultPromise = service.getDocument("collection/test-id");
      await Promise.resolve();

      expect(getDoc).not.toHaveBeenCalled();

      resolveAppCheck();
      await resultPromise;

      expect(mockAppCheckService.initialize).toHaveBeenCalledTimes(1);
      expect(getDoc).toHaveBeenCalled();
    });

    it("should return document data when document exists", async () => {
      const { getDoc } = await import("@angular/fire/firestore");
      (getDoc as Mock).mockResolvedValueOnce({
        exists: () => true,
        id: "test-id",
        data: () => ({ name: "Test Document" }),
      });

      const result = await service.getDocument<{ name: string; id: string }>(
        "collection/test-id"
      );

      expect(result).toEqual({ id: "test-id", name: "Test Document" });
    });

    it("should return null when document does not exist", async () => {
      const { getDoc } = await import("@angular/fire/firestore");
      (getDoc as Mock).mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
      });

      const result = await service.getDocument("collection/nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("setDocument (web)", () => {
    it("should call setDoc", async () => {
      const { setDoc } = await import("@angular/fire/firestore");

      await service.setDocument("collection/doc-id", { name: "New Doc" });

      expect(setDoc).toHaveBeenCalled();
    });

    it("should pass RSVP merge payloads through to the web SDK", async () => {
      const { setDoc } = await import("@angular/fire/firestore");
      const payload = {
        user_id: "user-1",
        event_id: "event-1",
        rsvp: "going",
        time_created: new Date("2026-05-24T20:00:00.000Z"),
        time_updated: new Date("2026-05-24T20:00:00.000Z"),
      };

      await service.setDocument("events/event-1/rsvps/user-1", payload, {
        merge: true,
      });

      expect(setDoc).toHaveBeenCalledWith(expect.anything(), payload, {
        merge: true,
      });
    });
  });

  describe("updateDocument (web)", () => {
    it("should call updateDoc", async () => {
      const { updateDoc } = await import("@angular/fire/firestore");

      await service.updateDocument("collection/doc-id", { name: "Updated" });

      expect(updateDoc).toHaveBeenCalled();
    });
  });

  describe("deleteDocument (web)", () => {
    it("should call deleteDoc", async () => {
      const { deleteDoc } = await import("@angular/fire/firestore");

      await service.deleteDocument("collection/doc-id");

      expect(deleteDoc).toHaveBeenCalled();
    });
  });

  describe("addDocument (web)", () => {
    it("should return the new document ID", async () => {
      const { addDoc } = await import("@angular/fire/firestore");
      (addDoc as Mock).mockResolvedValueOnce({ id: "new-generated-id" });

      const docId = await service.addDocument("collection", { name: "New" });

      expect(docId).toBe("new-generated-id");
    });

    it("should pass create-edit payload types through to the web SDK", async () => {
      const { addDoc } = await import("@angular/fire/firestore");
      const payload = {
        type: "CREATE",
        timestamp_raw_ms: 1,
        user: { uid: "user-1", display_name: "Test User" },
        data: {
          name: { en: { text: "Something Park", provider: "user" } },
          location: { latitude: 47.3769, longitude: 8.5417 },
          location_raw: { lat: 47.3769, lng: 8.5417 },
          media: [],
          type: "park",
          access: "public",
          amenities: { covered: false, lit: true },
        },
      };

      await service.addDocument("spots/spot-1/edits", payload);

      expect(addDoc).toHaveBeenCalledWith(expect.anything(), payload);
    });
  });

  describe("createDocumentId (web)", () => {
    it("should generate an id without writing", async () => {
      const { addDoc, doc, collection } = await import("@angular/fire/firestore");

      const docId = service.createDocumentId("spots");

      expect(docId).toBe("test-doc-id");
      expect(collection).toHaveBeenCalled();
      expect(doc).toHaveBeenCalled();
      expect(addDoc).not.toHaveBeenCalled();
    });
  });

  describe("getCollection (web)", () => {
    it("should return array of documents", async () => {
      const mockDocs = [
        { id: "doc1", data: () => ({ name: "Doc 1" }) },
        { id: "doc2", data: () => ({ name: "Doc 2" }) },
      ];
      const { getDocs } = await import("@angular/fire/firestore");
      (getDocs as Mock).mockResolvedValueOnce({ docs: mockDocs });

      const result = await service.getCollection<{ name: string; id: string }>(
        "collection"
      );

      expect(Array.isArray(result)).toBe(true);
    });

    it("should apply filters correctly", async () => {
      const mockDocs = [
        { id: "filtered-doc", data: () => ({ status: "active" }) },
      ];
      const { getDocs } = await import("@angular/fire/firestore");
      (getDocs as Mock).mockResolvedValueOnce({ docs: mockDocs });

      const filters: QueryFilter[] = [
        { fieldPath: "status", opStr: "==", value: "active" },
      ];

      const result = await service.getCollection("collection", filters);

      expect(Array.isArray(result)).toBe(true);
    });

    it("should apply orderBy and limit constraints", async () => {
      const mockDocs = [{ id: "sorted-doc", data: () => ({ createdAt: 123 }) }];
      const { getDocs } = await import("@angular/fire/firestore");
      (getDocs as Mock).mockResolvedValueOnce({ docs: mockDocs });

      const constraints: QueryConstraintOptions[] = [
        { type: "orderBy", fieldPath: "createdAt", direction: "desc" },
        { type: "limit", limit: 10 },
      ];

      const result = await service.getCollection(
        "collection",
        undefined,
        constraints
      );

      expect(Array.isArray(result)).toBe(true);
    });

    it("should ignore malformed limit constraints instead of forwarding them", async () => {
      const mockDocs = [{ id: "doc1", data: () => ({ name: "Doc 1" }) }];
      const { getDocs, limit } = await import("@angular/fire/firestore");
      (getDocs as Mock).mockResolvedValueOnce({ docs: mockDocs });

      const constraints = [
        { type: "limit", limit: { bad: true } },
      ] as unknown as QueryConstraintOptions[];

      const result = await service.getCollection(
        "collection",
        undefined,
        constraints
      );

      expect(Array.isArray(result)).toBe(true);
      expect(limit).not.toHaveBeenCalled();
    });
  });

  describe("getCollectionGroup (web)", () => {
    it("should query across all subcollections", async () => {
      const mockDocs = [
        { id: "edit1", data: () => ({ userId: "user1" }) },
        { id: "edit2", data: () => ({ userId: "user1" }) },
      ];
      const { getDocs } = await import("@angular/fire/firestore");
      (getDocs as Mock).mockResolvedValueOnce({ docs: mockDocs });

      const filters: QueryFilter[] = [
        { fieldPath: "userId", opStr: "==", value: "user1" },
      ];

      const result = await service.getCollectionGroup<{
        userId: string;
        id: string;
      }>("edits", filters);

      expect(Array.isArray(result)).toBe(true);
    });

    it("should work without filters", async () => {
      const mockDocs = [{ id: "doc1", data: () => ({ field: "value" }) }];
      const { getDocs } = await import("@angular/fire/firestore");
      (getDocs as Mock).mockResolvedValueOnce({ docs: mockDocs });

      const result = await service.getCollectionGroup("edits");

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("documentSnapshots (web)", () => {
    it("should return an observable", () => {
      const result$ = service.documentSnapshots("collection/doc1");

      expect(result$).toBeDefined();
      expect(typeof result$.subscribe).toBe("function");
    });
  });

  describe("collectionSnapshots (web)", () => {
    it("should return an observable of arrays", () => {
      const result$ = service.collectionSnapshots("collection");

      expect(result$).toBeDefined();
      expect(typeof result$.subscribe).toBe("function");
    });
  });

  describe("collectionGroupSnapshots (web)", () => {
    it("should return an observable for collection group", () => {
      const result$ = service.collectionGroupSnapshots("edits");

      expect(result$).toBeDefined();
      expect(typeof result$.subscribe).toBe("function");
    });

    it("should apply filters to collection group snapshots", () => {
      const filters: QueryFilter[] = [
        { fieldPath: "userId", opStr: "==", value: "user1" },
      ];

      const result$ = service.collectionGroupSnapshots("edits", filters);

      expect(result$).toBeDefined();
    });
  });
});

describe("FirestoreAdapterService (native)", () => {
  let service: FirestoreAdapterService;
  let FirebaseFirestore: any;
  let nativeMockPlatformService: ReturnType<typeof createMockPlatformService>;
  let mockAppCheckService: ReturnType<typeof createMockAppCheckService>;
  let fetchMock: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();

    FirebaseFirestore = (await import("@capacitor-firebase/firestore"))
      .FirebaseFirestore;
    nativeMockPlatformService = createMockPlatformService(true, "ios");
    mockAppCheckService = createMockAppCheckService();
    fetchMock = vi.fn().mockRejectedValue(new Error("mock fetch not configured"));
    vi.stubGlobal("fetch", fetchMock);

    TestBed.configureTestingModule({
      providers: [
        FirestoreAdapterService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: PlatformService, useValue: nativeMockPlatformService },
        { provide: FirebaseAppCheckService, useValue: mockAppCheckService },
      ],
    });

    service = TestBed.inject(FirestoreAdapterService);
  });

  describe("getDocument (native)", () => {
    it("waits for App Check initialization before using the native SDK", async () => {
      let resolveAppCheck!: () => void;
      mockAppCheckService.initialize.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveAppCheck = resolve;
        })
      );

      const resultPromise = service.getDocument("collection/doc-id");
      await Promise.resolve();

      expect(FirebaseFirestore.getDocument).not.toHaveBeenCalled();

      resolveAppCheck();
      await resultPromise;

      expect(mockAppCheckService.initialize).toHaveBeenCalledTimes(1);
      expect(FirebaseFirestore.getDocument).toHaveBeenCalledWith({
        reference: "collection/doc-id",
      });
    });

    it("should call native getDocument", async () => {
      const result = await service.getDocument<{ name: string; id: string }>(
        "collection/doc-id"
      );

      expect(FirebaseFirestore.getDocument).toHaveBeenCalledWith({
        reference: "collection/doc-id",
      });
      expect(result).toEqual({ id: "native-doc-id", name: "Native Doc" });
    });

    it("should return null when document has no data", async () => {
      FirebaseFirestore.getDocument.mockResolvedValueOnce({
        snapshot: { id: "empty-doc", data: null },
      });

      const result = await service.getDocument("collection/empty");

      expect(result).toBeNull();
    });

    it("should preserve plain mobile firestore values when Timestamp and GeoPoint classes are absent", async () => {
      FirebaseFirestore.getDocument.mockResolvedValueOnce({
        snapshot: {
          id: "mobile-doc",
          data: {
            location: { latitude: 48.1234, longitude: 11.5678 },
            updated_at: {
              seconds: 1_700_000_000,
              nanoseconds: 123_000_000,
            },
            nested: {
              release_date: {
                seconds: 1_700_000_100,
                nanoseconds: 0,
              },
            },
          },
        },
      });

      const result = await service.getDocument<{
        id: string;
        location: { latitude: number; longitude: number };
        updated_at: { seconds: number; nanoseconds: number };
        nested: {
          release_date: { seconds: number; nanoseconds: number };
        };
      }>("spots/mobile-doc");

      expect(result).toEqual({
        id: "mobile-doc",
        location: { latitude: 48.1234, longitude: 11.5678 },
        updated_at: {
          seconds: 1_700_000_000,
          nanoseconds: 123_000_000,
        },
        nested: {
          release_date: {
            seconds: 1_700_000_100,
            nanoseconds: 0,
          },
        },
      });
    });
  });

  describe("setDocument (native)", () => {
    it("should call native setDocument", async () => {
      await service.setDocument("collection/doc-id", { name: "Native Doc" });

      expect(FirebaseFirestore.setDocument).toHaveBeenCalledWith({
        reference: "collection/doc-id",
        data: { name: "Native Doc" },
        merge: undefined,
      });
    });

    it("should pass RSVP merge payloads through to the native SDK", async () => {
      const payload = {
        user_id: "user-1",
        event_id: "event-1",
        rsvp: "interested",
        time_updated: new Date("2026-05-24T20:00:00.000Z"),
      };

      await service.setDocument("events/event-1/rsvps/user-1", payload, {
        merge: true,
      });

      expect(FirebaseFirestore.setDocument).toHaveBeenCalledWith({
        reference: "events/event-1/rsvps/user-1",
        data: {
          ...payload,
          time_updated: expect.objectContaining({
            seconds: 1_779_652_800,
            nanoseconds: 0,
          }),
        },
        merge: true,
      });
    });

    it("should normalize Firebase special values before native setDocument", async () => {
      await service.setDocument("events/event-1", {
        start: Timestamp.fromDate(new Date("2026-05-24T20:00:00.123Z")),
        location: new GeoPoint(47.3769, 8.5417),
        owner: { type: "document", path: "users/user-1" },
        time_updated: serverTimestamp(),
        hidden_until: deleteField(),
        plain_location: { latitude: 47.3769, longitude: 8.5417 },
      });

      const call = FirebaseFirestore.setDocument.mock.calls[0][0];
      expect(call.data.start.toJSON()).toEqual({
        __type__: "timestamp",
        seconds: 1_779_652_800,
        nanoseconds: 123_000_000,
      });
      expect(call.data.location.toJSON()).toEqual({
        __type__: "geopoint",
        latitude: 47.3769,
        longitude: 8.5417,
      });
      expect(call.data.owner.toJSON()).toEqual({
        __type__: "documentReference",
        id: "user-1",
        path: "users/user-1",
      });
      expect(call.data.time_updated.toJSON()).toEqual({
        __type__: "serverTimestamp",
      });
      expect(call.data.hidden_until.toJSON()).toEqual({ __type__: "delete" });
      expect(call.data.plain_location).toEqual({
        latitude: 47.3769,
        longitude: 8.5417,
      });
    });
  });

  describe("updateDocument (native)", () => {
    it("should call native updateDocument", async () => {
      await service.updateDocument("collection/doc-id", { name: "Updated" });

      expect(FirebaseFirestore.updateDocument).toHaveBeenCalledWith({
        reference: "collection/doc-id",
        data: { name: "Updated" },
      });
    });

    it("should normalize Firebase special values before native updateDocument", async () => {
      await service.updateDocument("collection/doc-id", {
        time_updated: Timestamp.fromMillis(1_748_118_400_000),
        removed: deleteField(),
      });

      const call = FirebaseFirestore.updateDocument.mock.calls[0][0];
      expect(call.data.time_updated.toJSON()).toEqual({
        __type__: "timestamp",
        seconds: 1_748_118_400,
        nanoseconds: 0,
      });
      expect(call.data.removed.toJSON()).toEqual({ __type__: "delete" });
    });
  });

  describe("deleteDocument (native)", () => {
    it("should call native deleteDocument", async () => {
      await service.deleteDocument("collection/doc-id");

      expect(FirebaseFirestore.deleteDocument).toHaveBeenCalledWith({
        reference: "collection/doc-id",
      });
    });
  });

  describe("addDocument (native)", () => {
    it("should extract ID from returned reference path", async () => {
      const docId = await service.addDocument("collection", { name: "New" });

      expect(FirebaseFirestore.addDocument).toHaveBeenCalled();
      expect(docId).toBe("new-id");
    });

    it("should pass create-edit payload types through to the native SDK", async () => {
      const payload = {
        type: "CREATE",
        timestamp_raw_ms: 1,
        user: { uid: "user-1", display_name: "Test User" },
        data: {
          name: { en: { text: "Something Park", provider: "user" } },
          location: { latitude: 47.3769, longitude: 8.5417 },
          location_raw: { lat: 47.3769, lng: 8.5417 },
          media: [],
          type: "park",
          access: "public",
          amenities: { covered: false, lit: true },
        },
      };

      await service.addDocument("spots/spot-1/edits", payload);

      expect(FirebaseFirestore.addDocument).toHaveBeenCalledWith({
        reference: "spots/spot-1/edits",
        data: payload,
      });
    });

    it("should normalize nested Firebase special values before native addDocument", async () => {
      await service.addDocument("spots/spot-1/edits", {
        timestamp: Timestamp.fromMillis(1_748_118_400_000),
        data: {
          location: new GeoPoint(47.3769, 8.5417),
        },
      });

      const call = FirebaseFirestore.addDocument.mock.calls[0][0];
      expect(call.data.timestamp.toJSON()).toEqual({
        __type__: "timestamp",
        seconds: 1_748_118_400,
        nanoseconds: 0,
      });
      expect(call.data.data.location.toJSON()).toEqual({
        __type__: "geopoint",
        latitude: 47.3769,
        longitude: 8.5417,
      });
    });
  });

  describe("createDocumentId (native)", () => {
    it("should generate a web-sdk id without using the native write bridge", async () => {
      const { doc, collection } = await import("@angular/fire/firestore");

      const docId = service.createDocumentId("spots");

      expect(docId).toBe("test-doc-id");
      expect(collection).toHaveBeenCalled();
      expect(doc).toHaveBeenCalled();
      expect(FirebaseFirestore.addDocument).not.toHaveBeenCalled();
      expect(FirebaseFirestore.setDocument).not.toHaveBeenCalled();
    });
  });

  describe("getCollection (native)", () => {
    it("should call native getCollection on Android", async () => {
      nativeMockPlatformService.getPlatform.mockReturnValue("android");
      const result = await service.getCollection<{ name: string; id: string }>(
        "collection"
      );

      expect(FirebaseFirestore.getCollection).toHaveBeenCalled();
      expect(result).toEqual([{ id: "doc1", name: "Doc 1" }]);
    });

    it("should build composite filter for multiple conditions on Android", async () => {
      nativeMockPlatformService.getPlatform.mockReturnValue("android");
      const filters: QueryFilter[] = [
        { fieldPath: "status", opStr: "==", value: "active" },
        { fieldPath: "type", opStr: "==", value: "spot" },
      ];

      await service.getCollection("collection", filters);

      expect(FirebaseFirestore.getCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          compositeFilter: expect.objectContaining({
            type: "and",
            queryConstraints: expect.any(Array),
          }),
        })
      );
    });

    it("should call native getCollection on iOS", async () => {
      const { getDocs } = await import("@angular/fire/firestore");
      (getDocs as Mock).mockResolvedValueOnce({
        docs: [{ id: "ios-doc", data: () => ({ name: "iOS" }) }],
      });

      const result = await service.getCollection<{ name: string; id: string }>(
        "users"
      );

      expect(FirebaseFirestore.getCollection).toHaveBeenCalledWith({
        reference: "users",
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getDocs).not.toHaveBeenCalled();
      expect(result).toEqual([{ id: "doc1", name: "Doc 1" }]);
    });

    it("should apply native query constraints on iOS without REST", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([
          {
            document: {
              name: "projects/parkour-base-project/databases/(default)/documents/users/http-doc",
              fields: {
                display_name: { stringValue: "HTTP User" },
                spot_edits_count: { integerValue: "12" },
              },
            },
          },
        ]),
      });
      const { getDocs } = await import("@angular/fire/firestore");

      const result = await service.getCollection<{
        id: string;
        name: string;
      }>("users", [], [
        { type: "orderBy", fieldPath: "spot_edits_count", direction: "desc" },
        { type: "limit", limit: 100 },
      ]);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(FirebaseFirestore.getCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          reference: "users",
          queryConstraints: [
            {
              type: "orderBy",
              fieldPath: "spot_edits_count",
              directionStr: "desc",
            },
            { type: "limit", limit: 100 },
          ],
        })
      );
      expect(getDocs).not.toHaveBeenCalled();
      expect(result).toEqual([{ id: "doc1", name: "Doc 1" }]);
    });

    it("should not use REST normalization for iOS collection queries", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([]),
      });

      const result = await service.getCollection<{ id: string; name: string }>(
        "spots"
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(FirebaseFirestore.getCollection).toHaveBeenCalledWith({
        reference: "spots",
      });
      expect(result).toEqual([{ id: "doc1", name: "Doc 1" }]);
    });

    it("should not apply the iOS web timeout when using native getCollection", async () => {
      vi.useFakeTimers();
      try {
        const { getDocs } = await import("@angular/fire/firestore");
        (getDocs as Mock).mockReturnValueOnce(new Promise(() => {}));
        fetchMock.mockReturnValueOnce(new Promise(() => {}));

        const handled = service.getCollection("users");
        await vi.advanceTimersByTimeAsync(15001);

        await expect(handled).resolves.toEqual([{ id: "doc1", name: "Doc 1" }]);
        expect(getDocs).not.toHaveBeenCalled();
        expect(FirebaseFirestore.getCollection).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("getCollectionGroup (native)", () => {
    it("should call native getCollectionGroup on Android", async () => {
      nativeMockPlatformService.getPlatform.mockReturnValue("android");
      const filters: QueryFilter[] = [
        { fieldPath: "user.uid", opStr: "==", value: "user123" },
      ];

      const result = await service.getCollectionGroup<{
        name: string;
        id: string;
      }>("edits", filters);

      expect(FirebaseFirestore.getCollectionGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          reference: "edits",
          compositeFilter: expect.objectContaining({
            type: "and",
          }),
        })
      );
      expect(result).toEqual([{ id: "group-doc1", name: "Group Doc 1" }]);
    });

    it("should work without filters on Android", async () => {
      nativeMockPlatformService.getPlatform.mockReturnValue("android");
      FirebaseFirestore.getCollectionGroup.mockResolvedValueOnce({
        snapshots: [{ id: "all-edits", data: { field: "value" } }],
      });

      const result = await service.getCollectionGroup("edits");

      expect(FirebaseFirestore.getCollectionGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          reference: "edits",
        })
      );
      expect(result).toEqual([{ id: "all-edits", field: "value" }]);
    });

    it("should call native getCollectionGroup on iOS", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue([
          {
            document: {
              name: "projects/parkour-base-project/databases/(default)/documents/spots/s1/edits/g1",
              fields: {
                field: { stringValue: "value" },
              },
            },
          },
        ]),
      });
      const { getDocs } = await import("@angular/fire/firestore");

      const result = await service.getCollectionGroup<{
        field: string;
        id: string;
      }>("edits");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(FirebaseFirestore.getCollectionGroup).toHaveBeenCalledWith({
        reference: "edits",
      });
      expect(getDocs).not.toHaveBeenCalled();
      expect(result).toEqual([{ id: "group-doc1", name: "Group Doc 1" }]);
    });
  });

  describe("native realtime listener cleanup", () => {
    it("emits document snapshots via the native listener", async () => {
      FirebaseFirestore.addDocumentSnapshotListener.mockImplementationOnce(
        (_options: unknown, callback: Function) => {
          callback(
            {
              snapshot: {
                id: "native-doc",
                data: { name: "Native Realtime Doc" },
              },
            },
            undefined
          );
          return Promise.resolve("listener-doc");
        }
      );

      let received: { id: string; name: string } | null | undefined;
      const subscription = service
        .documentSnapshots<{ id: string; name: string }>("collection/doc-id")
        .subscribe((value) => {
          received = value;
        });
      await Promise.resolve();
      await Promise.resolve();

      expect(FirebaseFirestore.addDocumentSnapshotListener).toHaveBeenCalledWith(
        { reference: "collection/doc-id" },
        expect.any(Function)
      );
      expect(received).toEqual({
        id: "native-doc",
        name: "Native Realtime Doc",
      });

      subscription.unsubscribe();
    });

    it("emits collection snapshots via the native listener", async () => {
      FirebaseFirestore.addCollectionSnapshotListener.mockImplementationOnce(
        (_options: unknown, callback: Function) => {
          callback(
            {
              snapshots: [
                { id: "doc-a", data: { name: "Alpha" } },
                { id: "doc-b", data: { name: "Beta" } },
              ],
            },
            undefined
          );
          return Promise.resolve("listener-collection");
        }
      );

      let received: Array<{ id: string; name: string }> | undefined;
      const subscription = service
        .collectionSnapshots<{ id: string; name: string }>("collection")
        .subscribe((value) => {
          received = value;
        });
      await Promise.resolve();
      await Promise.resolve();

      expect(FirebaseFirestore.addCollectionSnapshotListener).toHaveBeenCalledWith(
        expect.objectContaining({ reference: "collection" }),
        expect.any(Function)
      );
      expect(received).toEqual([
        { id: "doc-a", name: "Alpha" },
        { id: "doc-b", name: "Beta" },
      ]);

      subscription.unsubscribe();
    });

    it("removes document listener if unsubscribed before callbackId resolves", async () => {
      FirebaseFirestore.addDocumentSnapshotListener.mockReturnValueOnce(
        Promise.resolve("late-listener-id")
      );

      const subscription = service
        .documentSnapshots("collection/doc-id")
        .subscribe();
      await Promise.resolve();
      await Promise.resolve();
      subscription.unsubscribe();

      await Promise.resolve();
      await Promise.resolve();

      expect(FirebaseFirestore.removeSnapshotListener).toHaveBeenCalledWith({
        callbackId: "late-listener-id",
      });
    });
  });
});
