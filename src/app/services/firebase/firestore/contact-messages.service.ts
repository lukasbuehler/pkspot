import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import {
  ContactMessageAnalyticsSchema,
  ContactMessageSchema,
  ContactMessageTopic,
  ContactMessageUserSchema,
} from "../../../../db/schemas/ContactMessageSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";

export interface SubmitContactMessageInput {
  message: string;
  contactInfo: string;
  topic?: ContactMessageTopic;
  analytics?: ContactMessageAnalyticsSchema;
  locale?: string;
  sourcePath?: string;
  userAgent?: string;
}

@Injectable({
  providedIn: "root",
})
export class ContactMessagesService {
  private readonly _firestoreAdapter = inject(FirestoreAdapterService);
  private readonly _authService = inject(AuthenticationService);

  async submitContactMessage(
    input: SubmitContactMessageInput
  ): Promise<string> {
    const authUser = await firstValueFrom(this._authService.authState$);
    const contactInfo = input.contactInfo.trim();
    const message = input.message.trim();
    const authEmail = authUser?.email?.trim();
    const user = authUser?.uid
      ? this._buildContactUser(
          authUser.uid,
          authEmail,
          authUser.data?.displayName
        )
      : undefined;

    const contactMessage: ContactMessageSchema = {
      message,
      contact_info: contactInfo,
      createdAt: new Date(),
      ...(user ? { user } : {}),
      ...(authEmail ? { auth_email: authEmail } : {}),
      ...(input.topic ? { topic: input.topic } : {}),
      ...(input.analytics && Object.keys(input.analytics).length > 0
        ? { analytics: input.analytics }
        : {}),
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.sourcePath ? { source_path: input.sourcePath } : {}),
      ...(input.userAgent ? { user_agent: input.userAgent } : {}),
    };

    return this._firestoreAdapter.addDocument(
      "contact_messages",
      contactMessage
    );
  }

  private _buildContactUser(
    uid: string,
    email?: string,
    displayName?: string
  ): ContactMessageUserSchema {
    return {
      uid,
      ...(email ? { email } : {}),
      ...(displayName ? { display_name: displayName } : {}),
    };
  }
}
