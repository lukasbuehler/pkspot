import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import {
  UserReportReason,
  UserReportSchema,
} from "../../../../db/schemas/UserReportSchema";
import { UserReferenceSchema } from "../../../../db/schemas/UserSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";

@Injectable({
  providedIn: "root",
})
export class UserReportsService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private _authService = inject(AuthenticationService);

  async submitUserReport(
    reportedUser: UserReferenceSchema,
    reason: UserReportReason,
    comment?: string,
    sourcePath?: string
  ): Promise<string> {
    const authUser = await firstValueFrom(this._authService.authState$);
    if (!authUser?.uid) {
      throw new Error("User authentication is required");
    }

    const reporter: UserReferenceSchema = {
      uid: authUser.uid,
    };

    if (authUser.data?.displayName) {
      reporter.display_name = authUser.data.displayName;
    }

    const trimmedComment = comment?.trim();
    const report: UserReportSchema = {
      reportedUser,
      reason,
      user: reporter,
      createdAt: new Date(),
      ...(trimmedComment ? { comment: trimmedComment } : {}),
      ...(sourcePath ? { sourcePath } : {}),
    };

    return this.executeWithConsent(() =>
      this._firestoreAdapter.addDocument("user_reports", report)
    );
  }
}
