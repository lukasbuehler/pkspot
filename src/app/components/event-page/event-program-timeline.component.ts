import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { Event as PkEvent, EventProgramItem } from "../../../db/models/Event";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import type { WeatherResponse } from "../../weather/weather.models";
import {
  dailyForecastByDate,
  eventDateKey,
  eventProgramDayWeather,
  eventProgramHourWeather,
  forecastHourAt,
  type EventProgramDayWeather,
  type EventWeatherSelection,
} from "../../weather/event-weather";
import { WeatherIconButtonComponent } from "../weather-icon-button/weather-icon-button.component";
import {
  effectiveProgramItem,
  smartEventProgramDay,
  type EventMarkerBinding,
  type EventSpotBinding,
} from "../../shared/event-program-spots";
import { eventProgramMoment } from "../../shared/event-program-now";
import { eventProgramTimelineLocationsByItem } from "../../shared/event-program-timeline";
import type { SeriesDocument } from "../../services/firebase/firestore/series.service";
import {
  EventProgramDayTimelineComponent,
  type EventProgramTimelineEntry,
} from "../event-program-day-timeline/event-program-day-timeline.component";
import type { MarkerSchema } from "../map/markers/map-marker.model";

interface ProgramDayGroup {
  key: string;
  label: string;
  items: EventProgramTimelineEntry[];
  weather?: EventProgramDayWeather;
}

interface ProgramDaySelectionSource {
  groups: ProgramDayGroup[];
  preferredItemId: string | null;
  timeZone: string | undefined;
  now: Date;
}

