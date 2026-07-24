import { Injectable, inject } from "@angular/core";
import { MediaReportSchema } from "../../../../db/schemas/MediaReportSchema";
import { ModerationReporterSchema } from "../../../../db/schemas/MediaReportSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import { AuthenticationService } from "../../firebase/authentication.service";
import { AnyMedia, StorageMedia } from "../../../../db/models/Media";
import { firstValueFrom } from "rxjs";
import { FirestoreAdapterService } from "../firestore-adapter.service";

@Injectable({
  providedIn: "root",
})
export class MediaReportsService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private authService = inject(AuthenticationService);

  constructor() {
    super();
  }

  /**
   * Convert media object to plain serializable format for Firestore
   * Only includes fields that are valid Firestore types (no undefined values)
   */
  private serializeMedia(media: AnyMedia): MediaReportSchema["media"] {
    const serialized = {
      ...media.getData(),
      is_in_storage: media instanceof StorageMedia,
      userId: media.userId,
      src: media.baseSrc,
    };
    for (const key of Object.keys(serialized) as (keyof typeof serialized)[]) {
      if (serialized[key] === undefined) {
        delete serialized[key];
      }
    }
    return serialized;
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
    reason: string,
    comment: string,
    locale?: string,
    spotId?: string,
    context?: MediaReportSchema["context"],
    targetId?: string
  ): Promise<string> {
    const authUser = await firstValueFrom(this.authService.authState$);
    if (!authUser?.uid) {
      throw new Error("User authentication is required");
    }
    const userInfo = this.buildAuthenticatedUserInfo(authUser);

    // Using new Date() for native compatibility (schema expects Date)
    const report: MediaReportSchema = {
      kind: "media",
      media: this.serializeMedia(media),
      reason,
      comment,
      user: userInfo,
      createdAt: new Date(),
      ...(locale && { locale }),
      ...(spotId && { spotId }),
      ...(context && { context }),
      ...(targetId && { targetId }),
    };

    console.log("Submitting media report with data:", {
      media: report.media,
      reason: report.reason,
      comment: report.comment,
      user: report.user,
      createdAt: report.createdAt,
      locale: report.locale,
      isAuthenticated: !!authUser?.uid,
      authUid: authUser?.uid ?? null,
    });

    return this._firestoreAdapter.addDocument("reports", report);
  }

  /**
   * Build user info for authenticated users
   */
  private buildAuthenticatedUserInfo(authUser: {
    uid?: string;
    email?: string;
    data?: { displayName?: string };
  }): ModerationReporterSchema {
    const userInfo: ModerationReporterSchema = {
      uid: authUser.uid ?? "",
    };

    if (authUser.data?.displayName) {
      userInfo.display_name = authUser.data.displayName;
    }

    return userInfo;
  }

}
