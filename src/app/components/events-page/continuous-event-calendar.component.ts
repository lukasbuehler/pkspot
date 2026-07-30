import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  LOCALE_ID,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  resource,
  signal,
  viewChild,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import type { EventCategory } from "../../../db/schemas/EventSchema";
import type { SeriesDocument } from "../../services/firebase/firestore/series.service";
import type {
  EventDiscoverySearchResult,
  EventDiscoveryItem,
} from "../../services/search.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import {
  calendarWeekdayLabels,
  eventLocalDateKey,
  isMonthKey,
} from "./event-calendar.model";
import {
  appendCalendarMonths,
  buildContinuousEventCalendar,
  calendarMonthsAround,
  prependCalendarMonths,
} from "./continuous-event-calendar.model";
import { EventCalendarItemComponent } from "./event-calendar-item.component";
import { EventCalendarThumbnailComponent } from "./event-calendar-thumbnail.component";
import { EventDiscoveryListComponent } from "./event-discovery-list.component";

export interface ContinuousEventCalendarLoadRequest {
  query: string;
  areaKeys: string[];
  categories: EventCategory[];
  seriesIds: string[];
  startsBeforeSeconds: number;
  endsAfterSeconds: number;
  abortSignal: AbortSignal;
}

export type ContinuousEventCalendarLoader = (
  request: ContinuousEventCalendarLoadRequest,
) => Promise<EventDiscoverySearchResult>;

const MONTH_LOAD_BATCH_SIZE = 2;
const SCROLL_LOAD_THRESHOLD_PX = 480;

