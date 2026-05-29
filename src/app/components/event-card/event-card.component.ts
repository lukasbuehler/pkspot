import { NgOptimizedImage, NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { LocaleCode } from "../../../db/models/Interfaces";
import { Event as PkEvent } from "../../../db/models/Event";
import { MediaPlaceholderComponent } from "../media-placeholder/media-placeholder.component";
import { EventRsvpComponent } from "../event-rsvp/event-rsvp.component";
import { MatTooltip } from "@angular/material/tooltip";
import { formatDateRange } from "../../../scripts/Helpers";
import {
  eventStatusLabel,
  type EventStatus,
} from "../event-display/event-display.helpers";

@Component({
  selector: "app-event-card",
  imports: [
    NgOptimizedImage,
    NgTemplateOutlet,
    MatCardModule,
    MatIconModule,
    RouterLink,
    MediaPlaceholderComponent,
    EventRsvpComponent,
    MatTooltip,
  ],
  templateUrl: "./event-card.component.html",
  styleUrl: "./event-card.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCardComponent {
  private _locale = inject<LocaleCode>(LOCALE_ID);

  event = input.required<PkEvent>();
  selectMode = input(false);
  select = output<PkEvent>();

  readonly status = computed<EventStatus>(() => this.event().status());
  readonly dateRange = computed(() => {
    const event = this.event();
    return formatDateRange(event.start, event.end, this._locale, "long");
  });
  readonly route = computed(() => [
    "/events",
    this.event().slug ?? this.event().id,
  ]);
  readonly statusLabel = computed(() =>
    eventStatusLabel(this.event(), this.status(), this._locale),
  );

  onSelect(): void {
    this.select.emit(this.event());
  }
}
