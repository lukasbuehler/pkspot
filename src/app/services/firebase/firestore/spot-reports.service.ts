import { Injectable, inject } from "@angular/core";
import { SpotReportSchema } from "../../../../db/schemas/SpotReportSchema";
import {
  GetOwnReportResponse,
  OwnReportSummary,
  SubmitSpotReportRequest,
  SubmitSpotReportResponse,
} from "../../../../db/schemas/ReportLifecycleSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import {
  FirestoreAdapterService,
  QueryFilter,
} from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";

@Injectable({
  providedIn: "root",
})
export class SpotReportsService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private readonly _functionsAdapter = inject(FunctionsAdapterService);

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

  // Raw report reads remain moderator-only after the privacy migration.
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

  async submitSpotReport(
    report: SubmitSpotReportRequest,
  ): Promise<SubmitSpotReportResponse> {
    this.trackEventWithConsent("Submit Spot Report", {
      props: { spotId: report.spotId, reasons: report.reasons },
    });
    return this._functionsAdapter.call<
      SubmitSpotReportRequest,
      SubmitSpotReportResponse
    >("submitSpotReport", report);
  }

  async getOwnSpotReport(spotId: string): Promise<OwnReportSummary | null> {
    const response = await this._functionsAdapter.call<
      { kind: "spot"; spotId: string },
      GetOwnReportResponse
    >("getOwnReportForTarget", { kind: "spot", spotId });
    return response.report;
  }

  withdrawOwnSpotReport(
    spotId: string,
    reportId: string,
  ): Promise<{ withdrawn: boolean }> {
    return this._functionsAdapter.call(
      "withdrawOwnSpotReport",
      { kind: "spot", spotId, reportId },
    );
  }
}
