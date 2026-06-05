import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { SpotFilterMode } from "../spot-map/spot-filter-config";

/**
 * Preset filter chip definition for display.
 */
export interface PresetFilterChip {
  mode?: SpotFilterMode | string;
  urlParam: string;
  label: string;
  icon?: string;
}

/**
 * Horizontally scrollable filter chips bar with preset filters
 * and a "Filters" button for custom filtering.
 */
@Component({
  selector: "app-filter-chips-bar",
  imports: [MatButtonModule, MatChipsModule, MatIconModule],
  templateUrl: "./filter-chips-bar.component.html",
  styleUrl: "./filter-chips-bar.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterChipsBarComponent implements AfterViewInit, OnDestroy {
  /** Currently selected filter value (matches urlParam) */
  selectedFilter = input("");

  /** Whether to show the saved spots chip */
  showSavedChip = input(false);

  /** Whether to show the visited spots chip */
  showVisitedChip = input(false);

  /** Whether a custom filter is currently active */
  customFilterActive = input(false);

  /** Preset chips to show. Defaults to the standard spot filters. */
  presetFilters = input<readonly PresetFilterChip[] | null>(null);

  /** Whether to show the trailing "Filters" action when no filter is active. */
  showFiltersChip = input(true);

  /** Whether to show the trailing clear chip when a filter is active. */
  showClearChip = input(true);

  /** Whether clicking the active chip clears the selection. */
  allowDeselect = input(true);

  /** Optional aria label override for non-spot filter bars. */
  ariaLabel = input<string | null>(null);

  /** Emits when a preset filter is selected/deselected */
  filterChange = output<string>();

  /** Emits when user clicks the "Filters" button */
  filtersClick = output<void>();

  /** Emits when user clears the active filter */
  clearClick = output<void>();

  private readonly scrollArea =
    viewChild<ElementRef<HTMLDivElement>>("scrollArea");
  private readonly ngZone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly canScrollLeft = signal(false);
  readonly canScrollRight = signal(false);

  private _resizeObserver: ResizeObserver | null = null;
  private _removeScrollListener: (() => void) | null = null;
  private _animationFrameId: number | null = null;
  private _deferredScrollStateUpdateId: number | null = null;

  /** Preset filter chips derived from SPOT_FILTER_CONFIGS */
  private readonly _spotPresetFilters: readonly PresetFilterChip[] = [
    {
      mode: SpotFilterMode.ForParkour,
      urlParam: "parkour",
      label: $localize`:@@for_parkour_spots_chip_label:For Parkour`,
      icon: "steps",
    },
    {
      mode: SpotFilterMode.Dry,
      urlParam: "dry",
      label: $localize`:@@dry_spots_chip_label:Dry`,
      icon: "roofing",
    },
    {
      mode: SpotFilterMode.Indoor,
      urlParam: "indoor",
      label: $localize`:@@indoor_spots_chip_label:Indoor`,
      icon: "home",
    },
    {
      mode: SpotFilterMode.Lighting,
      urlParam: "lighting",
      label: $localize`:@@lighting_spots_chip_label:Lighting`,
      icon: "lightbulb",
    },
    {
      mode: SpotFilterMode.Water,
      urlParam: "water",
      label: $localize`:@@water_spots_chip_label:Water`,
      icon: "water",
    },
  ];
  readonly visiblePresetFilters = computed(
    () => this.presetFilters() ?? this._spotPresetFilters,
  );

  /** Label for the filters button */
  readonly filtersLabel = $localize`:@@filters_chip_label:Filters`;
  readonly savedLabel = $localize`:@@saved_spots_chip_label:Saved`;
  readonly visitedLabel = $localize`:@@visited_spots_chip_label:Visited`;
  readonly clearLabel = $localize`:@@filter_clear:Clear`;
  readonly quickFiltersLabel = $localize`:@@quick_filters_aria_label:Quick filters`;
  readonly scrollLeftLabel = $localize`:@@filter_scroll_left:Scroll filters left`;
  readonly scrollRightLabel = $localize`:@@filter_scroll_right:Scroll filters right`;

  constructor() {
    effect(() => {
      const filtersKey = this.visiblePresetFilters()
        .map((filter) => `${filter.urlParam}:${filter.label}:${filter.icon}`)
        .join("|");
      const layoutKey = [
        filtersKey,
        this.selectedFilter(),
        this.showSavedChip(),
        this.showVisitedChip(),
        this.showFiltersChip(),
        this.showClearChip(),
        this.customFilterActive(),
      ].join(";");

      if (layoutKey) {
        this._scheduleScrollStateUpdateAfterRender();
      }
    });
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) {
      return;
    }

    const scrollElement = this.scrollArea()?.nativeElement;
    if (!scrollElement) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      const handleScroll = () => this._scheduleScrollStateUpdate();
      scrollElement.addEventListener("scroll", handleScroll, { passive: true });
      this._removeScrollListener = () =>
        scrollElement.removeEventListener("scroll", handleScroll);

      if (typeof ResizeObserver !== "undefined") {
        this._resizeObserver = new ResizeObserver(() =>
          this._scheduleScrollStateUpdate(),
        );
        this._resizeObserver.observe(scrollElement);
        for (const child of Array.from(scrollElement.children)) {
          this._resizeObserver.observe(child);
        }
      }
    });

    this._scheduleScrollStateUpdate();
  }

  ngOnDestroy(): void {
    this._resizeObserver?.disconnect();
    this._removeScrollListener?.();

    if (this._animationFrameId !== null) {
      window.cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    if (this._deferredScrollStateUpdateId !== null) {
      window.clearTimeout(this._deferredScrollStateUpdateId);
      this._deferredScrollStateUpdateId = null;
    }
  }

  onPresetChipClick(value: string): void {
    if (!this.allowDeselect() && this.selectedFilter() === value) {
      return;
    }

    this.filterChange.emit(this.selectedFilter() === value ? "" : value);
  }

  onFiltersClick(): void {
    this.filtersClick.emit();
  }

  onClearClick(): void {
    this.clearClick.emit();
  }

  scrollChips(direction: "left" | "right"): void {
    const scrollElement = this.scrollArea()?.nativeElement;
    if (!scrollElement) {
      return;
    }

    const distance = Math.max(scrollElement.clientWidth * 0.72, 180);
    scrollElement.scrollBy({
      left: direction === "right" ? distance : -distance,
      behavior: "smooth",
    });
  }

  private _scheduleScrollStateUpdate(): void {
    if (!this.isBrowser || this._animationFrameId !== null) {
      return;
    }

    this._animationFrameId = window.requestAnimationFrame(() => {
      this._animationFrameId = null;
      this._updateScrollState();
    });
  }

  private _scheduleScrollStateUpdateAfterRender(): void {
    if (!this.isBrowser || this._deferredScrollStateUpdateId !== null) {
      return;
    }

    this._deferredScrollStateUpdateId = window.setTimeout(() => {
      this._deferredScrollStateUpdateId = null;
      this._scheduleScrollStateUpdate();
    }, 0);
  }

  private _updateScrollState(): void {
    const scrollElement = this.scrollArea()?.nativeElement;
    if (!scrollElement) {
      return;
    }

    const maxScrollLeft = Math.max(
      scrollElement.scrollWidth - scrollElement.clientWidth,
      0,
    );
    const tolerance = 4;

    this.canScrollLeft.set(scrollElement.scrollLeft > tolerance);
    this.canScrollRight.set(
      scrollElement.scrollLeft < maxScrollLeft - tolerance,
    );
  }
}