@Component({
  selector: "app-continuous-event-calendar",
  imports: [
    MatButtonModule,
    MatIconModule,
    EventCalendarItemComponent,
    EventCalendarThumbnailComponent,
    EventDiscoveryListComponent,
  ],
  templateUrl: "./continuous-event-calendar.component.html",
  styleUrl: "./continuous-event-calendar.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContinuousEventCalendarComponent {
  private readonly _locale = inject(LOCALE_ID);
  private readonly _dateTime = inject(DateTimeFormatService);
  private readonly _scrollViewport =
    viewChild.required<ElementRef<HTMLDivElement>>("scrollViewport");
  private _expandingWindow = false;

  readonly anchorMonth = input.required<string>();
  readonly selectedDay = input("");
  readonly wide = input(false);
  readonly query = input("");
  readonly areaKeys = input<readonly string[]>([]);
  readonly categories = input<readonly EventCategory[]>([]);
  readonly seriesIds = input<readonly string[]>([]);
  readonly seriesById = input<Record<string, SeriesDocument>>({});
  readonly loadEvents = input.required<ContinuousEventCalendarLoader>();

  readonly daySelected = output<string>();
  readonly dateJumped = output<string>();

  readonly now = signal(new Date());
  readonly monthKeys = linkedSignal(() =>
    calendarMonthsAround(this.anchorMonth()),
  );
  readonly queryCalendar = computed(() =>
    buildContinuousEventCalendar(
      this.monthKeys(),
      this._locale,
      [],
      this.now(),
    ),
  );
  readonly eventsResource = resource({
    params: () => ({
      loader: this.loadEvents(),
      query: this.query(),
      areaKeys: [...this.areaKeys()],
      categories: [...this.categories()],
      seriesIds: [...this.seriesIds()],
      startsBeforeSeconds: this.queryCalendar().queryEndSeconds,
      endsAfterSeconds: this.queryCalendar().queryStartSeconds,
    }),
    loader: ({ params, abortSignal }) =>
      params.loader({
        query: params.query,
        areaKeys: params.areaKeys,
        categories: params.categories,
        seriesIds: params.seriesIds,
        startsBeforeSeconds: params.startsBeforeSeconds,
        endsAfterSeconds: params.endsAfterSeconds,
        abortSignal,
      }),
  });
  readonly discoveryResult = linkedSignal({
    source: () => this.eventsResource.value(),
    computation: (result, previous): EventDiscoverySearchResult | null =>
      result ?? previous?.value ?? null,
  });
  readonly events = computed<readonly EventDiscoveryItem[]>(
    () => this.discoveryResult()?.items ?? [],
  );
  readonly calendar = computed(() =>
    buildContinuousEventCalendar(
      this.monthKeys(),
      this._locale,
      this.events(),
      this.now(),
    ),
  );
  readonly weekdayLabels = calendarWeekdayLabels(this._locale);
  readonly monthLabels = computed(() =>
    Object.fromEntries(
      this.calendar()
        .days.filter((day) => day.dayNumber === 1)
        .map((day) => [
          day.key,
          this._dateTime.format(day.date, {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }),
        ]),
    ),
  );
  readonly dayAriaLabels = computed(() =>
    Object.fromEntries(
      this.calendar().days.map((day) => [
        day.key,
        `${this._dateTime.format(day.date, {
          dateStyle: "full",
          timeZone: "UTC",
        })}, ${this._eventCountLabel(day.events.length)}`,
      ]),
    ),
  );
  readonly selectedDayModel = computed(
    () =>
      this.calendar().days.find((day) => day.key === this.selectedDay()) ??
      null,
  );
  readonly selectedDayLabel = computed(() => {
    const day = this.selectedDayModel();
    return day
      ? this._dateTime.format(day.date, {
          dateStyle: "full",
          timeZone: "UTC",
        })
      : "";
  });
  readonly dateJumpValue = computed(
    () =>
      this.selectedDay() ||
      eventLocalDateKey(
        this.now(),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
  );

  constructor() {
    afterRenderEffect(() => {
      this._scheduleScrollToDay(this.dateJumpValue(), this.wide());
    });
  }

  onScroll(event: Event): void {
    if (this._expandingWindow) return;
    const viewport = event.currentTarget;
    if (!(viewport instanceof HTMLDivElement)) return;

    if (viewport.scrollTop < SCROLL_LOAD_THRESHOLD_PX) {
      this._prependMonths(viewport);
      return;
    }

    const remaining =
      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
    if (remaining < SCROLL_LOAD_THRESHOLD_PX) {
      this._appendMonths();
    }
  }

  jumpToToday(): void {
    const day = eventLocalDateKey(
      new Date(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    this._jumpToDate(day);
  }

  jumpFromInput(event: Event): void {
    const value =
      event.target instanceof HTMLInputElement ? event.target.value : "";
    if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) this._jumpToDate(value);
  }

  private _jumpToDate(day: string): void {
    const month = day.slice(0, 7);
    if (!isMonthKey(month)) return;
    this.monthKeys.set(calendarMonthsAround(month));
    this.dateJumped.emit(day);
    this._scheduleScrollToDay(day);
  }

  private _prependMonths(viewport: HTMLDivElement): void {
    this._expandingWindow = true;
    const previousHeight = viewport.scrollHeight;
    this.monthKeys.update((months) =>
      prependCalendarMonths(months, MONTH_LOAD_BATCH_SIZE),
    );
    requestAnimationFrame(() => {
      viewport.scrollTop += viewport.scrollHeight - previousHeight;
      this._expandingWindow = false;
    });
  }

  private _appendMonths(): void {
    this._expandingWindow = true;
    this.monthKeys.update((months) =>
      appendCalendarMonths(months, MONTH_LOAD_BATCH_SIZE),
    );
    requestAnimationFrame(() => {
      this._expandingWindow = false;
    });
  }

  private _scheduleScrollToDay(day: string, wideLayout = false): void {
    const scroll = () =>
      requestAnimationFrame(() => {
        const viewport = this._scrollViewport().nativeElement;
        const target = viewport.querySelector<HTMLElement>(
          `[data-day="${day}"]`,
        );
        if (!target) return;

        const targetTop =
          target.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top +
          viewport.scrollTop;
        viewport.scrollTop = Math.max(0, targetTop - 24);
      });

    if (wideLayout) requestAnimationFrame(scroll);
    else scroll();
  }

  private _eventCountLabel(count: number): string {
    return count === 1
      ? $localize`:@@events.count_one:1 event`
      : $localize`:@@events.count_many:${count}:eventCount: events`;
  }
}
