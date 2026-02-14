import { Component, LOCALE_ID, OnInit, inject, signal } from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatButton } from "@angular/material/button";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { MatTabChangeEvent, MatTabsModule } from "@angular/material/tabs";
import { RouterLink } from "@angular/router";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { LocaleCode } from "../../../db/models/Interfaces";
import { Spot } from "../../../db/models/Spot";
import { SpotId } from "../../../db/schemas/SpotSchema";

type PrivateSpotListType = "saved" | "visited";

export interface PrivateSpotListsDialogData {
  savedSpotIds: string[];
  visitedSpotIds: string[];
  initialTab?: PrivateSpotListType;
}

@Component({
  selector: "app-private-spot-lists-dialog",
  templateUrl: "./private-spot-lists-dialog.component.html",
  styleUrls: ["./private-spot-lists-dialog.component.scss"],
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButton,
    MatProgressSpinner,
    MatTabsModule,
    RouterLink,
    SpotPreviewCardComponent,
  ],
})
export class PrivateSpotListsDialogComponent implements OnInit {
  private readonly _pageSize = 12;

  public data = inject<PrivateSpotListsDialogData>(MAT_DIALOG_DATA);
  public locale: LocaleCode = inject(LOCALE_ID);

  private _spotsService = inject(SpotsService);
  private _dialogRef = inject(MatDialogRef<PrivateSpotListsDialogComponent>);

  selectedTab = signal<PrivateSpotListType>("saved");
  savedPageIndex = signal<number>(0);
  visitedPageIndex = signal<number>(0);

  savedSpots = signal<Spot[]>([]);
  visitedSpots = signal<Spot[]>([]);

  isSavedLoading = signal<boolean>(false);
  isVisitedLoading = signal<boolean>(false);

  savedSpotIdsCount = 0;
  visitedSpotIdsCount = 0;

  private _savedSpotIds: SpotId[] = [];
  private _visitedSpotIds: SpotId[] = [];

  private _savedPagesCache = new Map<number, Spot[]>();
  private _visitedPagesCache = new Map<number, Spot[]>();

  private _savedLoadToken = 0;
  private _visitedLoadToken = 0;

  ngOnInit(): void {
    this._savedSpotIds = this._normalizeSpotIds(this.data.savedSpotIds || []);
    this._visitedSpotIds = this._normalizeSpotIds(
      this.data.visitedSpotIds || []
    );
    this.savedSpotIdsCount = this._savedSpotIds.length;
    this.visitedSpotIdsCount = this._visitedSpotIds.length;

    const initialTab = this.data.initialTab === "visited" ? "visited" : "saved";
    this.selectedTab.set(initialTab);
    void this._ensureCurrentPageLoaded(initialTab);
  }

  closeDialog() {
    this._dialogRef.close();
  }

  onTabChange(event: MatTabChangeEvent) {
    const nextTab: PrivateSpotListType = event.index === 1 ? "visited" : "saved";
    this.selectedTab.set(nextTab);
    void this._ensureCurrentPageLoaded(nextTab);
  }

  getTotalPages(type: PrivateSpotListType): number {
    const count =
      type === "saved" ? this.savedSpotIdsCount : this.visitedSpotIdsCount;
    return count > 0 ? Math.ceil(count / this._pageSize) : 0;
  }

  getPageLabel(type: PrivateSpotListType): string {
    const totalPages = this.getTotalPages(type);
    if (totalPages === 0) {
      return "0 / 0";
    }

    return `${this._getCurrentPageIndex(type) + 1} / ${totalPages}`;
  }

  canGoToPreviousPage(type: PrivateSpotListType): boolean {
    return this._getCurrentPageIndex(type) > 0;
  }

  canGoToNextPage(type: PrivateSpotListType): boolean {
    return this._getCurrentPageIndex(type) + 1 < this.getTotalPages(type);
  }

