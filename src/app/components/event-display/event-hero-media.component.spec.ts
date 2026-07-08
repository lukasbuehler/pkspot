import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { describe, expect, it } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { AnyMedia } from "../../../db/models/Media";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { ImgCarouselImageFit } from "../img-carousel/img-carousel.component";
import { EventHeroMediaComponent } from "./event-hero-media.component";

@Component({
  selector: "app-img-carousel",
  template: "",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ImgCarouselStubComponent {
  media = input<AnyMedia[] | undefined>();
  reportContext = input<"spot" | "event" | "media">("media");
  reportTargetId = input<string | undefined>();
  imageFits = input<readonly ImgCarouselImageFit[]>([]);
  imageBackgroundColors = input<readonly (string | undefined)[]>([]);
}

@Component({
  selector: "app-media-placeholder",
  template: "",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class MediaPlaceholderStubComponent {
  src = input<string | null>("assets/spot_placeholder.png");
  label = input<string | null>(null);
  variant = input<"spot" | "event">("spot");
}

const buildEvent = (extra: Partial<EventSchema> = {}): PkEvent =>
  new PkEvent("preview-event" as EventId, {
    name: "Preview Event",
    slug: "preview-event",
    venue_string: "Test Venue",
    locality_string: "Zurich, Switzerland",
    start: "2026-08-05T10:00:00.000Z",
    end: "2026-08-06T10:00:00.000Z",
    bounds: {
      north: 47.4,
      south: 47.3,
      east: 8.6,
      west: 8.5,
    },
    ...extra,
  } as unknown as EventSchema);

const createFixture = (
  event: PkEvent,
): ComponentFixture<EventHeroMediaComponent> => {
  TestBed.overrideComponent(EventHeroMediaComponent, {
    set: {
      imports: [ImgCarouselStubComponent, MediaPlaceholderStubComponent],
    },
  });
  const fixture = TestBed.createComponent(EventHeroMediaComponent);
  fixture.componentRef.setInput("event", event);
  return fixture;
};

describe("EventHeroMediaComponent", () => {
  it("hides remote external media when requested", () => {
    const fixture = createFixture(
      buildEvent({
        banner_src: "assets/events/wpf-camp-banner.jpg",
        media: [
          {
            src: "https://worlds.example.com/session.jpg",
            type: "image",
            isInStorage: false,
          },
          {
            src: "https://worlds.example.com/session.mp4",
            type: "video",
            isInStorage: false,
          },
        ],
      }),
    );
    fixture.componentRef.setInput("hideExternalMedia", true);
    fixture.detectChanges();

    const carousel = fixture.debugElement.query(
      By.directive(ImgCarouselStubComponent),
    ).componentInstance as ImgCarouselStubComponent;

    expect(carousel.media()?.map((media) => media.getPreviewImageSrc())).toEqual(
      ["assets/events/wpf-camp-banner.jpg"],
    );
  });

  it("keeps first-party Firebase Storage media when external media is hidden", () => {
    const firebaseStorageUrl =
      "https://firebasestorage.googleapis.com/v0/b/parkour-base-project.appspot.com/o/event_media%2Fbanner.png?alt=media";
    const fixture = createFixture(
      buildEvent({
        banner_src: firebaseStorageUrl,
        media: [
          {
            src: "https://worlds.example.com/session.jpg",
            type: "image",
            isInStorage: false,
          },
        ],
      }),
    );
    fixture.componentRef.setInput("hideExternalMedia", true);
    fixture.detectChanges();

    const carousel = fixture.debugElement.query(
      By.directive(ImgCarouselStubComponent),
    ).componentInstance as ImgCarouselStubComponent;

    expect(carousel.media()?.map((media) => media.getPreviewImageSrc())).toEqual(
      [
        "https://firebasestorage.googleapis.com/v0/b/parkour-base-project.appspot.com/o/event_media%2Fbanner_400x400.png?alt=media",
      ],
    );
  });

  it("keeps remote external media on the full event hero by default", () => {
    const fixture = createFixture(
      buildEvent({
        media: [
          {
            src: "https://worlds.example.com/session.jpg",
            type: "image",
            isInStorage: false,
          },
        ],
      }),
    );
    fixture.detectChanges();

    const carousel = fixture.debugElement.query(
      By.directive(ImgCarouselStubComponent),
    ).componentInstance as ImgCarouselStubComponent;

    expect(carousel.media()?.map((media) => media.getPreviewImageSrc())).toEqual(
      ["https://worlds.example.com/session.jpg"],
    );
  });

  it("uses the event placeholder when no hero media is available", () => {
    const fixture = createFixture(buildEvent());
    fixture.detectChanges();

    const placeholder = fixture.debugElement.query(
      By.directive(MediaPlaceholderStubComponent),
    ).componentInstance as MediaPlaceholderStubComponent;

    expect(placeholder.src()).toBeNull();
    expect(placeholder.variant()).toBe("event");
    expect(placeholder.label()).toBe("Preview Event");
  });

  it("can suppress the placeholder when no hero media is available", () => {
    const fixture = createFixture(buildEvent());
    fixture.componentRef.setInput("showPlaceholder", false);
    fixture.detectChanges();

    expect(
      fixture.debugElement.query(By.directive(MediaPlaceholderStubComponent)),
    ).toBeNull();
  });
});
