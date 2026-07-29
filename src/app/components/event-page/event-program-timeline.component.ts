import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatTabsModule } from "@angular/material/tabs";
import { EventProgramItem } from "../../../db/models/Event";
import { EventCategory } from "../../../db/schemas/EventSchema";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import {
  WEATHER_STATES,
  getDailyWeatherForecastIconTone,
  getWeatherForecastIconTone,
  getWeatherStateIcon,
  type WeatherForecastIconTone,
} from "../../weather/weather-display";
import type {
  DailyWeatherPoint,
  WeatherPoint,
  WeatherResponse,
} from "../../weather/weather.models";
import {
  dailyForecastByDate,
  eventDateKey,
  forecastHourAt,
  type EventWeatherSelection,
} from "../../weather/event-weather";
import {
  WeatherIconButtonComponent,
  type WeatherIconData,
} from "../weather-icon-button/weather-icon-button.component";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import {
  effectiveProgramItem,
  eventProgramSpotRefKey,
  eventProgramSpotRefs,
  type EventSpotBinding,
} from "../../shared/event-program-spots";

interface ProgramItemView {
  item: EventProgramItem;
  start: Date;
  end?: Date;
  spots: EventSpotBinding[];
  weather?: WeatherIconData;
}

interface ProgramDayWeather {
  data: WeatherIconData;
  icon: string;
  label: string;
  tone: WeatherForecastIconTone;
}

interface ProgramDayGroup {
  key: string;
  label: string;
  items: ProgramItemView[];
  weather?: ProgramDayWeather;
}