@Component({
  selector: "app-event-program-timeline",
  imports: [
    MatIconModule,
    WeatherIconButtonComponent,
    EventProgramDayTimelineComponent,
  ],
  templateUrl: "./event-program-timeline.component.html",
  styleUrl: "./event-program-timeline.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventProgramTimelineComponent {
  private readonly _dateTime = inject(DateTimeFormatService);
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _tabList =
    viewChild<ElementRef<HTMLDivElement>>("tabList");
  private _tabResizeObserver?: ResizeObserver;

  readonly items = input.required<EventProgramItem[]>();
  readonly timeZone = input<string | undefined>();
  readonly eventStart = input<Date>();
  readonly eventEnd = input<Date>();
  readonly weather = input<WeatherResponse>();
  readonly spotBindings = input<readonly EventSpotBinding[]>([]);
  readonly customMarkers = input<readonly MarkerSchema[]>([]);
  readonly now = input(new Date());
  readonly linkedEventsById = input<Readonly<Record<string, PkEvent>>>({});
  readonly seriesById = input<Readonly<Record<string, SeriesDocument>>>({});
  readonly eventMapRoute = input.required<string[]>();
  readonly selectedItemId = input<string | null>(null);
  readonly weatherSelected = output<EventWeatherSelection>();
  readonly canScrollTabsLeft = signal(false);
  readonly canScrollTabsRight = signal(false);
  readonly scrollDaysLeftLabel = $localize`:@@event_program.scroll_days_left:Scroll program days left`;
  readonly scrollDaysRightLabel = $localize`:@@event_program.scroll_days_right:Scroll program days right`;

  constructor() {
    afterNextRender(() => {
      const tabList = this._tabList()?.nativeElement;
      if (!tabList || typeof ResizeObserver === "undefined") return;

      this._tabResizeObserver = new ResizeObserver(() =>
        this.updateTabScrollState(tabList),
      );
      this._tabResizeObserver.observe(tabList);
      this._destroyRef.onDestroy(() => this._tabResizeObserver?.disconnect());
    });

    afterRenderEffect(() => {
      this.dayGroups();
      this.selectedDayKey();

      const tabList = this._tabList()?.nativeElement;
      if (!tabList) return;

      this.scrollSelectedTabIntoView(tabList);
      this.updateTabScrollState(tabList);
    });
  }

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
    const markerBindings = this.customMarkers().flatMap(
      (marker): EventMarkerBinding[] =>
        marker.id
          ? [
              {
                ref: { kind: "custom_marker", id: marker.id },
                marker,
              },
            ]
          : [],
    );
    const locationsByItem = eventProgramTimelineLocationsByItem(
      this.items(),
      [...this.spotBindings(), ...markerBindings],
      [],
      this.timeZone(),
      this.now(),
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
      const locations = locationsByItem.get(item.id);
      const itemView: EventProgramTimelineEntry = {
        item,
        start: effective.start,
        end: effective.end,
        status: effective.status,
        note: item.runtimeOverride?.note,
        originalStart:
          effective.start.getTime() !== item.start.getTime()
            ? item.start
            : undefined,
        spots: locations?.spots ?? [],
        markers: locations?.markers ?? [],
        linkedEvent: item.linked_event_id
          ? this.linkedEventsById()[item.linked_event_id]
          : undefined,
        weather: eventProgramHourWeather(
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
          weather: eventProgramDayWeather(dailyByDate.get(key)),
        });
      }
    }

    return [...groups.values()];
  });
  readonly moment = computed(() => eventProgramMoment(this.items(), this.now()));
  readonly highlightedItemId = computed(
    () =>
      this.selectedItemId() ??
      this.moment().current[0]?.item.id ??
      this.moment().next[0]?.item.id ??
      null,
  );
  readonly activeItemIds = computed(() =>
    this.moment().current.map(({ item }) => item.id),
  );
  readonly selectedDayKey = linkedSignal<
    ProgramDaySelectionSource,
    string
  >({
    source: () => ({
      groups: this.dayGroups(),
      preferredItemId: this.selectedItemId(),
      timeZone: this.timeZone(),
      now: this.now(),
    }),
    computation: (source, previous) => {
      const preferredDay = source.groups.find((group) =>
        group.items.some(({ item }) => item.id === source.preferredItemId),
      )?.key;
      if (preferredDay) return preferredDay;

      const previousKey = previous?.value;
      if (
        previousKey &&
        source.groups.some((group) => group.key === previousKey)
      ) {
        return previousKey;
      }
      return smartEventProgramDay(
        source.groups.map(({ key }) => key),
        source.timeZone,
        source.now,
      );
    },
  });
  readonly selectedDay = computed(() =>
    this.dayGroups().find((day) => day.key === this.selectedDayKey()),
  );

  selectDay(dayKey: string): void {
    this.selectedDayKey.set(dayKey);
  }

  handleTabKeydown(
    event: KeyboardEvent,
    currentIndex: number,
    tabList: HTMLElement,
  ): void {
    const groups = this.dayGroups();
    if (groups.length === 0) return;

    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % groups.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + groups.length) % groups.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = groups.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.selectDay(groups[nextIndex].key);
    tabList
      .querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .item(nextIndex)
      .focus();
  }

  scrollTabsWithWheel(event: WheelEvent, tabList: HTMLElement): void {
    if (tabList.scrollWidth <= tabList.clientWidth) return;

    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (delta === 0) return;

    const previousScrollLeft = tabList.scrollLeft;
    tabList.scrollLeft += delta;
    if (tabList.scrollLeft !== previousScrollLeft) {
      event.preventDefault();
    }
  }

  scrollTabs(direction: "left" | "right"): void {
    const tabList = this._tabList()?.nativeElement;
    if (!tabList) return;

    tabList.scrollBy({
      left:
        (direction === "right" ? 1 : -1) *
        Math.max(160, tabList.clientWidth * 0.7),
      behavior: "smooth",
    });
  }

  updateTabScrollState(tabList: HTMLElement): void {
    const tolerance = 1;
    const maxScrollLeft = Math.max(
      tabList.scrollWidth - tabList.clientWidth,
      0,
    );
    this.canScrollTabsLeft.set(tabList.scrollLeft > tolerance);
    this.canScrollTabsRight.set(
      tabList.scrollLeft < maxScrollLeft - tolerance,
    );
  }

  selectDayWeather(date: string): void {
    this.weatherSelected.emit({ date });
  }

  selectItemWeather(date: string, time: Date): void {
    this.weatherSelected.emit({ date, time });
  }

  private scrollSelectedTabIntoView(tabList: HTMLElement): void {
    const selectedTab = tabList.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    );
    if (!selectedTab) return;

    const viewportLeft = tabList.scrollLeft;
    const viewportRight = viewportLeft + tabList.clientWidth;
    const tabLeft = selectedTab.offsetLeft;
    const tabRight = tabLeft + selectedTab.offsetWidth;
    const targetLeft =
      tabLeft < viewportLeft
        ? tabLeft
        : tabRight > viewportRight
          ? tabRight - tabList.clientWidth
          : null;

    if (targetLeft === null) return;
    tabList.scrollLeft = Math.max(targetLeft, 0);
  }
}
