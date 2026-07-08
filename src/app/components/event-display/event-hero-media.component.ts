import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import { Event as PkEvent } from "../../../db/models/Event";
import { eventHeroMedia, isRemoteExternalMedia } from "./event-display.helpers";
import {
  ImgCarouselComponent,
  type ImgCarouselImageFit,
} from "../img-carousel/img-carousel.component";
import { MediaPlaceholderComponent } from "../media-placeholder/media-placeholder.component";

@Component({
  selector: "app-event-hero-media",
  imports: [ImgCarouselComponent, MediaPlaceholderComponent],
  templateUrl: "./event-hero-media.component.html",
  styleUrl: "./event-hero-media.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventHeroMediaComponent {
  event = input.required<PkEvent>();
  hideExternalMedia = input(false);
  showPlaceholder = input(true);
  readonly heroMedia = computed(() => {
    const media = eventHeroMedia(this.event());
    if (!this.hideExternalMedia()) {
      return media;
    }
    return media.filter((item) => !isRemoteExternalMedia(item));
  });
  readonly imageFits = computed<readonly ImgCarouselImageFit[]>(() =>
    this.event().bannerFit === "contain" ? ["contain"] : [],
  );
  readonly imageBackgroundColors = computed(() =>
    this.event().bannerFit === "contain"
      ? [this.event().bannerAccentColor]
      : [],
  );
}
