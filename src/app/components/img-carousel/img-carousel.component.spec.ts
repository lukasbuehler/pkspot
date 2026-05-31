import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { describe, expect, it, vi } from "vitest";
import { ExternalVideo } from "../../../db/models/Media";
import { StorageService } from "../../services/firebase/storage.service";
import { MapsApiService } from "../../services/maps-api.service";
import { ImgCarouselComponent } from "./img-carousel.component";

describe("ImgCarouselComponent", () => {
  const createFixture = (): ComponentFixture<ImgCarouselComponent> => {
    TestBed.configureTestingModule({
      imports: [ImgCarouselComponent],
      providers: [
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: StorageService, useValue: {} },
        { provide: MapsApiService, useValue: {} },
      ],
    });

    return TestBed.createComponent(ImgCarouselComponent);
  };

  it("renders external videos with an external media source link", () => {
    const fixture = createFixture();
    const media = new ExternalVideo(
      "https://cdn.example.com/session.mp4",
      undefined,
      undefined,
      "other",
      false,
      "https://example.com/media-page",
    );

    fixture.componentRef.setInput("media", [media]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const video = element.querySelector("video");
    const sourceLink = element.querySelector<HTMLAnchorElement>(
      ".external-source-link",
    );

    expect(video?.getAttribute("src")).toBe(
      "https://cdn.example.com/session.mp4",
    );
    expect(video?.muted).toBe(true);
    expect(video?.hasAttribute("loop")).toBe(true);
    expect(sourceLink?.href).toBe("https://example.com/media-page");
    expect(sourceLink?.textContent).toContain("External media");
    expect(
      element.querySelector<HTMLButtonElement>(".video-mute-button"),
    ).not.toBeNull();
  });
});
