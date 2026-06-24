import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY } from "rxjs";
import { ExternalImage, ExternalVideo } from "../../../db/models/Media";
import { StorageService } from "../../services/firebase/storage.service";
import { MapsApiService } from "../../services/maps-api.service";
import {
  ImgCarouselComponent,
  SwiperDialogComponent,
} from "./img-carousel.component";

describe("ImgCarouselComponent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  const setScrollerBounds = (
    scroller: HTMLElement,
    clientWidth: number,
    scrollLeft: number,
  ): ReturnType<typeof vi.fn> => {
    const scrollTo = vi.fn();
    Object.defineProperty(scroller, "clientWidth", {
      configurable: true,
      value: clientWidth,
    });
    Object.defineProperty(scroller, "scrollLeft", {
      configurable: true,
      writable: true,
      value: scrollLeft,
    });
    scroller.scrollTo = scrollTo;
    return scrollTo;
  };

  it("renders external videos with an external media source link", () => {
    localStorage.setItem(
      "pkspot.showExternalMedia.v1",
      JSON.stringify({ allowAll: true, allowedDomains: [] }),
    );
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

  it("gates external media until the user allows it", () => {
    const fixture = createFixture();
    const media = new ExternalVideo(
      "https://cdn.example.com/session.mp4",
      undefined,
      { author: "Parkour Stäfa" },
      "other",
      false,
      "https://example.com/media-page",
    );

    fixture.componentRef.setInput("media", [media]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector("video")).toBeNull();
    expect(
      element.querySelector(".external-media-gate-card")?.textContent,
    ).toContain("cdn.example.com");
    expect(
      element.querySelector(".external-media-gate-card")?.textContent,
    ).toContain("Load external media from");

    element
      .querySelector<HTMLButtonElement>(".external-media-gate-button")
      ?.click();
    fixture.detectChanges();

    const storedPreference = JSON.parse(
      localStorage.getItem("pkspot.showExternalMedia.v1")!,
    );
    expect(storedPreference.allowAll).toBe(false);
    expect(storedPreference.allowedDomains).toEqual([]);
    expect(
      storedPreference.temporaryAllowedDomains["cdn.example.com"],
    ).toBeGreaterThan(Date.now());
    expect(element.querySelector("video")).not.toBeNull();
  });

  it("can always allow one external domain", () => {
    const fixture = createFixture();
    const media = new ExternalVideo("https://cdn.example.com/session.mp4");

    fixture.componentRef.setInput("media", [media]);
    fixture.detectChanges();

    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        ".external-media-gate-card button",
      ),
    );
    buttons[1].click();
    fixture.detectChanges();

    expect(
      JSON.parse(localStorage.getItem("pkspot.showExternalMedia.v1")!),
    ).toEqual({
      allowAll: false,
      allowedDomains: ["cdn.example.com"],
      temporaryAllowedDomains: {},
    });
    expect((fixture.nativeElement as HTMLElement).querySelector("video")).not.toBeNull();
  });

  it("can always allow all external domains", () => {
    const fixture = createFixture();
    const media = new ExternalVideo("https://cdn.example.com/session.mp4");

    fixture.componentRef.setInput("media", [media]);
    fixture.detectChanges();

    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        ".external-media-gate-card button",
      ),
    );
    buttons[2].click();
    fixture.detectChanges();

    expect(
      JSON.parse(localStorage.getItem("pkspot.showExternalMedia.v1")!),
    ).toEqual({
      allowAll: true,
      allowedDomains: [],
      temporaryAllowedDomains: {},
    });
    expect((fixture.nativeElement as HTMLElement).querySelector("video")).not.toBeNull();
  });

  it("does not gate local asset media", () => {
    const fixture = createFixture();
    const media = new ExternalImage("assets/events/wpf-camp-banner.jpg");

    fixture.componentRef.setInput("media", [media]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector(".external-media-gate-card")).toBeNull();
    expect(element.querySelector("img")).not.toBeNull();
    expect(element.querySelector(".external-source-link")).toBeNull();
  });

  it("does not gate first-party Firebase Storage media", () => {
    const fixture = createFixture();
    const media = new ExternalImage(
      "https://firebasestorage.googleapis.com/v0/b/parkour-base-project.appspot.com/o/event_media%2Fbanner.png?alt=media",
    );

    fixture.componentRef.setInput("media", [media]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector(".external-media-gate-card")).toBeNull();
    expect(element.querySelector("img")).not.toBeNull();
    expect(element.querySelector(".external-source-link")).toBeNull();
  });

  it("does not open blocked external media in the swiper", () => {
    const fixture = createFixture();
    const media = new ExternalVideo("https://cdn.example.com/session.mp4");
    fixture.componentRef.setInput("media", [media]);
    fixture.detectChanges();

    const dialog = TestBed.inject(MatDialog) as unknown as {
      open: ReturnType<typeof vi.fn>;
    };

    fixture.componentInstance.imageClick(0);

    expect(dialog.open).not.toHaveBeenCalled();
  });

  it("clamps right button scrolling to the visible preview track end", () => {
    const fixture = createFixture();
    fixture.componentRef.setInput("media", []);
    fixture.detectChanges();
    const scroller = (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLElement>(".carousel-scroll-layer")!;
    const scrollTo = setScrollerBounds(scroller, 300, 650);

    fixture.componentInstance.previewTrackWidth.set(1000);
    fixture.componentInstance.scrollPreview("right");

    expect(scrollTo).toHaveBeenCalledWith({
      left: 700,
      behavior: "smooth",
    });
  });

  it("clamps left button scrolling when the native scroller rubber-bands", () => {
    const fixture = createFixture();
    fixture.componentRef.setInput("media", []);
    fixture.detectChanges();
    const scroller = (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLElement>(".carousel-scroll-layer")!;
    const scrollTo = setScrollerBounds(scroller, 300, -40);

    fixture.componentInstance.previewTrackWidth.set(1000);
    fixture.componentInstance.scrollPreview("left");

    expect(scrollTo).toHaveBeenCalledWith({
      left: 0,
      behavior: "smooth",
    });
  });

  it("keeps separate gates for separate external domains", () => {
    const fixture = createFixture();
    const firstMedia = new ExternalVideo(
      "https://cdn.example.com/session.mp4",
      undefined,
      { author: "Parkour Stäfa" },
      "other",
    );
    const secondMedia = new ExternalVideo(
      "https://video.example.org/session.mp4",
      undefined,
      { author: "OMFG" },
      "other",
    );

    fixture.componentRef.setInput("media", [firstMedia, secondMedia]);
    fixture.detectChanges();

    let element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll(".external-media-gate-card").length).toBe(2);

    element
      .querySelector<HTMLButtonElement>(".external-media-gate-button")
      ?.click();
    fixture.detectChanges();

    element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll("video").length).toBe(1);
    expect(element.querySelector(".external-media-gate-card")?.textContent).toContain(
      "video.example.org",
    );
  });
});