  previousPage(type: PrivateSpotListType) {
    if (!this.canGoToPreviousPage(type)) {
      return;
    }

    if (type === "saved") {
      this.savedPageIndex.update((value) => value - 1);
    } else {
      this.visitedPageIndex.update((value) => value - 1);
    }

    void this._ensureCurrentPageLoaded(type);
  }

  nextPage(type: PrivateSpotListType) {
    if (!this.canGoToNextPage(type)) {
      return;
    }

    if (type === "saved") {
      this.savedPageIndex.update((value) => value + 1);
    } else {
      this.visitedPageIndex.update((value) => value + 1);
    }

    void this._ensureCurrentPageLoaded(type);
  }

  private _normalizeSpotIds(rawSpotIds: string[]): SpotId[] {
    const filtered = (rawSpotIds || []).filter(
      (id): id is SpotId => typeof id === "string" && !!id
    );
    const seen = new Set<SpotId>();
    const newestFirst: SpotId[] = [];

    // Iterate from the end so newest items (last in private_data arrays) come first.
    for (let i = filtered.length - 1; i >= 0; i -= 1) {
      const spotId = filtered[i];
      if (!seen.has(spotId)) {
        seen.add(spotId);
        newestFirst.push(spotId);
      }
    }

    return newestFirst;
  }

  private _getCurrentPageIndex(type: PrivateSpotListType): number {
    return type === "saved" ? this.savedPageIndex() : this.visitedPageIndex();
  }

  private _getSpotIds(type: PrivateSpotListType): SpotId[] {
    return type === "saved" ? this._savedSpotIds : this._visitedSpotIds;
  }

  private _getPageCache(type: PrivateSpotListType): Map<number, Spot[]> {
    return type === "saved" ? this._savedPagesCache : this._visitedPagesCache;
  }

  private _setLoading(type: PrivateSpotListType, loading: boolean) {
    if (type === "saved") {
      this.isSavedLoading.set(loading);
    } else {
      this.isVisitedLoading.set(loading);
    }
  }

  private _setSpots(type: PrivateSpotListType, spots: Spot[]) {
    if (type === "saved") {
      this.savedSpots.set(spots);
    } else {
      this.visitedSpots.set(spots);
    }
  }

  private async _ensureCurrentPageLoaded(type: PrivateSpotListType): Promise<void> {
    const pageIndex = this._getCurrentPageIndex(type);
    const pageCache = this._getPageCache(type);
    const cachedPage = pageCache.get(pageIndex);

    if (cachedPage) {
      this._setSpots(type, cachedPage);
      return;
    }

    const spotIds = this._getSpotIds(type);
    const pageStart = pageIndex * this._pageSize;
    const pageSpotIds = spotIds.slice(pageStart, pageStart + this._pageSize);
    await this._loadSpotsPage(type, pageIndex, pageSpotIds);
  }

  private async _loadSpotsPage(
    type: PrivateSpotListType,
    pageIndex: number,
    pageSpotIds: SpotId[]
  ): Promise<void> {
    const loadToken =
      type === "saved" ? ++this._savedLoadToken : ++this._visitedLoadToken;
    this._setLoading(type, true);

    try {
      if (pageSpotIds.length === 0) {
        this._getPageCache(type).set(pageIndex, []);
        this._setSpots(type, []);
        return;
      }

      const loaded = await Promise.allSettled(
        pageSpotIds.map((spotId) => this._spotsService.getSpotById(spotId, this.locale))
      );

      const isLatestToken =
        type === "saved"
          ? loadToken === this._savedLoadToken
          : loadToken === this._visitedLoadToken;
      if (!isLatestToken) {
        return;
      }

      const spots = loaded
        .filter((result): result is PromiseFulfilledResult<Spot> => {
          return result.status === "fulfilled";
        })
        .map((result) => result.value);
      this._getPageCache(type).set(pageIndex, spots);
      this._setSpots(type, spots);
    } finally {
      const isLatestToken =
        type === "saved"
          ? loadToken === this._savedLoadToken
          : loadToken === this._visitedLoadToken;
      if (isLatestToken) {
        this._setLoading(type, false);
      }
    }
  }
}