@Component({
  selector: "app-event-program-timeline",
  imports: [
    RouterLink,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatTabsModule,
    SpotPreviewCardComponent,
    WeatherIconButtonComponent,
  ],
  template: `
    <mat-tab-group class="program-tabs" mat-stretch-tabs="false">
      @for (day of dayGroups(); track day.key) {
        <mat-tab>
          <ng-template mat-tab-label>
            <span>{{ day.label }}</span>
            @if (day.weather; as weather) {
              <mat-icon
                class="day-tab-weather"
                [class.is-wet]="weather.tone === 'wet'"
                [class.has-warning]="weather.tone === 'warning'"
                [class.is-night]="weather.tone === 'night'"
                [attr.aria-label]="weather.label"
                >{{ weather.icon }}</mat-icon
              >
            }
          </ng-template>
          <div class="program-timeline px-3">
            @if (day.weather; as weather) {
              <div class="day-weather-row">
                <app-weather-icon-button
                  [weather]="weather.data"
                  display="temperature-range"
                  (pressed)="selectDayWeather(day.key)"
                />
              </div>
            }
            @for (entry of day.items; track entry.item.id) {
              @let item = entry.item;
              <article class="program-item">
                <div class="program-rail">
                  <span class="program-dot" aria-hidden="true"></span>
                  <span class="mat-label-medium program-time">
                    {{ itemTime(entry.start) }}
                  </span>
                </div>
                <div class="program-copy">
                  <div class="program-title-row">
                    <div>
                      <h3 class="mat-title-small m-0">{{ item.title }}</h3>
                      @if (entry.end) {
                        <p class="mat-label-medium program-range">
                          {{ itemTimeRange(entry.start, entry.end) }}
                        </p>
                      }
                    </div>
                    <div class="program-side">
                      @if (entry.weather; as weather) {
                        <app-weather-icon-button
                          [weather]="weather"
                          display="temperature"
                          size="compact"
                          (pressed)="selectItemWeather(day.key, entry.start)"
                        />
                      }
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
                  @if (entry.spots.length > 0) {
                    <div class="program-spots">
                      @for (binding of entry.spots; track binding.ref.kind + ':' + binding.ref.id) {
                        <a
                          class="program-spot-link"
                          [routerLink]="eventMapRoute()"
                          [queryParams]="{
                            mapFilter: 'program',
                            day: day.key,
                            spotId: binding.ref.id,
                            programItemId: item.id,
                          }"
                        >
                          <app-spot-preview-card
                            [spotData]="binding.spot"
                            [isCompact]="true"
                            [hasBorder]="true"
                            [showInfoButton]="false"
                            [showRating]="false"
                            [imgSize]="200"
                          />
                        </a>
                      }
                    </div>
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
  private readonly _dateTime = inject(DateTimeFormatService);

  readonly items = input.required<EventProgramItem[]>();
  readonly timeZone = input<string | undefined>();
  readonly eventStart = input<Date>();
  readonly eventEnd = input<Date>();
  readonly weather = input<WeatherResponse>();
  readonly spotBindings = input<readonly EventSpotBinding[]>([]);
  readonly eventMapRoute = input.required<string[]>();
  readonly weatherSelected = output<EventWeatherSelection>();

  readonly dayGroups = computed<ProgramDayGroup[]>(() => {
    const groups = new Map<string, ProgramDayGroup>();
    const response = this.weather();
    const dailyByDate = dailyForecastByDate(response?.dailyForecast);
    const labelFormatter = this._dateTime.formatter({
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: this.timeZone(),
    });
    const bindingsByRef = new Map(
      this.spotBindings().map((binding) => [
        eventProgramSpotRefKey(binding.ref),
        binding,
      ]),
    );

    for (const item of [...this.items()].sort(
      (left, right) =>
        effectiveProgramItem(left).start.getTime() -
        effectiveProgramItem(right).start.getTime(),
    )) {
      const effective = effectiveProgramItem(item);
      const key = eventDateKey(effective.start, this.timeZone());
      const eventStart = this.eventStart();
      const eventEnd = this.eventEnd();
      const itemIsWithinEvent =
        (!eventStart || effective.start >= eventStart) &&
        (!eventEnd || effective.start <= eventEnd);
      const itemView: ProgramItemView = {
        item,
        start: effective.start,
        end: effective.end,
        spots: eventProgramSpotRefs(item).flatMap((ref) => {
          const binding = bindingsByRef.get(eventProgramSpotRefKey(ref));
          return binding ? [binding] : [];
        }),
        weather: this.hourWeatherData(
          itemIsWithinEvent
            ? forecastHourAt(response?.forecast, effective.start)
            : undefined,
        ),
      };
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(itemView);
      } else {
        groups.set(key, {
          key,
          label: labelFormatter.format(effective.start),
          items: [itemView],
          weather: this.dayWeatherData(dailyByDate.get(key)),
        });
      }
    }

    return [...groups.values()];
  });

  selectDayWeather(date: string): void {
    this.weatherSelected.emit({ date });
  }

  selectItemWeather(date: string, time: Date): void {
    this.weatherSelected.emit({ date, time });
  }

  itemTime(date: Date): string {
    return this._dateTime.format(date, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: this.timeZone(),
    });
  }

  itemTimeRange(startDate: Date, endDate?: Date): string {
    const start = this.itemTime(startDate);
    return endDate ? `${start} - ${this.itemTime(endDate)}` : start;
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

  private hourWeatherData(point: WeatherPoint | undefined): WeatherIconData | undefined {
    if (!point) return undefined;
    const condition = point.condition ?? "unknown";
    return {
      condition,
      isDay: point.isDay,
      temperatureC: point.temperatureC,
      status: this.statusFromTone(
        getWeatherForecastIconTone({
          condition,
          temperatureC: point.temperatureC,
          uvIndex: point.uvIndex,
          precipitationMm: point.precipitationMm,
          precipitationProbabilityPercent:
            point.precipitationProbabilityPercent,
          isDay: point.isDay,
        }),
      ),
    };
  }

  private dayWeatherData(
    point: DailyWeatherPoint | undefined,
  ): ProgramDayWeather | undefined {
    if (!point) return undefined;
    const condition = point.condition ?? "unknown";
    const tone = getDailyWeatherForecastIconTone({
      condition,
      temperatureC: point.maxTemperatureC,
    });
    return {
      data: {
        condition,
        minTemperatureC: point.minTemperatureC,
        maxTemperatureC: point.maxTemperatureC,
        status: this.statusFromTone(tone),
      },
      icon: getWeatherStateIcon(condition),
      label: WEATHER_STATES[condition].label,
      tone,
    };
  }

  private statusFromTone(
    tone: WeatherForecastIconTone,
  ): "neutral" | "wet" | "warning" {
    if (tone === "wet") return "wet";
    return tone === "warning" ? "warning" : "neutral";
  }
}
