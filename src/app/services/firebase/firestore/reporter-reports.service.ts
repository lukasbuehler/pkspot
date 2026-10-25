import { Injectable, inject } from "@angular/core";
import type {
  ListOwnReportsResponse,
  OwnReportSummary,
} from "../../../../db/schemas/ReportLifecycleSchema";
import { FunctionsAdapterService } from "../functions-adapter.service";

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_MY_REPORTS__?: OwnReportSummary[];
}

@Injectable({providedIn: "root"})
export class ReporterReportsService {
  private readonly _functionsAdapter = inject(FunctionsAdapterService);

  async listMine(): Promise<OwnReportSummary[]> {
    const fixture = (globalThis as ScreenshotGlobal).__PKSPOT_SCREENSHOT_MY_REPORTS__;
    if (fixture) return fixture;
    const result = await this._functionsAdapter.call<
      Record<string, never>,
      ListOwnReportsResponse
    >("listMyReports", {});
    return result.reports;
  }
}
