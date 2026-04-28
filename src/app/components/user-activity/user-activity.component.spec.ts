import { Component, input } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpotEditSchema } from "../../../db/schemas/SpotEditSchema";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotEditSummaryComponent } from "../spot-edit-summary/spot-edit-summary.component";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import { UserActivityComponent } from "./user-activity.component";

@Component({
  selector: "app-spot-preview-card",
  template: `<div class="spot-preview-stub">Spot preview</div>`,
})
class StubSpotPreviewCardComponent {
  spotData = input<unknown>(null);
  clickable = input(false);
  imgSize = input(200);
  isCompact = input(false);
}

@Component({
  selector: "app-spot-edit-summary",
  template: `<div class="edit-summary-stub">Edit summary</div>`,
})
class StubSpotEditSummaryComponent {
  edit = input<unknown>(null);
  compact = input(false);
}

const createMockSpotEditsService = () => ({
  getSpotEditsPageByUserId: vi.fn(),
});

const createMockSpotsService = () => ({
  getSpotById: vi.fn(),
});

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const buildEdit = (
  id: string,
  timestampRawMs: number,
  type: SpotEditSchema["type"] = "UPDATE"
): SpotEditSchema & { id: string } => ({
  id,
  type,
  timestamp: {
    seconds: Math.floor(timestampRawMs / 1000),
    nanoseconds: 0,
  } as SpotEditSchema["timestamp"],
  timestamp_raw_ms: timestampRawMs,
  user: {
    uid: "user-1",
    display_name: "Avery",
  },
  data: {
    name: { en: `Edit ${id}` },
  },
});

describe("UserActivityComponent", () => {
  let fixture: ComponentFixture<UserActivityComponent>;
  let mockSpotEditsService: ReturnType<typeof createMockSpotEditsService>;
  let mockSpotsService: ReturnType<typeof createMockSpotsService>;

  beforeEach(() => {
    mockSpotEditsService = createMockSpotEditsService();
    mockSpotsService = createMockSpotsService();
    mockSpotsService.getSpotById.mockResolvedValue({
      id: "spot-a",
      slug: "spot-alpha",
    });

    TestBed.configureTestingModule({
      imports: [UserActivityComponent],
      providers: [
        provideRouter([]),
        { provide: SpotEditsService, useValue: mockSpotEditsService },
        { provide: SpotsService, useValue: mockSpotsService },
      ],
    });

    TestBed.overrideComponent(UserActivityComponent, {
      remove: {
        imports: [SpotPreviewCardComponent, SpotEditSummaryComponent],
      },
      add: {
        imports: [StubSpotPreviewCardComponent, StubSpotEditSummaryComponent],
      },
    });
  });

  const createComponent = () => {
    fixture = TestBed.createComponent(UserActivityComponent);
    fixture.componentRef.setInput("userId", "user-1");
    fixture.componentRef.setInput("displayName", "Avery");
    return fixture;
  };

  it("shows a loading state while the first page is pending", () => {
    mockSpotEditsService.getSpotEditsPageByUserId.mockReturnValue(
      new Promise(() => undefined)
    );

    createComponent();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Loading activity");
  });

  it("shows an empty state when the user has no public edits", async () => {
    mockSpotEditsService.getSpotEditsPageByUserId.mockResolvedValue({
      edits: [],
      lastDoc: null,
    });

    createComponent();
    fixture.detectChanges();
    await flushPromises();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("No public edits yet");
  });

  it("renders edit activity and a load more action when another page exists", async () => {
    mockSpotEditsService.getSpotEditsPageByUserId.mockResolvedValue({
      edits: [{ edit: buildEdit("edit-a", 2_000), spotId: "spot-a" }],
      lastDoc: { id: "cursor" },
    });

    createComponent();
    fixture.detectChanges();
    await flushPromises();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain("Avery's activity");
    expect(text).toContain("Updated a spot");
    expect(text).toContain("Spot preview");
    expect(text).toContain("Edit summary");
    expect(text).toContain("Load more");
  });

  it("appends the next page after clicking load more", async () => {
    mockSpotEditsService.getSpotEditsPageByUserId
      .mockResolvedValueOnce({
        edits: [{ edit: buildEdit("edit-a", 2_000), spotId: "spot-a" }],
        lastDoc: { id: "cursor" },
      })
      .mockResolvedValueOnce({
        edits: [{ edit: buildEdit("edit-b", 1_000), spotId: "spot-b" }],
        lastDoc: null,
      });

    createComponent();
    fixture.detectChanges();
    await flushPromises();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector("button");
    button.click();
    await flushPromises();
    fixture.detectChanges();

    expect(mockSpotEditsService.getSpotEditsPageByUserId).toHaveBeenLastCalledWith(
      "user-1",
      5,
      { id: "cursor" }
    );
    expect(fixture.nativeElement.querySelectorAll(".edit-summary-stub").length).toBe(
      2
    );
    expect(fixture.nativeElement.textContent).not.toContain("Load more");
  });
});
