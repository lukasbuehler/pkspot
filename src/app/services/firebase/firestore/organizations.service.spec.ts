import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { OrganizationsService } from "./organizations.service";

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
  let mockFunctionsAdapter: { call: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFunctionsAdapter = {
      call: vi.fn().mockResolvedValue({ ok: true }),
    };
  });

  function configure(isAdmin = true): OrganizationsService {
    TestBed.configureTestingModule({
      providers: [
        OrganizationsService,
        { provide: FirestoreAdapterService, useValue: createMockFirestoreAdapter() },
        { provide: AuthenticationService, useValue: createMockAuthService(isAdmin) },
        { provide: FunctionsAdapterService, useValue: mockFunctionsAdapter },
      ],
    });

    return TestBed.inject(OrganizationsService);
  }

  it("preserves logo background color in embedded organization references", () => {
    const service = configure();

    expect(
      service.makeReference({
        id: "pkspot",
        name: "PK Spot",
        slug: "pkspot",
        logo_url: "https://example.com/logo.svg",
        logo_background_color: "transparent",
        active: true,
      })
    ).toEqual({
      id: "pkspot",
      name: "PK Spot",
      slug: "pkspot",
      logo_url: "https://example.com/logo.svg",
      logo_background_color: "transparent",
    });
  });

  it("loads stewarded spots from the organization-owned verified index first", async () => {
    const adapter = createMockFirestoreAdapter();
    adapter.getCollection
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    TestBed.configureTestingModule({
      providers: [
        OrganizationsService,
        { provide: FirestoreAdapterService, useValue: adapter },
        { provide: AuthenticationService, useValue: createMockAuthService(true) },
        { provide: FunctionsAdapterService, useValue: mockFunctionsAdapter },
      ],
    });
    const service = TestBed.inject(OrganizationsService);

    await service.getStewardedSpots("pkspot");

    expect(adapter.getCollection).toHaveBeenNthCalledWith(
      1,
      "organizations/pkspot/verified_spots"
    );
    expect(adapter.getCollection).toHaveBeenNthCalledWith(
      2,
      "spots",
      [
        {
          fieldPath: "stewardship.organization_ids",
          opStr: "array-contains",
          value: "pkspot",
        },
      ],
      [{ type: "limit", limit: 24 }]
    );
  });

  it("loads used spots from the organization-owned used index", async () => {
    const adapter = createMockFirestoreAdapter();
    adapter.getCollection.mockResolvedValueOnce([]);
    TestBed.configureTestingModule({
      providers: [
        OrganizationsService,
        { provide: FirestoreAdapterService, useValue: adapter },
        { provide: AuthenticationService, useValue: createMockAuthService(true) },
        { provide: FunctionsAdapterService, useValue: mockFunctionsAdapter },
      ],
    });
    const service = TestBed.inject(OrganizationsService);

    await service.getUsedSpots("pkspot");

    expect(adapter.getCollection).toHaveBeenCalledWith(
      "organizations/pkspot/used_spots"
    );
  });

  it("sets spot stewardship through the trusted callable", async () => {
    const service = configure();

    await service.setSpotStewardship("spot-1", "pkspot");

    expect(mockFunctionsAdapter.call).toHaveBeenCalledWith(
      "setSpotOrganizationRelationship",
      {
        spotId: "spot-1",
        organizationId: "pkspot",
        relationship: "steward",
        enabled: true,
      }
    );
  });

  it("sets one managing organization through the trusted callable", async () => {
    const service = configure();

    await service.setSpotManagement("spot-1", "venue-org");

    expect(mockFunctionsAdapter.call).toHaveBeenCalledWith(
      "setSpotOrganizationRelationship",
      {
        spotId: "spot-1",
        organizationId: "venue-org",
        relationship: "manager",
        enabled: true,
      }
    );
  });

  it("sets organization used spots through the trusted callable", async () => {
    const service = configure();

    await service.setOrganizationUsedSpot("pkspot", "spot-1");

    expect(mockFunctionsAdapter.call).toHaveBeenCalledWith(
      "setSpotOrganizationRelationship",
      {
        spotId: "spot-1",
        organizationId: "pkspot",
        relationship: "used",
        enabled: true,
      }
    );
  });

  it("adds a member using the target user's stored profile", async () => {
    const adapter = createMockFirestoreAdapter();
    adapter.getDocument.mockResolvedValue({
      display_name: "World Parkour Owner",
      profile_picture: "profile-picture-path",
    });
    TestBed.configureTestingModule({
      providers: [
        OrganizationsService,
        { provide: FirestoreAdapterService, useValue: adapter },
        { provide: AuthenticationService, useValue: createMockAuthService(true) },
        { provide: FunctionsAdapterService, useValue: mockFunctionsAdapter },
      ],
    });
    const service = TestBed.inject(OrganizationsService);

    await service.upsertMemberByUserId("wpf", "owner-user", "owner");

    expect(adapter.getDocument).toHaveBeenCalledWith("users/owner-user");
    expect(adapter.setDocument).toHaveBeenCalledWith(
      "organizations/wpf/members/owner-user",
      expect.objectContaining({
        role: "owner",
        user: {
          uid: "owner-user",
          display_name: "World Parkour Owner",
          profile_picture: "profile-picture-path",
        },
      })
    );
  });

  it("does not allow non-admin users to set organization relationships", async () => {
    const service = configure(false);

    await expect(
      service.setSpotStewardship("spot-1", "pkspot")
    ).rejects.toThrow("requires admin privileges");
    expect(mockFunctionsAdapter.call).not.toHaveBeenCalled();
  });
});
