import { CUSTOM_ELEMENTS_SCHEMA, LOCALE_ID, PLATFORM_ID } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { provideRouter } from "@angular/router";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatSlideToggle } from "@angular/material/slide-toggle";
import { of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import type { SpotId, SpotSchema } from "../../../db/schemas/SpotSchema";
import { SpotAccess, SpotTypes } from "../../../db/schemas/SpotTypeAndAccess";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { AnalyticsService } from "../../services/analytics.service";
import { ConsentService } from "../../services/consent.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MediaUploadStatusService } from "../../services/firebase/firestore/media-upload-status.service";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { PostsService } from "../../services/firebase/firestore/posts.service";
import { SlugsService } from "../../services/firebase/firestore/slugs.service";
import { SpotChallengesService } from "../../services/firebase/firestore/spot-challenges.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { SpotReportsService } from "../../services/firebase/firestore/spot-reports.service";
import { SpotReviewsService } from "../../services/firebase/firestore/spot-reviews.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { StorageService } from "../../services/firebase/storage.service";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import { MapsApiService } from "../../services/maps-api.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { NotificationOptInService } from "../../services/notification-opt-in.service";
import { ShareCardService } from "../../services/share-card.service";
import { StructuredDataService } from "../../services/structured-data.service";
import { WeatherService } from "../../weather/weather.service";
import { SpotAccessPickerComponent } from "../spot-access-picker/spot-access-picker.component";
import { SpotTypePickerComponent } from "../spot-type-picker/spot-type-picker.component";
import { LocaleMapEditFieldComponent } from "../locale-map-edit-field/locale-map-edit-field.component";
import { CommunityLinksComponent } from "../community-links/community-links.component";
import { EventCardComponent } from "../event-card/event-card.component";
import { ImgCarouselComponent } from "../img-carousel/img-carousel.component";
import { SpotActivitySummaryComponent } from "../spot-activity-summary/spot-activity-summary.component";
import { SpotPersonalStatsComponent } from "../spot-personal-stats/spot-personal-stats.component";
import { SpotProvenanceComponent } from "../spot-provenance/spot-provenance.component";
import { SpotRatingComponent } from "../spot-rating/spot-rating.component";
import { WeatherIconButtonComponent } from "../weather-icon-button/weather-icon-button.component";
import { SpotDetailsComponent } from "./spot-details.component";

/**
 * Pins what the Spot editor does from the outside, through the host that the
 * map embeds (`app-spot-details` in edit mode): which controls exist, what
 * each one writes into the Spot, and which outputs fire on save, discard and
 * "add bounds". The 1.2.2 editor extraction must keep every case passing
 * without editing the assertions, so the tests only use the DOM, child
 * components and the host's public inputs and outputs.
 */

const START = { lat: 47.3769, lng: 8.5417 };

function spotData(overrides: Partial<SpotSchema> = {}): SpotSchema {
  return {
    name: { en: { text: "Pinned Spot", provider: "user" } },
    description: { en: { text: "A wall and some rails.", provider: "user" } },
    location_raw: START,
    type: SpotTypes.Park,
    access: SpotAccess.Public,
    amenities: { outdoor: true, indoor: false },
    media: [],
    ...overrides,
  } as SpotSchema;
}

function existingSpot(overrides: Partial<SpotSchema> = {}): Spot {
  return new Spot("spot-1" as SpotId, spotData(overrides), "en");
}

interface Harness {
  fixture: ComponentFixture<SpotDetailsComponent>;
  host: HTMLElement;
  saved: Array<Spot | LocalSpot>;
  discarded: number;
  addBounds: number;
  dismissed: number;
  editing: boolean[];
}

const organizations = {
  getOrganizations: vi.fn(async () => [
    { id: "org-a", name: "Org A" },
    { id: "org-b", name: "Org B" },
  ]),
  setSpotManagement: vi.fn(async () => undefined),
  setSpotStewardship: vi.fn(async () => undefined),
};
const analytics = { trackEvent: vi.fn(), reportError: vi.fn() };
const snackbar = { open: vi.fn() };
const dialog = { open: vi.fn(), closeAll: vi.fn() };
let isAdmin = false;

async function render(
  spot: Spot | LocalSpot,
  inputs: Record<string, unknown> = {},
): Promise<Harness> {
  TestBed.configureTestingModule({
    imports: [SpotDetailsComponent],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      { provide: LOCALE_ID, useValue: "en" },
      { provide: PLATFORM_ID, useValue: "browser" },
      {
        provide: AuthenticationService,
        useValue: {
          get isSignedIn() {
            return true;
          },
          get user() {
            return { uid: "user-1", data: { isAdmin } };
          },
          authState$: of(null),
        },
      },
      { provide: MatDialog, useValue: dialog },
      { provide: MatSnackBar, useValue: snackbar },
      { provide: AnalyticsService, useValue: analytics },
      { provide: OrganizationsService, useValue: organizations },
      {
        provide: AgeAssuranceService,
        useValue: {
          canParticipatePublicly: () => true,
          getRestrictionMessage: () => "",
        },
      },
      { provide: ConsentService, useValue: { hasConsent: () => false } },
      {
        provide: MapsApiService,
        useValue: {
          isApiLoaded: () => false,
          loadGoogleMapsApi: vi.fn(),
          getNearbyPlacesByDistance: vi.fn(async () => []),
          autocompletePlaceSearch: vi.fn(async () => []),
        },
      },
      {
        provide: MediaUploadStatusService,
        useValue: {
          watchTarget: vi.fn(),
          processingMediaForTarget: () => [],
          failedLocalUploadsForTarget: () => [],
        },
      },
      {
        provide: SlugsService,
        useValue: {
          getAllSlugsForASpot: vi.fn(async () => []),
          addSpotSlug: vi.fn(),
        },
      },
      {
        provide: UsersService,
        useValue: { getPrivateData: () => of(null) },
      },
      {
        provide: StructuredDataService,
        useValue: {
          addStructuredData: vi.fn(),
          removeStructuredData: vi.fn(),
          generateSpotPlaceData: vi.fn(() => ({})),
        },
      },
      { provide: MetaTagService, useValue: { setSpotMetaTags: vi.fn() } },
      {
        provide: SpotReportsService,
        useValue: {
          getSpotReportsBySpotId: vi.fn(async () => []),
          getOwnSpotReport: vi.fn(async () => null),
        },
      },
      {
        provide: WeatherService,
        useValue: { getCurrentAndNearFutureForTileAt: vi.fn(async () => null) },
      },
      {
        provide: FeatureTelemetryService,
        useValue: { failure: vi.fn(), success: vi.fn() },
      },
      { provide: SpotsService, useValue: {} },
      { provide: SpotEditsService, useValue: {} },
      { provide: SpotReviewsService, useValue: {} },
      { provide: SpotChallengesService, useValue: {} },
      { provide: PostsService, useValue: {} },
      { provide: StorageService, useValue: {} },
      { provide: NotificationOptInService, useValue: {} },
      { provide: ShareCardService, useValue: { preparing: () => false } },
    ],
  });

  // The read-only view renders after a discard and before "Edit Spot". Its
  // data-loading children are out of scope here, so they render as inert tags.
  TestBed.overrideComponent(SpotDetailsComponent, {
    remove: {
      imports: [
        CommunityLinksComponent,
        EventCardComponent,
        ImgCarouselComponent,
        SpotActivitySummaryComponent,
        SpotPersonalStatsComponent,
        SpotProvenanceComponent,
        SpotRatingComponent,
        WeatherIconButtonComponent,
      ],
    },
    add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
  });

  const fixture = TestBed.createComponent(SpotDetailsComponent);
  const harness: Harness = {
    fixture,
    host: fixture.nativeElement as HTMLElement,
    saved: [],
    discarded: 0,
    addBounds: 0,
    dismissed: 0,
    editing: [],
  };
  const component = fixture.componentInstance;
  component.saveClick.subscribe((value) => harness.saved.push(value));
  component.discardClick.subscribe(() => harness.discarded++);
  component.addBoundsClick.subscribe(() => harness.addBounds++);
  component.dismiss.subscribe(() => harness.dismissed++);
  component.isEditing.subscribe((value) => harness.editing.push(value));

  fixture.componentRef.setInput("spot", spot);
  fixture.componentRef.setInput("editable", true);
  fixture.componentRef.setInput("isEditing", true);
  fixture.componentRef.setInput("liveUpdates", false);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return harness;
}

