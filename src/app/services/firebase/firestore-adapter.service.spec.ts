import { describe, it, expect, beforeEach, vi, Mock } from "vitest";
import { TestBed } from "@angular/core/testing";
import { Firestore } from "@angular/fire/firestore";
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

vi.mock("@capacitor-firebase/firestore", () => ({
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
}));

// Import after mocks are set up
import {
  FirestoreAdapterService,
  QueryFilter,
  QueryConstraintOptions,
} from "./firestore-adapter.service";
import { PlatformService } from "../platform.service";

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

describe("FirestoreAdapterService", () => {
  let service: FirestoreAdapterService;
  let mockPlatformService: ReturnType<typeof createMockPlatformService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatformService = createMockPlatformService(false, "web");

    TestBed.configureTestingModule({
      providers: [
        FirestoreAdapterService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: PlatformService, useValue: mockPlatformService },
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

  beforeEach(async () => {
    vi.clearAllMocks();

    FirebaseFirestore = (await import("@capacitor-firebase/firestore"))
      .FirebaseFirestore;
    nativeMockPlatformService = createMockPlatformService(true, "ios");

    TestBed.configureTestingModule({
      providers: [
        FirestoreAdapterService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: PlatformService, useValue: nativeMockPlatformService },
      ],
    });

    service = TestBed.inject(FirestoreAdapterService);
  });

  describe("getDocument (native)", () => {
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
  });

  describe("updateDocument (native)", () => {
    it("should call native updateDocument", async () => {
      await service.updateDocument("collection/doc-id", { name: "Updated" });

      expect(FirebaseFirestore.updateDocument).toHaveBeenCalledWith({
        reference: "collection/doc-id",
        data: { name: "Updated" },
      });
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
  });

  describe("getCollection (native)", () => {
    it("should call native getCollection", async () => {
      const result = await service.getCollection<{ name: string; id: string }>(
        "collection"
      );

      expect(FirebaseFirestore.getCollection).toHaveBeenCalled();
      expect(result).toEqual([{ id: "doc1", name: "Doc 1" }]);
    });

    it("should build composite filter for multiple conditions", async () => {
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
  });

  describe("getCollectionGroup (native)", () => {
    it("should call native getCollectionGroup", async () => {
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

    it("should work without filters", async () => {
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
  });

  describe("native realtime listener cleanup", () => {
    it("removes document listener if unsubscribed before callbackId resolves", async () => {
      FirebaseFirestore.addDocumentSnapshotListener.mockReturnValueOnce(
        Promise.resolve("late-listener-id")
      );

      const subscription = service
        .documentSnapshots("collection/doc-id")
        .subscribe();
      subscription.unsubscribe();

      await Promise.resolve();
      await Promise.resolve();

      expect(FirebaseFirestore.removeSnapshotListener).toHaveBeenCalledWith({
        callbackId: "late-listener-id",
      });
    });
  });
});
