import { Injectable, inject } from "@angular/core";
import { SpotReportSchema } from "../../../../db/schemas/SpotReportSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import {
  FirestoreAdapterService,
  QueryFilter,
} from "../firestore-adapter.service";

@Injectable({
  providedIn: "root",
})
export class SpotReportsService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);

  constructor() {
    super();
  }

  getSpotReportById(
    spotId: string,
    reportId: string
  ): Promise<SpotReportSchema> {
    return this._firestoreAdapter
      .getDocument<SpotReportSchema & { id: string }>(
        `spots/${spotId}/reports/${reportId}`
      )
      .then((data) => {
        if (!data) {
          return Promise.reject("No report found for this report id.");
        }
        return data as SpotReportSchema;
      });
  }

  getSpotReportsBySpotId(spotId: string): Promise<SpotReportSchema[]> {
    console.log("getting all reports for a spot");
    return this._firestoreAdapter
      .getCollection<SpotReportSchema & { id: string }>(
        `spots/${spotId}/reports`
      )
      .then((docs) => {
        if (docs.length === 0) {
          return [];
        }
        return docs as SpotReportSchema[];
      });
  }

  // Now uses adapter for full native support
  getSpotReportsByUserId(userId: string): Promise<SpotReportSchema> {
    console.log("getting all reports for a user");
    const filters: QueryFilter[] = [
      { fieldPath: "userId", opStr: "==", value: userId },
    ];

    return this._firestoreAdapter
      .getCollectionGroup<SpotReportSchema & { id: string }>("reports", filters)
      .then((docs) => {
        if (docs.length === 0) {
          return Promise.reject("No reports found for this user id.");
        }
        return docs[0] as SpotReportSchema;
      });
  }

  addSpotReport(report: SpotReportSchema) {
    const spot_id: string = report.spot.id;

    this.trackEventWithConsent("Add Spot Report", {
      props: { spotId: spot_id },
    });

    return this._firestoreAdapter.addDocument(
      `spots/${spot_id}/reports`,
      report
    );
  }
}
