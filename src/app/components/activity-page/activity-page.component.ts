import {
  Component,
  inject,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  signal,
} from "@angular/core";
import { AsyncPipe, DatePipe, KeyValuePipe } from "@angular/common";
import { Router, RouterLink } from "@angular/router";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import {
  Observable,
  Subject,
  Subscription,
  combineLatest,
  of,
  from,
  BehaviorSubject,
  firstValueFrom,
} from "rxjs";
import {
  catchError,
  map,
  startWith,
  switchMap,
  takeUntil,
  tap,
} from "rxjs/operators";
import { SpotEditSchema } from "../../../db/schemas/SpotEditSchema";
import { Spot } from "../../../db/models/Spot";
import { LocaleCode } from "../../../db/models/Interfaces";
import { Timestamp } from "@angular/fire/firestore";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";

interface FeedItem {
  edit: SpotEditSchema;
  spot: Spot | null;
  spotId: string;
  formattedTimestamp: Date;
}

@Component({
  selector: "app-activity-page",
  imports: [
    AsyncPipe,
    DatePipe,
    SpotPreviewCardComponent,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    KeyValuePipe,
  ],
  templateUrl: "./activity-page.component.html",
  styleUrl: "./activity-page.component.scss",
})
export class ActivityPageComponent implements OnInit, OnDestroy {
  private _spotEditsService = inject(SpotEditsService);
  private _spotsService = inject(SpotsService);
  private _locale = inject(LOCALE_ID) as LocaleCode;
  private _router = inject(Router);

  // Feed State
  items$ = new BehaviorSubject<FeedItem[]>([]);
  newItemsBuffer$ = new BehaviorSubject<FeedItem[]>([]);
  isLoading$ = new BehaviorSubject<boolean>(false);
  hasMore$ = new BehaviorSubject<boolean>(true);

  private _lastDoc: any = null;
  private _destroyed$ = new Subject<void>();
  private _realtimeSubscription?: Subscription;

  categories = {
    all: $localize`All`,
    community: $localize`Community`,
    data: $localize`Data Imports`,
    dev_log: $localize`Dev Log`,
  };
  category =
    signal<(typeof this.categories)[keyof typeof this.categories]>("all");

  ngOnInit() {
    this.initialLoad();
  }

  ngOnDestroy() {
    this._destroyed$.next();
    this._destroyed$.complete();
    if (this._realtimeSubscription) {
      this._realtimeSubscription.unsubscribe();
    }
  }

  async initialLoad() {
    this.isLoading$.next(true);
    try {
      const result = await this._spotEditsService.getSpotEditsPage(10);
      this._lastDoc = result.lastDoc;
      this.hasMore$.next(!!result.lastDoc);

      const items = await this._enrichEditsWithSpotData(result.edits);
      this.items$.next(items);

      // Start listening for new items *after* the initial load
      // Use the timestamp of the first item (newest) as the cutoff
      // If no items, use current time
      const latestTimestamp =
        items.length > 0 ? items[0].edit.timestamp : Timestamp.now();
      this._startRealtimeListener(latestTimestamp);
    } catch (error) {
      console.error("Error loading activity feed:", error);
    } finally {
      this.isLoading$.next(false);
    }
  }

  async loadMore() {
    if (this.isLoading$.value || !this.hasMore$.value) return;

    this.isLoading$.next(true);
    try {
      const result = await this._spotEditsService.getSpotEditsPage(
        10,
        this._lastDoc
      );
      this._lastDoc = result.lastDoc;
      if (!result.lastDoc || result.edits.length === 0) {
        this.hasMore$.next(false);
      }

      const newItems = await this._enrichEditsWithSpotData(result.edits);
      const currentItems = this.items$.value;
      this.items$.next([...currentItems, ...newItems]);
    } catch (error) {
      console.error("Error loading more activities:", error);
    } finally {
      this.isLoading$.next(false);
    }
  }

  showNewItems() {
    const buffer = this.newItemsBuffer$.value;
    if (buffer.length === 0) return;

    const currentItems = this.items$.value;
    // Prepend new items
    this.items$.next([...buffer, ...currentItems]);
    // Clear buffer
    this.newItemsBuffer$.next([]);

    // Scroll to top using window scrollTo or similar mechanism if desired
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  private _startRealtimeListener(latestTimestamp: Timestamp) {
    this._realtimeSubscription = this._spotEditsService
      .getNewSpotEditsSince(latestTimestamp)
      .pipe(
        takeUntil(this._destroyed$),
        switchMap(async (edits) => {
          if (edits.length === 0) return [];
          const enriched = await this._enrichEditsWithSpotData(edits);
          return enriched;
        })
      )
      .subscribe((newItems) => {
        if (newItems.length > 0) {
          // Filter out items we might already have (duplicates) just in case
          const currentIds = new Set(
            this.items$.value.map((i) => i.edit.timestamp.toMillis() + i.spotId)
          );
          const uniqueNewItems = newItems.filter(
            (i) => !currentIds.has(i.edit.timestamp.toMillis() + i.spotId)
          );

          // Also filter against current buffer
          const bufferIds = new Set(
            this.newItemsBuffer$.value.map(
              (i) => i.edit.timestamp.toMillis() + i.spotId
            )
          );
          const trulyNewItems = uniqueNewItems.filter(
            (i) => !bufferIds.has(i.edit.timestamp.toMillis() + i.spotId)
          );

          if (trulyNewItems.length > 0) {
            // Append to buffer (newest first is how they usually come from query, but we want to prepend to feed eventually)
            // If query matches multiple, they come in descending order.
            // We merge with existing buffer.
            const currentBuffer = this.newItemsBuffer$.value;
            // Add to top of buffer
            this.newItemsBuffer$.next([...trulyNewItems, ...currentBuffer]);
          }
        }
      });
  }

  private async _enrichEditsWithSpotData(
    edits: Array<{ edit: SpotEditSchema; spotId: string }>
  ): Promise<FeedItem[]> {
    if (edits.length === 0) return [];

    const promises = edits.map(async (item) => {
      try {
        const spot = await firstValueFrom(
          this._spotsService.getSpotById$(item.spotId as any, this._locale)
        );

        return {
          edit: item.edit,
          spot: spot || null,
          spotId: item.spotId,
          formattedTimestamp: this._getJsDate(item.edit.timestamp),
        };
      } catch (err) {
        console.error(`Could not load spot ${item.spotId}`, err);
        return {
          edit: item.edit,
          spot: null,
          spotId: item.spotId,
          formattedTimestamp: this._getJsDate(item.edit.timestamp),
        };
      }
    });

    return Promise.all(promises);
  }

  private _getJsDate(timestamp: Timestamp | any): Date {
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate();
    } else if (timestamp && typeof timestamp.toDate === "function") {
      return timestamp.toDate();
    } else if (timestamp && timestamp.seconds) {
      return new Date(timestamp.seconds * 1000);
    }
    return new Date();
  }

  openSpot(spot: Spot | null) {
    if (spot) {
      this._router.navigate(["/map", spot.slug ?? spot.id]);
    }
  }

  getActionText(edit: SpotEditSchema): string {
    if (edit.type === "CREATE") {
      return "added a spot";
    } else if (edit.type === "UPDATE") {
      return "updated a spot";
    }
    return "edited a spot";
  }
}
