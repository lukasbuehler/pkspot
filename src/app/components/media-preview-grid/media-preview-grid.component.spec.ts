import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { ExternalImage, StorageImage } from "../../../db/models/Media";
import { MediaType } from "../../../db/models/Interfaces";
import { MediaPreviewGridComponent } from "./media-preview-grid.component";

const storageImage = (name: string) => new StorageImage(
  `https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/spot_pictures%2F${name}.jpg?alt=media`,
);

describe("MediaPreviewGridComponent", () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [MediaPreviewGridComponent],
    providers: [{ provide: MatDialog, useValue: { open: vi.fn() } }],
  }));

  it("uses 200px thumbnails and shows a spinner until the image loads", async () => {
    const fixture = TestBed.createComponent(MediaPreviewGridComponent);
    const media = storageImage("first");
    fixture.componentRef.setInput("media", [media]);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector("img")?.getAttribute("src")).toContain("_200x200.jpg");
    expect(element.querySelector("mat-spinner")).not.toBeNull();
    element.querySelector("img")!.dispatchEvent(new Event("load"));
    await fixture.whenStable();
    expect(element.querySelector("mat-spinner")).toBeNull();
  });

  it("keeps fallback state on the same media after reordering and stops on failure", () => {
    const fixture = TestBed.createComponent(MediaPreviewGridComponent);
    const first = storageImage("first");
    const second = storageImage("second");
    fixture.componentRef.setInput("media", [first, second]);
    fixture.componentInstance.onImageError(first);
    fixture.componentRef.setInput("media", [second, first]);
    const previews = fixture.componentInstance.mediaPreviews();
    expect(previews[0].src).toBe(second.getSrc(200));
    expect(previews[1].src).toBe(first.getOriginalSrc());
    expect(previews[1].loading).toBe(true);
    fixture.componentInstance.onImageError(first);
    expect(fixture.componentInstance.mediaPreviews()[1]).toMatchObject({loading: false, failed: true});
  });

  it("preserves media identity when an earlier item has no preview", () => {
    const fixture = TestBed.createComponent(MediaPreviewGridComponent);
    const media = storageImage("second");
    fixture.componentRef.setInput("media", [new ExternalImage(""), media]);
    expect(fixture.componentInstance.mediaPreviews()[1].media).toBe(media);
  });

  it("shows pending uploads even when there are no published images", async () => {
    const fixture = TestBed.createComponent(MediaPreviewGridComponent);
    fixture.componentRef.setInput("processingMedia", [{
      uploadId: "upload-1", targetKind: "spot", type: MediaType.Image,
      publicUrl: "https://example.test/pending.jpg", status: "processing",
    }]);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.processing-tile[aria-busy="true"]')).not.toBeNull();
    expect(element.querySelector("mat-spinner")).not.toBeNull();
    fixture.componentRef.setInput("processingMedia", []);
    await fixture.whenStable();
    expect(element.querySelector("mat-spinner")).toBeNull();
  });
});
