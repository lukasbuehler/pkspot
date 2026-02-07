import { Component, inject, LOCALE_ID } from "@angular/core";
import { AsyncPipe, DatePipe } from "@angular/common";
import { Router } from "@angular/router";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import { Observable, combineLatest, of } from "rxjs";
import { catchError, map, startWith, switchMap } from "rxjs/operators";
import { SpotEditSchema } from "../../../db/schemas/SpotEditSchema";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { LocaleCode } from "../../../db/models/Interfaces";
import { Timestamp } from "@angular/fire/firestore";

@Component({
  selector: "app-activity-page",
  imports: [AsyncPipe, DatePipe, SpotPreviewCardComponent],
  templateUrl: "./activity-page.component.html",
  styleUrl: "./activity-page.component.scss",
})
export class ActivityPageComponent {
  private _spotEditsService = inject(SpotEditsService);
  private _spotsService = inject(SpotsService);
  private _locale = inject(LOCALE_ID) as LocaleCode;
  private _router = inject(Router);

  recentEdits$: Observable<
    Array<{
      edit: SpotEditSchema;
      spot: Spot | null;
      spotId: string;
      formattedTimestamp: Date;
    }>
  >;

  constructor() {
    this.recentEdits$ = this._spotEditsService.getMostRecentSpotEdits(5).pipe(
      switchMap((edits) => {
        if (edits.length === 0) {
          return of([]);
        }

        const editObservables = edits.map((item) => {
          return this._spotsService
            .getSpotById$(item.spotId as any, this._locale)
            .pipe(
              map((spot) => ({
                edit: item.edit,
                spot: spot,
                spotId: item.spotId,
                formattedTimestamp: this._getJsDate(item.edit.timestamp),
              })),
              catchError((err) => {
                console.error(`Could not load spot ${item.spotId}`, err);
                return of({
                  edit: item.edit,
                  spot: null,
                  spotId: item.spotId,
                  formattedTimestamp: this._getJsDate(item.edit.timestamp),
                });
              })
            );
        });

        return combineLatest(editObservables);
      })
    );
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

  openSpot(spot: Spot | LocalSpot | null) {
    if (spot && spot instanceof Spot) {
      this._router.navigate(["/map", spot.slug ?? spot.id]);
    }
  }
}
