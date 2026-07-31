import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import type { Event as PkEvent, EventProgramItem } from "../../../db/models/Event";
import type {
  EventCategory,
  EventProgramItemStatus,
} from "../../../db/schemas/EventSchema";
import type { SeriesDocument } from "../../services/firebase/firestore/series.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import type {
  EventProgramOccurrence,
} from "../../shared/event-program-spots";
import type {
  EventProgramTimelineMarker,
  EventProgramTimelineSpot,
} from "../../shared/event-program-timeline";
import { EventCardComponent } from "../event-card/event-card.component";
import { MarkerComponent } from "../marker/marker.component";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import {
  WeatherIconButtonComponent,
  type WeatherIconData,
} from "../weather-icon-button/weather-icon-button.component";

export interface EventProgramTimelineEntry {
  item: EventProgramItem;
  start: Date;
  end?: Date;
  status: EventProgramItemStatus;
  note?: string;
  originalStart?: Date;
  spots: readonly EventProgramTimelineSpot[];
  markers: readonly EventProgramTimelineMarker[];
  linkedEvent?: PkEvent;
  weather?: WeatherIconData;
}

@Component({
  selector: "app-event-program-day-timeline",
  imports: [
    RouterLink,
    NgTemplateOutlet,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    EventCardComponent,
    MarkerComponent,
    SpotPreviewCardComponent,
    WeatherIconButtonComponent,
  ],
  templateUrl: "./event-program-day-timeline.component.html",
  styleUrl: "./event-program-day-timeline.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventProgramDayTimelineComponent {
  private readonly dateTime = inject(DateTimeFormatService);
  readonly entries = input.required<readonly EventProgramTimelineEntry[]>();
  readonly dayKey = input.required<string>();
  readonly timeZone = input<string>();
  readonly eventMapRoute = input<string[]>([]);
  readonly seriesById = input<Readonly<Record<string, SeriesDocument>>>({});
  readonly spotAction = input<"navigate" | "select">("navigate");
  readonly selectedItemId = input<string | null>(null);
  readonly activeItemIds = input<readonly string[]>([]);

  readonly itemWeatherSelected = output<Date>();
  readonly occurrenceSelected = output<EventProgramOccurrence>();

  itemTime(date: Date): string {
    return this.dateTime.format(date, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: this.timeZone(),
    });
  }

  itemTimeRange(startDate: Date, endDate?: Date): string {
    const start = this.itemTime(startDate);
    return endDate ? `${start} - ${this.itemTime(endDate)}` : start;
  }

  selectLocation(
    event: MouseEvent,
    occurrence: EventProgramOccurrence | undefined,
  ): void {
    event.stopPropagation();
    if (occurrence) this.occurrenceSelected.emit(occurrence);
  }

  categoryLabel(category: EventCategory): string {
    switch (category) {
      case "jam":
        return $localize`:@@event_category.jam:Jam`;
      case "competition":
        return $localize`:@@event_category.competition:Competition`;
      case "workshop":
        return $localize`:@@event_category.workshop:Workshop`;
      case "camp":
        return $localize`:@@event_category.camp:Camp`;
      case "show":
        return $localize`:@@event_category.show:Show`;
      case "awards":
        return $localize`:@@event_category.awards:Awards`;
      case "social":
        return $localize`:@@event_category.social:Social`;
      case "travel":
        return $localize`:@@event_category.travel:Travel`;
      default:
        return $localize`:@@event_category.other:Other`;
    }
  }

  categoryIcon(category: EventCategory): string {
    switch (category) {
      case "camp":
        return "camping";
      case "competition":
        return "trophy";
      case "jam":
        return "person_celebrate";
      case "workshop":
        return "groups";
      case "show":
        return "theater_comedy";
      case "awards":
        return "workspace_premium";
      case "social":
        return "diversity_3";
      case "travel":
        return "directions_bus";
      default:
        return "sell";
    }
  }

  statusLabel(status: EventProgramItemStatus): string {
    switch (status) {
      case "cancelled": return $localize`Cancelled`;
      case "delayed": return $localize`Delayed`;
      case "moved": return $localize`Moved`;
      default: return $localize`Scheduled`;
    }
  }
}
