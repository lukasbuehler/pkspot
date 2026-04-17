import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { SpotFilterMode } from "../spot-map/spot-filter-config";

/**
 * Preset filter chip definition for display.
 */
interface PresetFilterChip {
  mode: SpotFilterMode;
  urlParam: string;
  label: string;
  icon: string;
}

/**
 * Horizontally scrollable filter chips bar with preset filters
 * and a "Filters" button for custom filtering.
 */
@Component({
  selector: "app-filter-chips-bar",
  standalone: true,
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

  /** Emits when a preset filter is selected/deselected */
  filterChange = output<string>();

  /** Emits when user clicks the "Filters" button */
  filtersClick = output<void>();

  /** Emits when user clears the active filter */
  clearClick = output<void>();

  private readonly scrollArea =
    viewChild<ElementRef<HTMLDivElement>>("scrollArea");
  private readonly ngZone = inject(NgZone);

  readonly canScrollLeft = signal(false);
  readonly canScrollRight = signal(false);

  private _resizeObserver: ResizeObserver | null = null;
  private _removeScrollListener: (() => void) | null = null;

  /** Preset filter chips derived from SPOT_FILTER_CONFIGS */
  readonly presetFilters: PresetFilterChip[] = [
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

  /** Label for the filters button */
  readonly filtersLabel = $localize`:@@filters_chip_label:Filters`;
  readonly savedLabel = $localize`:@@saved_spots_chip_label:Saved`;
  readonly visitedLabel = $localize`:@@visited_spots_chip_label:Visited`;
  readonly clearLabel = $localize`:@@filter_clear:Clear`;
  readonly quickFiltersLabel = $localize`:@@quick_filters_aria_label:Quick filters`;
  readonly scrollLeftLabel = $localize`:@@filter_scroll_left:Scroll filters left`;
  readonly scrollRightLabel = $localize`:@@filter_scroll_right:Scroll filters right`;

  ngAfterViewInit(): void {
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
          this._scheduleScrollStateUpdate()
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
  }

  onPresetChipClick(value: string): void {
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
    requestAnimationFrame(() => this._updateScrollState());
  }

  private _updateScrollState(): void {
    const scrollElement = this.scrollArea()?.nativeElement;
    if (!scrollElement) {
      return;
    }

    const maxScrollLeft = Math.max(
      scrollElement.scrollWidth - scrollElement.clientWidth,
      0
    );
    const tolerance = 4;

    this.canScrollLeft.set(scrollElement.scrollLeft > tolerance);
    this.canScrollRight.set(scrollElement.scrollLeft < maxScrollLeft - tolerance);
  }
}