describe("SwiperDialogComponent", () => {
  const createDialogFixture = (media: ExternalImage[]) => {
    TestBed.configureTestingModule({
      imports: [SwiperDialogComponent],
      providers: [
        {
          provide: MatDialogRef,
          useValue: {
            disableClose: false,
            close: vi.fn(),
            backdropClick: () => EMPTY,
            keydownEvents: () => EMPTY,
          },
        },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            media,
            index: 0,
            externalMediaPreference: {
              allowAll: true,
              allowedDomains: [],
            },
          },
        },
        { provide: StorageService, useValue: {} },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });

    return TestBed.createComponent(SwiperDialogComponent);
  };

  it("updates the external source link from the active swiper slide", () => {
    const fixture = createDialogFixture([
      new ExternalImage(
        "https://cdn.example.com/first.jpg",
        undefined,
        undefined,
        "other",
        false,
        "https://source.example.com/first",
      ),
      new ExternalImage(
        "https://cdn.example.com/second.jpg",
        undefined,
        undefined,
        "other",
        false,
        "https://source.example.com/second",
      ),
    ]);

    fixture.componentInstance.activeSlideIndex.set(1);

    expect(fixture.componentInstance.getActiveExternalSourceUrl()).toBe(
      "https://source.example.com/second",
    );
  });

  it("filters blocked external media out of the swiper", () => {
    const blocked = new ExternalImage("https://blocked.example.com/image.jpg");
    const local = new ExternalImage("assets/events/wpf-camp-banner.jpg");
    TestBed.configureTestingModule({
      imports: [SwiperDialogComponent],
      providers: [
        {
          provide: MatDialogRef,
          useValue: {
            disableClose: false,
            close: vi.fn(),
            backdropClick: () => EMPTY,
            keydownEvents: () => EMPTY,
          },
        },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            media: [local, blocked],
            index: 0,
            externalMediaPreference: {
              allowAll: false,
              allowedDomains: [],
            },
          },
        },
        { provide: StorageService, useValue: {} },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(SwiperDialogComponent);
    expect(fixture.componentInstance.getDialogMedia()).toEqual([local]);
  });

  it("keeps temporarily allowed external media in the swiper", () => {
    const temporaryAllowed = new ExternalImage(
      "https://temporary.example.com/image.jpg",
    );
    TestBed.configureTestingModule({
      imports: [SwiperDialogComponent],
      providers: [
        {
          provide: MatDialogRef,
          useValue: {
            disableClose: false,
            close: vi.fn(),
            backdropClick: () => EMPTY,
            keydownEvents: () => EMPTY,
          },
        },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            media: [temporaryAllowed],
            index: 0,
            externalMediaPreference: {
              allowAll: false,
              allowedDomains: [],
              temporaryAllowedDomains: {
                "temporary.example.com": Date.now() + 60 * 60 * 1000,
              },
            },
          },
        },
        { provide: StorageService, useValue: {} },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(SwiperDialogComponent);

    expect(fixture.componentInstance.getDialogMedia()).toEqual([
      temporaryAllowed,
    ]);
  });
});
