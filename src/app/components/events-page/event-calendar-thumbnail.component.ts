import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import type { EventDiscoveryItem } from "../../services/search.service";
import { eventImageDisplaySrc } from "../event-display/event-display.helpers";

@Component({
  selector: "app-event-calendar-thumbnail",
  imports: [MatIconModule],
  templateUrl: "./event-calendar-thumbnail.component.html",
  styleUrl: "./event-calendar-thumbnail.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCalendarThumbnailComponent {
  readonly event = input.required<EventDiscoveryItem>();

  readonly logoSrc = computed(() => {
    const event = this.event();
    return eventImageDisplaySrc(event.sponsorLogoSrc ?? event.logoSrc);
  });
  readonly logoFit = computed(() => {
    const event = this.event();
    return event.sponsorLogoSrc
      ? (event.sponsorLogoFit ?? "contain")
      : (event.logoFit ?? "contain");
  });
  readonly backgroundColor = computed(() => {
    const event = this.event();
    return event.sponsorLogoSrc
      ? event.sponsorLogoBackgroundColor
      : event.logoBackgroundColor;
  });
}
