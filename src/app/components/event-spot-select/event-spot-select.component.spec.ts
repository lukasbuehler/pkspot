import { LOCALE_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { SpotSelectionDataService } from "../../services/spot-selection-data.service";
import { EventSpotSelectComponent } from "./event-spot-select.component";

describe("EventSpotSelectComponent", () => {
  it("resolves linked Spot names and renders previews for stored and inline Spots", async () => {
    const resolve = vi.fn(async () => ({
      name: signal("Main Hall"),
      previewImageSrc: signal("https://example.com/main-hall.jpg"),
    }));
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCALE_ID, useValue: "en" },
        { provide: SpotSelectionDataService, useValue: { resolve } },
      ],
    });
    const fixture = TestBed.createComponent(EventSpotSelectComponent);
    fixture.componentRef.setInput("spotIds", ["main-hall"]);
    fixture.componentRef.setInput("inlineSpots", [
      {
        id: "temporary-park",
        name: "Temporary Park",
        images: ["https://example.com/temporary-park.jpg"],
      },
    ]);
    fixture.componentRef.setInput("valueId", "main-hall");
    fixture.componentRef.setInput("valueKind", "spot");
    fixture.detectChanges();

    await vi.waitFor(() =>
      expect(fixture.componentInstance.options()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "temporary-park", name: "Temporary Park" }),
          expect.objectContaining({ id: "main-hall", name: "Main Hall" }),
        ]),
      ),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Main Hall");
    expect(fixture.nativeElement.textContent).not.toContain("main-hall");
    expect(resolve).toHaveBeenCalledWith("main-hall", "en");
    expect(
      Array.from(fixture.nativeElement.querySelectorAll("img")).map(
        (image) => (image as HTMLImageElement).src,
      ),
    ).toContain("https://example.com/main-hall.jpg");
  });

  it("emits both the id and reference kind", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCALE_ID, useValue: "en" },
        { provide: SpotSelectionDataService, useValue: { resolve: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(EventSpotSelectComponent);
    fixture.componentRef.setInput("inlineSpots", [
      { id: "stage", name: "Main stage" },
    ]);
    fixture.detectChanges();
    const selectionChange = vi.fn();
    fixture.componentInstance.selectionChange.subscribe(selectionChange);

    fixture.componentInstance.selectionChanged("inline_spot:stage");

    expect(selectionChange).toHaveBeenCalledWith({
      id: "stage",
      kind: "inline_spot",
    });
  });
});
