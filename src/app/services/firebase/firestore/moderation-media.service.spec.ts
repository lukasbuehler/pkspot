import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { SearchService } from "../../search.service";
import { ModerationMediaService } from "./moderation-media.service";
import { UsersService } from "./users.service";

describe("ModerationMediaService", () => {
  const firestore = {
    getCollection: vi.fn(),
    getDocument: vi.fn(),
  };
  const functions = {
    call: vi.fn(),
  };
  const search = {
    searchSpotPreviewsByIds: vi.fn(),
  };
  const users = {
    getUserRefernceById: vi.fn(),
  };
  let service: ModerationMediaService;

  beforeEach(() => {
    firestore.getCollection.mockReset();
    firestore.getDocument.mockReset();
    functions.call.mockReset();
    search.searchSpotPreviewsByIds.mockReset();
    search.searchSpotPreviewsByIds.mockResolvedValue([]);
    users.getUserRefernceById.mockReset();
    users.getUserRefernceById.mockResolvedValue(null);
    TestBed.configureTestingModule({
      providers: [
        ModerationMediaService,
        { provide: FirestoreAdapterService, useValue: firestore },
        { provide: FunctionsAdapterService, useValue: functions },
        { provide: SearchService, useValue: search },
        { provide: UsersService, useValue: users },
      ],
    });
    service = TestBed.inject(ModerationMediaService);
  });

  it("shows approved media and keeps flagged uploads without a public preview", async () => {
    firestore.getCollection.mockResolvedValue([
      {
        id: "approved",
        status: "approved",
        uid: "uploader",
        target_kind: "spot",
        target_id: "spot-1",
        approved_path: "spots/spot-1/image.jpg",
        approved_url: "https://storage.example/image.jpg",
        content_type: "image/jpeg",
        completed_at: { seconds: 20 },
        scan_result: {
          provider: "google-cloud-vision-safe-search",
          provider_version: "v1",
          decision: "allow",
          severity: "none",
        },
      },
      {
        id: "flagged",
        status: "needs_review",
        intake_path: "media-intake/upload/image.jpg",
        content_type: "image/jpeg",
        completed_at: { seconds: 10 },
        scan_result: {
          provider: "google-cloud-vision-safe-search",
          provider_version: "v1",
          decision: "needs_review",
          severity: "explicit_non_child",
        },
      },
    ]);
    search.searchSpotPreviewsByIds.mockResolvedValue([
      {
        id: "spot-1",
        slug: "test-spot",
        name: "Test Spot",
        locality: "Zurich",
        imageSrc: "https://storage.example/spot.jpg",
        isIconic: false,
      },
    ]);
    users.getUserRefernceById.mockResolvedValue({
      uid: "uploader",
      display_name: "Uploader",
      profile_picture: "https://storage.example/profile.jpg",
    });

    const result = await service.getUploadStream();

    expect(result).toEqual([
      expect.objectContaining({
        id: "approved",
        isApproved: true,
        publicUrl: "https://storage.example/image.jpg",
        uploaderUid: "uploader",
        uploader: {
          uid: "uploader",
          display_name: "Uploader",
          profile_picture: "https://storage.example/profile.jpg",
        },
        spotPreview: expect.objectContaining({
          id: "spot-1",
          slug: "test-spot",
        }),
      }),
      expect.objectContaining({
        id: "flagged",
        isApproved: false,
        publicUrl: undefined,
        storagePath: "media-intake/upload/image.jpg",
        canReveal: true,
        canMarkSafe: true,
      }),
    ]);
    expect(search.searchSpotPreviewsByIds).toHaveBeenCalledWith(["spot-1"]);
    expect(users.getUserRefernceById).toHaveBeenCalledWith("uploader");
  });

  it("keeps stable ID fallbacks when referenced entities are unavailable", async () => {
    firestore.getCollection.mockResolvedValue([
      {
        id: "missing-references",
        status: "approved",
        uid: "deleted-user",
        target_kind: "spot",
        target_id: "deleted-spot",
        approved_url: "https://storage.example/image.jpg",
      },
    ]);

    const [result] = await service.getUploadStream();

    expect(result.uploader).toEqual({ uid: "deleted-user" });
    expect(result.spotPreview).toBeUndefined();
    expect(result.targetId).toBe("deleted-spot");
  });

  it("never permits preview or release for reportable-match media", async () => {
    firestore.getCollection.mockResolvedValue([
      {
        id: "restricted",
        status: "blocked",
        intake_path: "media_intake/user/restricted/restricted.jpg",
        content_type: "image/jpeg",
        scan_result: {
          provider: "known-hash-provider",
          provider_version: "v1",
          decision: "reportable_match",
          severity: "known_csam_match",
        },
      },
    ]);

    const [result] = await service.getUploadStream();

    expect(result).toEqual(
      expect.objectContaining({
        isRestricted: true,
        canReveal: false,
        canMarkSafe: false,
      }),
    );
  });

  it("uses admin callables for short-lived previews and manual release", async () => {
    functions.call
      .mockResolvedValueOnce({ url: "https://storage.example/signed-preview" })
      .mockResolvedValueOnce({ ok: true });

    await expect(service.getQuarantinedPreview("review-1")).resolves.toBe(
      "https://storage.example/signed-preview",
    );
    await expect(service.markSafe("review-1")).resolves.toBeUndefined();

    expect(functions.call).toHaveBeenNthCalledWith(
      1,
      "getModerationMediaPreview",
      { review_id: "review-1" },
    );
    expect(functions.call).toHaveBeenNthCalledWith(
      2,
      "markMediaUploadSafe",
      { review_id: "review-1" },
    );
  });

  it("loads a linked review directly even when it is outside the latest uploads", async () => {
    firestore.getDocument.mockResolvedValue({
      status: "needs_review",
      intake_path: "media_intake/uploader/old-review/image.jpg",
      content_type: "image/jpeg",
    });

    expect(await service.getReview("old-review")).toEqual([
      expect.objectContaining({ id: "old-review", canMarkSafe: true }),
    ]);
    expect(firestore.getDocument).toHaveBeenCalledWith("media_upload_reviews/old-review");
    expect(firestore.getCollection).not.toHaveBeenCalled();
  });

  it("returns an empty review for missing or invalid links", async () => {
    firestore.getDocument.mockResolvedValue(null);
    expect(await service.getReview("missing-review")).toEqual([]);
    firestore.getDocument.mockClear();
    expect(await service.getReview("../users/someone")).toEqual([]);
    expect(await service.getReview("")).toEqual([]);
    expect(firestore.getDocument).not.toHaveBeenCalled();
  });

  it("describes legacy racy flags accurately without changing stored evidence", async () => {
    firestore.getCollection.mockResolvedValue([{
      id: "legacy", status: "needs_review", scan_result: {
        provider: "google_vision_safe_search", severity: "explicit_non_child",
        decision: "block", labels: { adult: "UNLIKELY", racy: "LIKELY" },
      },
    }]);
    const [review] = await service.getUploadStream();
    expect(review.statusLabel).toBe("Needs review");
    expect(review.safetyLabel).toBe("Potentially suggestive content");
    expect(review.provider).toBe("Google Vision SafeSearch");
    expect(review.labelEntries).toContainEqual({ name: "Suggestive content", value: "Likely" });
    expect(review.canMarkFalsePositive).toBe(true);
    expect(review.canEscalate).toBe(true);
  });

  it("prevents normal review actions on dismissed or escalated media", async () => {
    firestore.getCollection.mockResolvedValue([
      { id: "dismissed", status: "dismissed" },
      { id: "incident", status: "needs_review", incident_path: "safety_incidents/one" },
    ]);
    const reviews = await service.getUploadStream();
    for (const review of reviews) {
      expect(review.canReveal).toBe(false);
      expect(review.canMarkSafe).toBe(false);
      expect(review.canMarkFalsePositive).toBe(false);
    }
    expect(reviews[0].isFalsePositive).toBe(true);
    expect(reviews[1].canEscalate).toBe(true);
  });

  it("uses distinct callables for non-publishing decisions and incident escalation", async () => {
    functions.call.mockResolvedValue({ incident_path: "safety_incidents/one" });
    await service.markFalsePositive("review-1");
    expect(await service.createIncident("review-1")).toBe("safety_incidents/one");
    expect(functions.call).toHaveBeenCalledWith("markMediaUploadFalsePositive", { review_id: "review-1" });
    expect(functions.call).toHaveBeenCalledWith("createSafetyIncident", { report_path: "reports/scanner_review-1" });
    expect(functions.call).not.toHaveBeenCalledWith("markMediaUploadSafe", expect.anything());
  });
});