function buttons(harness: Harness, label: string): HTMLButtonElement[] {
  return Array.from(
    harness.host.querySelectorAll<HTMLButtonElement>("button"),
  ).filter((button) => button.textContent?.trim().includes(label));
}

async function click(harness: Harness, label: string): Promise<void> {
  const [button] = buttons(harness, label);
  expect(button, `button "${label}"`).toBeTruthy();
  button.click();
  await harness.fixture.whenStable();
}

/** Lets pending promises (organization saves) settle, then re-renders. */
async function settle(harness: Harness): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
  await harness.fixture.whenStable();
}

describe("Spot editor behaviour (through app-spot-details)", () => {
  beforeEach(() => {
    isAdmin = false;
    vi.clearAllMocks();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("shows the edit sections and save actions for an existing Spot", async () => {
    const harness = await render(existingSpot());
    const text = harness.host.textContent ?? "";

    expect(text).toContain("Spot Name");
    expect(text).toContain("Media");
    expect(text).toContain("Description");
    expect(text).toContain("Access and Type");
    expect(text).toContain("Features and amenities");
    expect(text).toContain("Spot URL");
    expect(text).toContain("Google Places");
    expect(text).toContain("Add bounds");
    expect(buttons(harness, "Save changes").length).toBe(2);
    expect(buttons(harness, "Discard changes").length).toBe(2);
    expect(text).not.toContain("Organization settings");
    expect(text).not.toContain("Iconic Spot");
  });

  it("writes name and description edits into the Spot", async () => {
    const spot = existingSpot();
    const harness = await render(spot);
    const [nameField, descriptionField] = harness.fixture.debugElement
      .queryAll(By.directive(LocaleMapEditFieldComponent))
      .map((debug) => debug.componentInstance as LocaleMapEditFieldComponent);

    nameField.localeMap.set({ en: { text: "Renamed Spot", provider: "user" } });
    descriptionField.localeMap.set({
      en: { text: "Now with a bar.", provider: "user" },
    });
    await harness.fixture.whenStable();

    expect(spot.names()["en"]?.text).toBe("Renamed Spot");
    expect(spot.descriptions()?.["en"]?.text).toBe("Now with a bar.");
  });

  it("writes type and access picks into the Spot", async () => {
    const spot = existingSpot();
    const harness = await render(spot);
    const access = harness.fixture.debugElement.query(
      By.directive(SpotAccessPickerComponent),
    ).componentInstance as SpotAccessPickerComponent;
    const type = harness.fixture.debugElement.query(
      By.directive(SpotTypePickerComponent),
    ).componentInstance as SpotTypePickerComponent;

    expect(access.value()).toBe(SpotAccess.Public);
    expect(type.value()).toBe(SpotTypes.Park);

    access.value.set(SpotAccess.Residential);
    type.value.set(SpotTypes.Playground);
    await harness.fixture.whenStable();

    expect(spot.access()).toBe(SpotAccess.Residential);
    expect(spot.type()).toBe(SpotTypes.Playground);
  });

  it("answers the next amenity question into the Spot", async () => {
    const spot = existingSpot({ amenities: {} });
    const harness = await render(spot);

    expect(harness.host.textContent).toContain(
      "Is this an indoor or outdoor spot?",
    );
    await click(harness, "Indoor");

    expect(spot.amenities()).toMatchObject({ indoor: true, outdoor: false });
  });

  it("toggles Street View hiding on the Spot", async () => {
    const spot = existingSpot();
    const harness = await render(spot);
    const toggle = harness.fixture.debugElement
      .queryAll(By.directive(MatSlideToggle))
      .find((debug) =>
        (debug.nativeElement as HTMLElement).textContent?.includes(
          "Hide Streetview",
        ),
      );
    expect(toggle).toBeTruthy();

    const before = spot.hideStreetview;
    (toggle!.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>("button")!
      .click();
    await harness.fixture.whenStable();

    expect(spot.hideStreetview).toBe(!before);
  });

  it("emits the same Spot instance when saving", async () => {
    const spot = existingSpot();
    const harness = await render(spot);

    await click(harness, "Save changes");
    await settle(harness);

    expect(harness.saved).toEqual([spot]);
    expect(harness.saved[0]).toBe(spot);
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "spot_edit_save_clicked",
      expect.objectContaining({ spot_id: "spot-1", is_new_spot: false }),
    );
  });

  it("disables saving while the parent is saving", async () => {
    const harness = await render(existingSpot(), { isSaving: true });

    const [save] = buttons(harness, "Saving…");
    expect(save).toBeTruthy();
    expect(save.disabled).toBe(true);
    save.click();
    await settle(harness);
    expect(harness.saved).toEqual([]);
  });

  it("discards by emitting discardClick and leaving edit mode", async () => {
    const harness = await render(existingSpot());

    await click(harness, "Discard changes");

    expect(harness.discarded).toBe(1);
    expect(harness.editing.at(-1)).toBe(false);
    expect(harness.dismissed).toBe(0);
  });

  it("asks the map to add bounds", async () => {
    const harness = await render(existingSpot());

    await click(harness, "Add bounds");

    expect(harness.addBounds).toBe(1);
  });

  it("does not offer Add bounds when the Spot already has an outline", async () => {
    const harness = await render(
      existingSpot({
        bounds_raw: [
          { lat: 47.3768, lng: 8.5416 },
          { lat: 47.3768, lng: 8.5419 },
          { lat: 47.3771, lng: 8.5419 },
        ],
      } as Partial<SpotSchema>),
    );

    expect(buttons(harness, "Add bounds")).toEqual([]);
  });

  describe("new Spots", () => {
    function newSpot(): LocalSpot {
      return new LocalSpot(
        spotData({
          name: { en: { text: "Unnamed Spot", provider: "user" } },
          description: undefined,
          type: SpotTypes.Other,
          access: SpotAccess.Other,
          amenities: {},
        }),
        "en",
      );
    }

    it("hides sections that need a saved Spot", async () => {
      const harness = await render(newSpot());
      const text = harness.host.textContent ?? "";

      expect(text).toContain("Save the spot first to add images.");
      expect(buttons(harness, "Add bounds")).toEqual([]);
      expect(buttons(harness, "Add Media")).toEqual([]);
    });

    it("only allows saving once the Spot has some content", async () => {
      const spot = newSpot();
      const harness = await render(spot);
      const [save] = buttons(harness, "Save changes");
      expect(save.disabled).toBe(true);

      spot.type.set(SpotTypes.Park);
      await harness.fixture.whenStable();
      expect(buttons(harness, "Save changes")[0].disabled).toBe(false);

      await click(harness, "Save changes");
      await settle(harness);
      expect(harness.saved).toEqual([spot]);
    });

    it("discarding also dismisses the map panel", async () => {
      const harness = await render(newSpot(), { dismissable: true });

      await click(harness, "Discard changes");

      expect(harness.discarded).toBe(1);
      expect(harness.dismissed).toBe(1);
    });
  });

  describe("admins", () => {
    beforeEach(() => {
      isAdmin = true;
    });

    async function openAsAdmin(spot: Spot): Promise<Harness> {
      const harness = await render(spot, { isEditing: false });
      await click(harness, "Edit Spot");
      await settle(harness);
      return harness;
    }

    function select(harness: Harness, label: string): HTMLSelectElement {
      const field = Array.from(
        harness.host.querySelectorAll("mat-form-field"),
      ).find((element) => element.textContent?.includes(label));
      const element = field?.querySelector("select");
      expect(element, `select "${label}"`).toBeTruthy();
      return element!;
    }

    async function choose(
      harness: Harness,
      label: string,
      value: string,
    ): Promise<void> {
      const element = select(harness, label);
      element.value = value;
      element.dispatchEvent(new Event("change"));
      await harness.fixture.whenStable();
    }

    it("shows the admin-only controls", async () => {
      const harness = await openAsAdmin(existingSpot());
      const text = harness.host.textContent ?? "";

      expect(organizations.getOrganizations).toHaveBeenCalledTimes(1);
      expect(text).toContain("Organization settings");
      expect(text).toContain("Iconic Spot");
      expect(select(harness, "Managed by").options.length).toBe(3);
    });

    it("saves an organization-only change without emitting a Spot save", async () => {
      const harness = await openAsAdmin(existingSpot());
      await choose(harness, "Managed by", "org-a");

      await click(harness, "Save changes");
      await settle(harness);

      expect(organizations.setSpotManagement).toHaveBeenCalledWith(
        "spot-1",
        "org-a",
      );
      expect(harness.saved).toEqual([]);
      expect(harness.editing.at(-1)).toBe(false);
    });

    it("adds a verifying organization without emitting a Spot save", async () => {
      const harness = await openAsAdmin(existingSpot());
      await choose(harness, "Add verifying organization", "org-b");

      await click(harness, "Save changes");
      await settle(harness);

      expect(organizations.setSpotStewardship).toHaveBeenCalledWith(
        "spot-1",
        "org-b",
        true,
      );
      expect(harness.saved).toEqual([]);
    });

    it("keeps editing and does not save the Spot when the organization save fails", async () => {
      organizations.setSpotManagement.mockRejectedValueOnce(new Error("nope"));
      const harness = await openAsAdmin(existingSpot());
      await choose(harness, "Managed by", "org-a");

      await click(harness, "Save changes");
      await settle(harness);

      expect(harness.saved).toEqual([]);
      expect(harness.editing.at(-1)).toBe(true);
    });

    it("saves the Spot normally when organizations are unchanged", async () => {
      const spot = existingSpot();
      const harness = await openAsAdmin(spot);

      await click(harness, "Save changes");
      await settle(harness);

      expect(organizations.setSpotManagement).not.toHaveBeenCalled();
      expect(harness.saved).toEqual([spot]);
    });

    it("toggles the iconic flag on the Spot", async () => {
      const spot = existingSpot();
      const harness = await openAsAdmin(spot);
      const toggle = harness.fixture.debugElement
        .queryAll(By.directive(MatSlideToggle))
        .find((debug) =>
          (debug.nativeElement as HTMLElement).textContent?.includes(
            "Iconic Spot",
          ),
        );

      (toggle!.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>("button")!
        .click();
      await harness.fixture.whenStable();

      expect(spot.isIconic).toBe(true);
    });
  });
});
