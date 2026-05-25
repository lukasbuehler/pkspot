import { TestBed } from "@angular/core/testing";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { OrganizationsService } from "./organizations.service";

vi.mock("@angular/fire/functions", () => ({
  Functions: class {},
  httpsCallable: vi.fn(),
}));

const createMockFirestoreAdapter = () => ({
  getCollection: vi.fn(),
  getDocument: vi.fn(),
  setDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
});

const createMockAuthService = (isAdmin: boolean) => ({
  user: {
    uid: "admin-user",
    data: {
      isAdmin,
    },
  },
});

describe("OrganizationsService", () => {
  let mockCallable: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallable = vi.fn().mockResolvedValue({ data: { ok: true } });
    vi.mocked(httpsCallable).mockReturnValue(mockCallable);
  });

  function configure(isAdmin = true): OrganizationsService {
    TestBed.configureTestingModule({
      providers: [
        OrganizationsService,
        { provide: FirestoreAdapterService, useValue: createMockFirestoreAdapter() },
        { provide: AuthenticationService, useValue: createMockAuthService(isAdmin) },
        { provide: Functions, useValue: {} },
      ],
    });

    return TestBed.inject(OrganizationsService);
  }

  it("sets spot verification through the trusted callable", async () => {
    const service = configure();

    await service.setSpotVerification("spot-1", "pkspot");

    expect(httpsCallable).toHaveBeenCalledWith({}, "setSpotVerification");
    expect(mockCallable).toHaveBeenCalledWith({
      spotId: "spot-1",
      organizationId: "pkspot",
    });
  });

  it("removes spot verification through the trusted callable", async () => {
    const service = configure();

    await service.setSpotVerification("spot-1", null);

    expect(mockCallable).toHaveBeenCalledWith({
      spotId: "spot-1",
      organizationId: null,
    });
  });

  it("does not allow non-admin users to set verification", async () => {
    const service = configure(false);

    await expect(service.setSpotVerification("spot-1", "pkspot")).rejects.toThrow(
      "requires admin privileges"
    );
    expect(mockCallable).not.toHaveBeenCalled();
  });
});
