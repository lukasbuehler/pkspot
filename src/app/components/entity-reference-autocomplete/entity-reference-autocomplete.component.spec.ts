import { ComponentFixture, TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { SearchService } from "../../services/search.service";
import {
  EntityReferenceAutocompleteComponent,
  EntityReferenceOption,
} from "./entity-reference-autocomplete.component";

describe("EntityReferenceAutocompleteComponent", () => {
  let fixture: ComponentFixture<EntityReferenceAutocompleteComponent>;

  async function createComponent(kind: "spot" | "event" = "spot") {
    await TestBed.configureTestingModule({
      imports: [EntityReferenceAutocompleteComponent],
      providers: [
        {
          provide: SearchService,
          useValue: {
            searchSpots: vi.fn().mockResolvedValue({ hits: [], found: 0 }),
            searchEvents: vi.fn().mockResolvedValue([]),
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

  it("clears a selected destination", async () => {
    const component = await createComponent("event");
    const valueChange = vi.fn();
    component.valueChange.subscribe(valueChange);

    component.clearSelection();

    expect(valueChange).toHaveBeenCalledWith("");
  });
});
