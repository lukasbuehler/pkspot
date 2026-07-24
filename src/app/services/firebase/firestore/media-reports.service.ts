import { Injectable, inject } from "@angular/core";
import { MediaReportSchema } from "../../../../db/schemas/MediaReportSchema";
import {
  MediaReportReason,
  SubmitMediaReportRequest,
  SubmitMediaReportResponse,
} from "../../../../db/schemas/MediaReportPolicy";
import { AnyMedia, StorageMedia } from "../../../../db/models/Media";
import { FunctionsAdapterService } from "../functions-adapter.service";

@Injectable({
  providedIn: "root",
})
export class MediaReportsService {
  private readonly _functionsAdapter = inject(FunctionsAdapterService);

  /**
   * Convert media object to plain serializable format for Firestore
   * Only includes fields that are valid Firestore types (no undefined values)
   */
  private serializeMedia(
    media: AnyMedia,
  ): SubmitMediaReportRequest["media"] {
    return {
      type: media.type,
      src: media.baseSrc,
      ...(media.userId ? { userId: media.userId } : {}),
      ...(media.sourcePageUrl
        ? { source_page_url: media.sourcePageUrl }
        : {}),
      is_in_storage: media instanceof StorageMedia,
    };
  }

  /**
   * Submit a new media report to Firestore
   * @param media The media object to report
   * @param reason The reason for the report
   * @param comment Optional comment from the reporter
   * @param locale Optional locale/language code of the reporter
   */
  async submitMediaReport(
    media: AnyMedia,
    reason: MediaReportReason,
    comment: string,
    reporterEmail?: string,
    locale?: string,
    spotId?: string,
    context?: MediaReportSchema["context"],
    targetId?: string
  ): Promise<string> {
    const report: SubmitMediaReportRequest = {
      media: this.serializeMedia(media),
      reason,
      comment,
      ...(reporterEmail ? { reporterEmail } : {}),
      ...(locale && { locale }),
      ...(spotId && { spotId }),
      ...(context && { context }),
      ...(targetId && { targetId }),
    };

    const response = await this._functionsAdapter.callPublic<
      SubmitMediaReportRequest,
      SubmitMediaReportResponse
    >("submitMediaReport", report);
    return response.reportId;
  }
}
