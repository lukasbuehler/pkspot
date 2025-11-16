import { Injectable } from "@angular/core";
import {
  Firestore,
  addDoc,
  collection,
  serverTimestamp,
} from "@angular/fire/firestore";
import { MediaReportSchema } from "../../../../db/schemas/MediaReportSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import { AuthenticationService } from "../../firebase/authentication.service";
import { AnyMedia } from "../../../../db/models/Media";
import { firstValueFrom } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class MediaReportsService extends ConsentAwareService {
  constructor(
    private firestore: Firestore,
    private authService: AuthenticationService
  ) {
    super();
  }

  /**
   * Convert media object to plain serializable format for Firestore
   * Only includes fields that are valid Firestore types (no undefined values)
   */
  private serializeMedia(media: AnyMedia): MediaReportSchema["media"] {
    const serialized: any = {
      type: media.type,
    };

    // Only add userId if it exists and is not undefined
    if (media.userId) {
      serialized.userId = media.userId;
    }

    // Only add src if it exists and is not undefined
    if ((media as any).src) {
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
    locale?: string
  ): Promise<string> {
    const user = await firstValueFrom(this.authService.authState$);

    // Determine user info based on auth status
    let userInfo:
      | { uid: string; display_name?: string; profile_picture?: undefined }
      | { email: string };

    if (user?.uid) {
      // Authenticated user
      const userData: any = { uid: user.uid };
      if (user.data?.displayName) {
        userData.display_name = user.data.displayName;
      }
      userInfo = userData;
    } else if (reporterEmail) {
      // Unauthenticated user with email
      userInfo = { email: reporterEmail };
    } else {
      return Promise.reject("User authentication or email is required");
    }

    const report: Omit<MediaReportSchema, "createdAt"> & {
      createdAt: ReturnType<typeof serverTimestamp>;
    } = {
      media: this.serializeMedia(media),
      reason,
      comment,
      user: userInfo,
      createdAt: serverTimestamp(),
      ...(locale && { locale }),
    };

    const docRef = await addDoc(
      collection(this.firestore, "media_reports"),
      report
    );

    return docRef.id;
  }
}
