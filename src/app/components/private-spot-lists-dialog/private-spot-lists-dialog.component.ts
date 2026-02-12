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
  public data = inject<PrivateSpotListsDialogData>(MAT_DIALOG_DATA);
  public locale: LocaleCode = inject(LOCALE_ID);

  private _spotsService = inject(SpotsService);
  private _dialogRef = inject(MatDialogRef<PrivateSpotListsDialogComponent>);

  selectedTab = signal<PrivateSpotListType>("saved");

  savedSpots = signal<Spot[]>([]);
  visitedSpots = signal<Spot[]>([]);

  isSavedLoading = signal<boolean>(false);
  isVisitedLoading = signal<boolean>(false);

  private _savedLoaded = false;
  private _visitedLoaded = false;

  ngOnInit(): void {
    const initialTab = this.data.initialTab === "visited" ? "visited" : "saved";
    this.selectedTab.set(initialTab);
    void this._ensureLoaded(initialTab);
  }

  closeDialog() {
    this._dialogRef.close();
  }

  onTabChange(event: MatTabChangeEvent) {
    const nextTab: PrivateSpotListType = event.index === 1 ? "visited" : "saved";
    this.selectedTab.set(nextTab);
    void this._ensureLoaded(nextTab);
  }

  private async _ensureLoaded(type: PrivateSpotListType): Promise<void> {
    if (type === "saved") {
      if (this._savedLoaded || this.isSavedLoading()) return;
      await this._loadSpots("saved", this.data.savedSpotIds || []);
      this._savedLoaded = true;
      return;
    }

    if (this._visitedLoaded || this.isVisitedLoading()) return;
    await this._loadSpots("visited", this.data.visitedSpotIds || []);
    this._visitedLoaded = true;
  }

  private async _loadSpots(
    type: PrivateSpotListType,
    rawSpotIds: string[]
  ): Promise<void> {
    const spotIds = Array.from(
      new Set((rawSpotIds || []).filter((id) => typeof id === "string" && id))
    );

    if (type === "saved") {
      this.isSavedLoading.set(true);
    } else {
      this.isVisitedLoading.set(true);
    }

    try {
      if (spotIds.length === 0) {
        if (type === "saved") {
          this.savedSpots.set([]);
        } else {
          this.visitedSpots.set([]);
        }
        return;
      }

      const loaded = await Promise.allSettled(
        spotIds.map((spotId) =>
          this._spotsService.getSpotById(spotId as SpotId, this.locale)
        )
      );

      const spots = loaded
        .filter((result): result is PromiseFulfilledResult<Spot> => {
          return result.status === "fulfilled";
        })
        .map((result) => result.value);

      if (type === "saved") {
        this.savedSpots.set(spots);
      } else {
        this.visitedSpots.set(spots);
      }
    } finally {
      if (type === "saved") {
        this.isSavedLoading.set(false);
      } else {
        this.isVisitedLoading.set(false);
      }
    }
  }
}
