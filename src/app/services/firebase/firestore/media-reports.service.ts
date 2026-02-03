import { Injectable, inject } from "@angular/core";
import { MediaReportSchema } from "../../../../db/schemas/MediaReportSchema";
import { UserReferenceSchema } from "../../../../db/schemas/UserSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import { AuthenticationService } from "../../firebase/authentication.service";
import { AnyMedia } from "../../../../db/models/Media";
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
    const serialized: { type: string; userId?: string; src?: string } = {
      type: media.type,
    };

    // Only add userId if it exists
    if (media.userId) {
      serialized.userId = media.userId;
    }

    // Add src (check baseSrc for StorageMedia, then src for others)
    if ((media as any).baseSrc) {
      serialized.src = (media as any).baseSrc;
    } else if ((media as any).src) {
      serialized.src = (media as any).src;
    }

    return serialized;
  }

  /**
   * Submit a new media report to Firestore
   * @param media The media object to report
   * @param reason The reason for the report
   * @param comment Optional comment from the reporter
   * @param reporterEmail Optional email for unauthenticated reports
   * @param locale Optional locale/language code of the reporter
   */
  async submitMediaReport(
    media: AnyMedia,
    reason: string,
    comment: string,
    reporterEmail?: string,
    locale?: string,
    spotId?: string
  ): Promise<string> {
    const authUser = await firstValueFrom(this.authService.authState$);

    // Determine user info based on auth status
    const userInfo: UserReferenceSchema | { email: string } = authUser?.uid
      ? this.buildAuthenticatedUserInfo(authUser)
      : this.buildUnauthenticatedUserInfo(reporterEmail);

    // Using new Date() for native compatibility (schema expects Date)
    const report: MediaReportSchema = {
      media: this.serializeMedia(media),
      reason,
      comment,
      user: userInfo,
      createdAt: new Date(),
      ...(locale && { locale }),
      ...(spotId && { spotId }),
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

    return this._firestoreAdapter.addDocument("media_reports", report);
  }

  /**
   * Build user info for authenticated users
   */
  private buildAuthenticatedUserInfo(authUser: {
    uid?: string;
    email?: string;
    data?: { displayName?: string };
  }): UserReferenceSchema {
    const userInfo: UserReferenceSchema = {
      uid: authUser.uid ?? "",
    };

    if (authUser.email) {
      (userInfo as any).email = authUser.email;
    }

    if (authUser.data?.displayName) {
      userInfo.display_name = authUser.data.displayName;
    }

    return userInfo;
  }

  /**
   * Build user info for unauthenticated users
   */
  private buildUnauthenticatedUserInfo(reporterEmail?: string): {
    email: string;
  } {
    if (!reporterEmail) {
      throw new Error("User authentication or email is required");
    }
    return { email: reporterEmail };
  }
}
