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

type EventStatus = "upcoming" | "live" | "past";

@Component({
  selector: "app-event-card",
  imports: [
    NgOptimizedImage,
    NgTemplateOutlet,
    MatCardModule,
    MatIconModule,
    RouterLink,
    MediaPlaceholderComponent,
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
    const start = event.start.toLocaleDateString(this._locale, {
      dateStyle: "full",
    });
    const end = event.end.toLocaleDateString(this._locale, {
      dateStyle: "full",
    });
    return start === end ? start : `${start} - ${end}`;
  });
  readonly route = computed(() => [
    "/events",
    this.event().slug ?? this.event().id,
  ]);
  readonly statusLabel = computed(() => {
    const event = this.event();
    const status = this.status();
    if (status === "past") {
      return $localize`:@@events.status.past:Past event`;
    }

    const target = status === "live" ? event.end : event.start;
    const relative = this._relativeFromNow(target);
    if (status === "live") {
      return $localize`:@@events.status.live_with_end:Ongoing — ends ${relative}`;
    }
    return $localize`:@@events.status.upcoming_starts:Starts ${relative}`;
  });

  onSelect(): void {
    this.select.emit(this.event());
  }

  private _relativeFromNow(target: Date): string {
    const diffMs = target.getTime() - Date.now();
    const absMs = Math.abs(diffMs);
    const minutes = Math.round(absMs / 60_000);
    const hours = Math.round(absMs / 3_600_000);
    const days = Math.round(absMs / 86_400_000);

    if (days >= 2) return $localize`:@@events.in_n_days:in ${days} days`;
    if (hours >= 2) return $localize`:@@events.in_n_hours:in ${hours} hours`;
    if (minutes >= 2) {
      return $localize`:@@events.in_n_minutes:in ${minutes} minutes`;
    }
    return $localize`:@@events.soon:soon`;
  }
}
