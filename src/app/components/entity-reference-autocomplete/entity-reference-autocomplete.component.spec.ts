import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { provideRouter } from "@angular/router";
import { describe, expect, it, vi } from "vitest";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { SpotId } from "../../../db/schemas/SpotSchema";
import { MapsApiService } from "../../services/maps-api.service";
import { StorageService } from "../../services/firebase/storage.service";
import { SearchService } from "../../services/search.service";
import {
  EntityReferenceAutocompleteComponent,
  EntityReferenceOption,
} from "./entity-reference-autocomplete.component";

describe("EntityReferenceAutocompleteComponent", () => {
  let fixture: ComponentFixture<EntityReferenceAutocompleteComponent>;

  async function createComponent(
    kind: "spot" | "event" | "community" = "spot",
  ) {
    await TestBed.configureTestingModule({
      imports: [EntityReferenceAutocompleteComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: MapsApiService,
          useValue: {
            isStreetViewPreviewEnabled: vi.fn(() => false),
            isStreetViewPreviewAllowedAtZoom: vi.fn(() => false),
          },
        },
        { provide: StorageService, useValue: {} },
        {
          provide: SearchService,
          useValue: {
            searchSpots: vi.fn().mockResolvedValue({ hits: [], found: 0 }),
            searchEvents: vi.fn().mockResolvedValue([]),
            searchCommunities: vi.fn().mockResolvedValue([]),
            getCommunityPreviewsByKeys: vi.fn().mockResolvedValue([]),
            searchSpotPreviewsByIds: vi.fn().mockResolvedValue([]),
            getEventPreviewsByIds: vi.fn().mockResolvedValue([]),
            getSpotPreviewFromHit: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EntityReferenceAutocompleteComponent);
    fixture.componentRef.setInput("kind", kind);
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it("emits a readable spot selection as its saved reference", async () => {
    const component = await createComponent();
    const valueChange = vi.fn();
    component.valueChange.subscribe(valueChange);
    const option: EntityReferenceOption = {
      id: "spot-slug",
      label: "Central Park",
      subtitle: "Zürich",
    };

    component.selectOption({ option: { value: option } } as never);

    expect(component.selected()).toEqual(option);
    expect(valueChange).toHaveBeenCalledWith("spot-slug");
  });

  it("excludes the current Spot from autocomplete results", async () => {
    const component = await createComponent();
    fixture.componentRef.setInput("excludedIds", ["reported-id"]);
    const searchService = TestBed.inject(SearchService);
    vi.mocked(searchService.searchSpots).mockResolvedValue({
      hits: [
        {
          document: { id: "reported-id" },
          preview: {
            id: "reported-id" as SpotId,
            slug: "reported-spot",
            name: "Reported Spot",
            locality: "Basel",
            imageSrc: "",
            isIconic: false,
          },
        },
        {
          document: { id: "other-id" },
          preview: {
            id: "other-id" as SpotId,
            slug: "other-spot",
            name: "Other Spot",
            locality: "Basel",
            imageSrc: "",
            isIconic: false,
          },
        },
      ],
      found: 2,
    } as never);

    vi.useFakeTimers();
    component.searchControl.setValue("spot");
    await vi.advanceTimersByTimeAsync(251);
    vi.useRealTimers();

    expect(component.results().map((option) => option.id)).toEqual([
      "other-spot",
    ]);
  });

  it("renders a selected spot with the existing compact spot preview card", async () => {
    const component = await createComponent();
    const spotPreview = {
      id: "spot-id" as SpotId,
      slug: "spot-slug",
      name: "Central Park",
      locality: "Zürich, CH",
      imageSrc: "",
      isIconic: false,
    } satisfies SpotPreviewData;

    component.selectOption({
      option: {
        value: {
          id: "spot-slug",
          label: "Central Park",
          subtitle: "Zürich",
          spotPreview,
        },
      },
    } as never);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("app-spot-preview-card")).toBeTruthy();
  });

  it("renders a selected event with a compact event preview card", async () => {
    const component = await createComponent("event");

    component.selectOption({
      option: {
        value: {
          id: "event-slug",
          label: "Swiss Jam",
          subtitle: "Zürich",
          meta: "12 Jul 2026",
          imageSrc: "https://example.com/banner.jpg",
        },
      },
    } as never);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("app-entity-preview-card")).toBeTruthy();
  });

  it("clears a selected destination", async () => {
    const component = await createComponent("event");
    const valueChange = vi.fn();
    component.valueChange.subscribe(valueChange);

    component.clearSelection();

    expect(valueChange).toHaveBeenCalledWith("");
  });

  it("emits hierarchical community metadata for area filtering", async () => {
    const component = await createComponent("community");
    const selectionChange = vi.fn();
    component.selectionChange.subscribe(selectionChange);
    const option: EntityReferenceOption = {
      id: "locality:ch:zh:zurich",
      label: "Zurich",
      subtitle: "Zurich, Switzerland",
      communityPreview: {
        communityKey: "locality:ch:zh:zurich",
        displayName: "Zurich",
        scope: "locality",
        totalSpots: 42,
        mergedCommunityKeys: ["locality:ch:zh:zuerich"],
      },
    };

    component.selectOption({ option: { value: option } } as never);

    expect(component.fieldLabel()).toBe("Filter by area");
    expect(selectionChange).toHaveBeenCalledWith(option);
  });
});
