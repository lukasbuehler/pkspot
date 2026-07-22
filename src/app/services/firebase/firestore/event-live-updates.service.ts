import { Injectable, inject } from "@angular/core";
import { Timestamp } from "@angular/fire/firestore";
import { Observable, map } from "rxjs";
import { Event } from "../../../../db/models/Event";
import { EventLiveUpdate } from "../../../../db/models/EventLiveUpdate";
import type {
  EventLiveUpdateSchema,
  EventLiveUpdateSubscriberSchema,
  PublishEventLiveUpdateRequest,
  PublishEventLiveUpdateResponse,
} from "../../../../db/schemas/EventLiveUpdateSchema";
import type { OrganizationMemberSchema } from "../../../../db/schemas/OrganizationSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";

type LiveUpdateDocument = EventLiveUpdateSchema & { id: string };

@Injectable({ providedIn: "root" })
export class EventLiveUpdatesService {
  private readonly auth = inject(AuthenticationService);
  private readonly firestore = inject(FirestoreAdapterService);
  private readonly functions = inject(FunctionsAdapterService);

  observeUpdates(eventId: string): Observable<EventLiveUpdate[]> {
    return this.firestore
      .collectionSnapshots<LiveUpdateDocument>(
        `events/${eventId}/live_updates`,
        undefined,
        [
          { type: "orderBy", fieldPath: "published_at", direction: "desc" },
          { type: "limit", limit: 50 },
        ],
      )
      .pipe(
        map((documents) =>
          documents
            .filter((document) => document.status === "published")
            .map((document) => new EventLiveUpdate(document.id, document)),
        ),
      );
  }

  observeSubscription(eventId: string, userId: string): Observable<boolean> {
    return this.firestore
      .documentSnapshots<EventLiveUpdateSubscriberSchema>(
        `events/${eventId}/live_update_subscribers/${userId}`,
      )
      .pipe(map((subscription) => subscription?.active === true));
  }

  async setSubscription(eventId: string, active: boolean): Promise<void> {
    const userId = this.auth.user.uid;
    if (!userId) throw new Error("Sign in before changing live updates.");

    const path = `events/${eventId}/live_update_subscribers/${userId}`;
    const existing =
      await this.firestore.getDocument<EventLiveUpdateSubscriberSchema>(path);
    const now = Timestamp.now();
    await this.firestore.setDocument<EventLiveUpdateSubscriberSchema>(
      path,
      {
        user_id: userId,
        active,
        subscribed_at: existing?.subscribed_at ?? now,
        updated_at: now,
      },
      { merge: false },
    );
  }

  async canCurrentUserPublish(event: Event): Promise<boolean> {
    if (this.auth.isAdmin()) return true;
    const userId = this.auth.user.uid;
    const organizationId = event.organizer?.organization.id;
    if (!userId || !organizationId) return false;
    const membership =
      await this.firestore.getDocument<OrganizationMemberSchema>(
        `organizations/${organizationId}/members/${userId}`,
      );
    return membership?.role === "owner" || membership?.role === "admin";
  }

  publish(
    request: PublishEventLiveUpdateRequest,
  ): Promise<PublishEventLiveUpdateResponse> {
    return this.functions.call<
      PublishEventLiveUpdateRequest,
      PublishEventLiveUpdateResponse
    >("publishEventLiveUpdate", request);
  }
}
