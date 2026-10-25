import { Injector } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExternalImage } from "../../../db/models/Media";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import type { CreateSpotSubmissionRequest } from "../../../db/schemas/SpotCreationSchema";
import type { SpotEditDataSchema, SpotEditSchema } from "../../../db/schemas/SpotEditSchema";
import type { SpotSchema } from "../../../db/schemas/SpotSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { ConsentService } from "../../services/consent.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { FirestoreAdapterService } from "../../services/firebase/firestore-adapter.service";
import { FunctionsAdapterService } from "../../services/firebase/functions-adapter.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { OsmDataService } from "../../services/osm-data.service";
import { PlatformService } from "../../services/platform.service";
import { SearchService } from "../../services/search.service";
import { SpotMapDataManager } from "./SpotMapDataManager";

// Exhaustive against the editable schema: new read-model fields must not silently
// become writable just because the model starts returning them from data().
const editableFields: Record<keyof SpotEditDataSchema, true> = {
  name: true, location: true, location_raw: true, description: true, media: true,
  external_references: true, type: true, access: true, amenities: true,
  bounds: true, bounds_raw: true, slug: true, hide_streetview: true, is_iconic: true,
};

function expectEditablePayload(data: SpotEditDataSchema): void {
  expect(Object.keys(data).filter((key) => !Object.hasOwn(editableFields, key))).toEqual([]);
  expect(data).not.toHaveProperty("recent_activity_min_30d");
}

function initialData(): SpotSchema {
  return {
    name: { en: "Regression Spot" },
    location_raw: { lat: 47.3769, lng: 8.5417 },
    type: "other",
    access: "public",
    media: [],
  };
}

function editDraft(spot: LocalSpot): void {
  // The same model operations used by the Spot form and map polygon editor.
  spot.setName("Edited Spot", "en");
  spot.setDescription("Updated description", "en");
  spot.location.set({ lat: 47.377, lng: 8.542 });
  spot.amenities.set({ lit: true });
  spot.userMedia.set([new ExternalImage("https://example.test/photo.jpg")]);
  spot.paths.set([[{ lat: 47.377, lng: 8.542 }, { lat: 47.378, lng: 8.542 },
    { lat: 47.377, lng: 8.543 }]]);
}

describe("Spot save payload contracts", () => {
  let manager: SpotMapDataManager;
  const call = vi.fn(async (_name: string, _request: CreateSpotSubmissionRequest) => ({
    spotId: "created-spot", editId: "create-edit",
  }));
  const addDocument = vi.fn(async (_path: string, _edit: SpotEditSchema) => "update-edit");

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [
      SpotEditsService,
      { provide: FirestoreAdapterService, useValue: {
        getDocument: vi.fn().mockResolvedValue(null), addDocument,
      } },
      { provide: FunctionsAdapterService, useValue: { call } },
      { provide: AuthenticationService, useValue: {
        isSignedIn: true, user: { uid: "user-1" },
      } },
      { provide: UsersService, useValue: {
        getUserByIdOnce: vi.fn().mockResolvedValue(null),
        getUserRefernceById: vi.fn().mockResolvedValue(null),
      } },
      { provide: ConsentService, useValue: { hasConsent: () => false } },
      { provide: AnalyticsService, useValue: {} },
      { provide: PlatformService, useValue: { getPlatform: () => "web" } },
      { provide: SpotsService, useValue: {} },
      { provide: OsmDataService, useValue: {} },
      { provide: SearchService, useValue: {} },
    ] });
    // Keep the real save manager and edit service; mock only external boundaries.
    manager = new SpotMapDataManager("en", TestBed.inject(Injector));
  });

  it.each(["untouched", "edited", "cloned"] as const)(
    "creates a draft in the %s state with only editable fields",
    async (state) => {
      let draft = new LocalSpot(initialData(), "en");
      if (state !== "untouched") editDraft(draft);
      if (state === "cloned") draft = draft.clone();
      // This field exists before the user interacts with the form.
      expect(draft.data()).toHaveProperty("recent_activity_min_30d", null);
      await manager.saveSpot(draft);
      const payload = call.mock.calls[0][1];
      expect(payload.submissionId).toBe(draft.creationSubmissionId);
      expectEditablePayload(payload.data);
      expect(payload.data.location_raw).toEqual(draft.location());
      if (state !== "untouched") {
        expect(payload.data.media).toHaveLength(1);
        expect(payload.data.bounds).toHaveLength(3);
      }
    },
  );

  it("retries a failed creation after more editing and cloning", async () => {
    const draft = new LocalSpot(initialData(), "en");
    call.mockRejectedValueOnce(new Error("Temporary network failure"));
    await expect(manager.saveSpot(draft)).rejects.toThrow("Temporary network failure");
    editDraft(draft);
    const retry = draft.clone();
    await expect(manager.saveSpot(retry)).resolves.toMatchObject({spotId: "created-spot"});
    expect(call).toHaveBeenCalledTimes(2);
    for (const [, payload] of call.mock.calls) {
      expect(payload.submissionId).toBe(draft.creationSubmissionId);
      expectEditablePayload(payload.data);
    }
  });

  it.each(["unchanged activity", "refreshed activity", "no original snapshot"] as const)(
    "updates an edited existing Spot with %s",
    async (state) => {
      const original = new Spot("existing-spot", {
        ...initialData(), recent_activity_min_30d: 5,
      }, "en");
      const draft = original.clone();
      if (state === "refreshed activity") {
        draft.applyFromSchema({ ...draft.data(), recent_activity_min_30d: 25 });
      }
      editDraft(draft);
      await manager.saveSpot(draft, state === "no original snapshot" ? undefined : original);
      expect(addDocument).toHaveBeenCalledTimes(1);
      const [path, edit] = addDocument.mock.calls[0];
      expect(path).toBe("spots/existing-spot/edits");
      expectEditablePayload(edit.data);
      expect(edit.data.media).toHaveLength(1);
      expect(draft.recent_activity_min_30d).toBe(state === "refreshed activity" ? 25 : 5);
    },
  );
});
