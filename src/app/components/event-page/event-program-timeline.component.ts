import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatTabsModule } from "@angular/material/tabs";
import { EventProgramItem } from "../../../db/models/Event";
import { EventCategory } from "../../../db/schemas/EventSchema";
import { LocaleCode } from "../../../db/models/Interfaces";

type ProgramDayGroup = {
  key: string;
  label: string;
  items: EventProgramItem[];
};

@Component({
  selector: "app-event-program-timeline",
  imports: [
    RouterLink,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatTabsModule,
  ],
  template: `
    <mat-tab-group class="program-tabs" mat-stretch-tabs="false">
      @for (day of dayGroups(); track day.key) {
        <mat-tab [label]="day.label">
          <div class="program-timeline px-3">
            @for (item of day.items; track item.id) {
              <article class="program-item">
                <div class="program-rail">
                  <span class="program-dot" aria-hidden="true"></span>
                  <span class="mat-label-medium program-time">
                    {{ itemTime(item.start) }}
                  </span>
                </div>
                <div class="program-copy">
                  <div class="program-title-row">
                    <div>
                      <h3 class="mat-title-small m-0">{{ item.title }}</h3>
                      @if (item.end) {
                        <p class="mat-label-medium program-range">
                          {{ itemTimeRange(item) }}
                        </p>
                      }
                    </div>
                    <div class="program-side">
                      <mat-chip>
                        <mat-icon matChipAvatar>{{
                          categoryIcon(item.category)
                        }}</mat-icon>
                        {{ categoryLabel(item.category) }}
                      </mat-chip>
                      @if (item.linked_event_id) {
                        <a
                          mat-stroked-button
                          [routerLink]="['/events', item.linked_event_id]"
                        >
                          <mat-icon>open_in_new</mat-icon>
                          <span i18n="@@event_program.open_linked"
                            >Open event</span
                          >
                        </a>
                      }
                    </div>
                  </div>
                  @if (item.description) {
                    <p class="mat-body-small program-description">
                      {{ item.description }}
                    </p>
                  }
                  @if (
                    item.participation?.note ||
                    item.participation?.qualification_hint
                  ) {
                    <p class="mat-body-small program-description">
                      {{
                        item.participation?.note ||
                          item.participation?.qualification_hint
                      }}
                    </p>
                  }
                </div>
              </article>
            }
          </div>
        </mat-tab>
      }
    </mat-tab-group>
  `,
  styleUrl: "./event-program-timeline.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventProgramTimelineComponent {
  private _locale = inject<LocaleCode>(LOCALE_ID);

  readonly items = input.required<EventProgramItem[]>();
  readonly timeZone = input<string | undefined>();

  readonly dayGroups = computed<ProgramDayGroup[]>(() => {
    const groups = new Map<string, ProgramDayGroup>();
    const keyFormatter = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: this.timeZone(),
    });
    const labelFormatter = new Intl.DateTimeFormat(this._locale, {
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: this.timeZone(),
    });

    for (const item of [...this.items()].sort(
      (left, right) => left.start.getTime() - right.start.getTime(),
    )) {
      const key = keyFormatter.format(item.start);
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(key, {
          key,
          label: labelFormatter.format(item.start),
          items: [item],
        });
      }
    }

    return [...groups.values()];
  });

  itemTime(date: Date): string {
    return new Intl.DateTimeFormat(this._locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: this.timeZone(),
    }).format(date);
  }

  itemTimeRange(item: EventProgramItem): string {
    const start = this.itemTime(item.start);
    return item.end ? `${start} - ${this.itemTime(item.end)}` : start;
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
}
