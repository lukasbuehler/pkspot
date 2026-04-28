import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { Spot } from "../../../db/models/Spot";
import { LocaleCode } from "../../../db/models/Interfaces";
import { SpotEditSchema } from "../../../db/schemas/SpotEditSchema";
import { SpotId } from "../../../db/schemas/SpotSchema";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotEditSummaryComponent } from "../spot-edit-summary/spot-edit-summary.component";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";

type UserActivityItem = {
  type: "edit";
  editId?: string;
  edit: SpotEditSchema;
  spot: Spot | null;
  spotId: string;
  formattedTimestamp: Date;
};

@Component({
  selector: "app-user-activity",
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    SpotEditSummaryComponent,
    SpotPreviewCardComponent,
  ],
  templateUrl: "./user-activity.component.html",
  styleUrl: "./user-activity.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserActivityComponent implements OnDestroy {
  userId = input<string>("");
  displayName = input<string>("");

  private readonly _spotEditsService = inject(SpotEditsService);
  private readonly _spotsService = inject(SpotsService);
  private readonly _locale = inject(LOCALE_ID) as LocaleCode;
  private readonly _pageSize = 5;
  private readonly _spotCache = new Map<string, Promise<Spot | null>>();

  private _lastDoc: unknown = null;
  private _loadVersion = 0;

  readonly items = signal<UserActivityItem[]>([]);
  readonly isLoading = signal(false);
  readonly hasMore = signal(false);
  readonly loadError = signal(false);
  readonly sectionLabel = computed(() => {
    const name = this.displayName().trim();
    return name
      ? $localize`:@@user-activity.title.named:${name}'s activity`
      : $localize`:@@user-activity.title:Activity`;
  });

  constructor() {
    effect(() => {
      const userId = this.userId().trim();
      this._reset();
      if (userId) {
        void this._loadInitial(userId);
      }
    });
  }

  ngOnDestroy(): void {
    this._loadVersion++;
    this._spotCache.clear();
  }

  async loadMore(): Promise<void> {
    const userId = this.userId().trim();
    if (!userId || this.isLoading() || !this.hasMore()) {
      return;
    }

    const version = this._loadVersion;
    this.isLoading.set(true);
    this.loadError.set(false);

    try {
      const result = await this._spotEditsService.getSpotEditsPageByUserId(
        userId,
        this._pageSize,
        this._lastDoc
      );
      if (version !== this._loadVersion) {
        return;
      }

      this._lastDoc = result.lastDoc;
      this.hasMore.set(!!result.lastDoc && result.edits.length > 0);

      const newItems = await this._enrichEditsWithSpotData(result.edits);
      if (version !== this._loadVersion) {
        return;
      }

      this.items.update((currentItems) =>
        this._sortItems([...currentItems, ...newItems])
      );
    } catch (error) {
      if (version === this._loadVersion) {
        console.error("Error loading more user activity:", error);
        this.loadError.set(true);
      }
    } finally {
      if (version === this._loadVersion) {
        this.isLoading.set(false);
      }
    }
  }

  itemKey(item: UserActivityItem): string {
    if (item.editId) {
      return `${item.spotId}_${item.editId}`;
    }
    return `${item.spotId}_${this._getTimestampMs(item.edit)}_${item.edit.type}_${item.edit.user.uid}`;
  }

  getActionText(edit: SpotEditSchema): string {
    if (edit.type === "CREATE") {
      return $localize`:@@user-activity.action.added-spot:Added a spot`;
    }
    if (
      edit.type === "UPDATE" &&
      edit.data &&
      Object.prototype.hasOwnProperty.call(edit.data, "media")
    ) {
      const media = edit.data.media;
      if (Array.isArray(media) && media.length === 0) {
        return $localize`:@@user-activity.action.removed-media:Removed spot media`;
      }
      return $localize`:@@user-activity.action.added-media:Added media to a spot`;
    }
    if (edit.type === "UPDATE") {
      return $localize`:@@user-activity.action.updated-spot:Updated a spot`;
    }
    return $localize`:@@user-activity.action.edited-spot:Edited a spot`;
  }

  private async _loadInitial(userId: string): Promise<void> {
    const version = this._loadVersion;
    this.isLoading.set(true);
    this.loadError.set(false);

    try {
      const result = await this._spotEditsService.getSpotEditsPageByUserId(
        userId,
        this._pageSize
      );
      if (version !== this._loadVersion) {
        return;
      }

      this._lastDoc = result.lastDoc;
      this.hasMore.set(!!result.lastDoc && result.edits.length > 0);

      const items = await this._enrichEditsWithSpotData(result.edits);
      if (version !== this._loadVersion) {
        return;
      }

      this.items.set(this._sortItems(items));
    } catch (error) {
      if (version === this._loadVersion) {
        console.error("Error loading user activity:", error);
        this.loadError.set(true);
      }
    } finally {
      if (version === this._loadVersion) {
        this.isLoading.set(false);
      }
    }
  }

  private _reset(): void {
    this._loadVersion++;
    this._lastDoc = null;
    this._spotCache.clear();
    this.items.set([]);
    this.hasMore.set(false);
    this.isLoading.set(false);
    this.loadError.set(false);
  }

  private async _enrichEditsWithSpotData(
    edits: Array<{ edit: SpotEditSchema; spotId: string }>
  ): Promise<UserActivityItem[]> {
    const items = await Promise.all(
      edits.map(async (item) => {
        const spot = await this._getSpotWithCache(item.spotId);
        return {
          type: "edit" as const,
          editId: (item.edit as SpotEditSchema & { id?: string }).id,
          edit: item.edit,
          spot,
          spotId: item.spotId,
          formattedTimestamp: this._getJsDate(item.edit),
        };
      })
    );

    return items;
  }

  private _getSpotWithCache(spotId: string): Promise<Spot | null> {
    const cached = this._spotCache.get(spotId);
    if (cached) {
      return cached;
    }

    const request = this._spotsService
      .getSpotById(spotId as SpotId, this._locale)
      .then((spot) => spot ?? null)
      .catch((error) => {
        this._spotCache.delete(spotId);
        console.error(`Could not load spot ${spotId}`, error);
        return null;
      });

    this._spotCache.set(spotId, request);
    return request;
  }

  private _sortItems(items: UserActivityItem[]): UserActivityItem[] {
    return [...items].sort((a, b) => {
      const timeDiff = this._getTimestampMs(b.edit) - this._getTimestampMs(a.edit);
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return this.itemKey(a).localeCompare(this.itemKey(b));
    });
  }

  private _getJsDate(editOrTimestamp: SpotEditSchema | unknown): Date {
    const rawMs = this._getRawMs(editOrTimestamp);
    const timestamp = this._getTimestampValue(editOrTimestamp);

    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (this._hasToDate(timestamp)) {
      return timestamp.toDate();
    }
    if (this._hasSeconds(timestamp)) {
      return new Date(timestamp.seconds * 1000);
    }
    if (typeof rawMs === "number" && Number.isFinite(rawMs)) {
      return new Date(rawMs);
    }
    return new Date();
  }

  private _getTimestampMs(editOrTimestamp: SpotEditSchema | unknown): number {
    const rawMs = this._getRawMs(editOrTimestamp);
    const timestamp = this._getTimestampValue(editOrTimestamp);

    if (timestamp instanceof Date) {
      return timestamp.getTime();
    }
    if (this._hasToMillis(timestamp)) {
      return timestamp.toMillis();
    }
    if (this._hasSeconds(timestamp)) {
      return timestamp.seconds * 1000;
    }
    if (typeof rawMs === "number" && Number.isFinite(rawMs)) {
      return rawMs;
    }
    return 0;
  }

  private _getRawMs(value: unknown): number | undefined {
    if (this._isRecord(value) && "timestamp_raw_ms" in value) {
      const rawMs = Number(value["timestamp_raw_ms"]);
      return Number.isFinite(rawMs) ? rawMs : undefined;
    }
    return undefined;
  }

  private _getTimestampValue(value: unknown): unknown {
    if (this._isRecord(value) && "timestamp" in value) {
      return value["timestamp"];
    }
    return value;
  }

  private _hasToDate(value: unknown): value is { toDate: () => Date } {
    return this._isRecord(value) && typeof value["toDate"] === "function";
  }

  private _hasToMillis(value: unknown): value is { toMillis: () => number } {
    return this._isRecord(value) && typeof value["toMillis"] === "function";
  }

  private _hasSeconds(value: unknown): value is { seconds: number } {
    return this._isRecord(value) && typeof value["seconds"] === "number";
  }

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
