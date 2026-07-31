import { Injectable, inject } from "@angular/core";
import { Timestamp } from "firebase/firestore";
import { Observable, map, of } from "rxjs";
import { Event } from "../../../../db/models/Event";
import { EventLiveUpdate } from "../../../../db/models/EventLiveUpdate";
import type {
  ApplyEventOperationalChangeRequest,
  ApplyEventOperationalChangeResponse,
  EventLiveUpdateSchema,
  EventLiveUpdateSubscriberSchema,
  EventNotificationLevel,
  PublishEventLiveUpdateRequest,
  PublishEventLiveUpdateResponse,
} from "../../../../db/schemas/EventLiveUpdateSchema";
import type { OrganizationMemberSchema } from "../../../../db/schemas/OrganizationSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";

type LiveUpdateDocument = EventLiveUpdateSchema & { id: string };
type SubscriptionDocument = EventLiveUpdateSubscriberSchema & {
  id: string;
  path: string;
};

export interface EventNotificationSubscription {
  eventId: string;
  level: Exclude<EventNotificationLevel, "none">;
}

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
    return this.observeNotificationLevel(eventId, userId).pipe(
      map((level) => level === "all" || level === "event_updates"),
    );
  }

  observeNotificationLevel(
    eventId: string,
    userId: string,
  ): Observable<EventNotificationLevel | null> {
    return this.firestore
      .documentSnapshots<EventLiveUpdateSubscriberSchema>(
        `events/${eventId}/live_update_subscribers/${userId}`,
      )
      .pipe(
        map((subscription) =>
          subscription ? this._notificationLevel(subscription) : null,
        ),
      );
  }

  observeCurrentUserSubscriptions(): Observable<
    EventNotificationSubscription[]
  > {
    const userId = this.auth.user.uid;
    if (!userId) return of([]);

    return this.firestore
      .collectionGroupSnapshotsWithMetadata<SubscriptionDocument>(
        "live_update_subscribers",
        [{ fieldPath: "user_id", opStr: "==", value: userId }],
      )
      .pipe(
        map((subscriptions) =>
          subscriptions.flatMap((subscription) => {
            const eventId = this._eventIdFromSubscriptionPath(
              subscription.path,
            );
            const level = this._notificationLevel(subscription);
            return eventId && level !== "none" ? [{ eventId, level }] : [];
          }),
        ),
      );
  }

  async setSubscription(eventId: string, active: boolean): Promise<void> {
    await this.setNotificationLevel(eventId, active ? "event_updates" : "none");
  }

  /**
   * Applies an event's notification default without replacing a choice the
   * attendee has already made for this event.
   *
   * RSVP writes and subscription writes are intentionally independent: an
   * RSVP must still succeed if notification setup fails, and an explicit
   * event-level opt-out must survive later RSVP changes.
   */
  async ensureDefaultNotificationLevel(
    eventId: string,
    level: EventNotificationLevel,
  ): Promise<boolean> {
    if (level === "none") return false;

    const userId = this.auth.user.uid;
    if (!userId) return false;
    const path = `events/${eventId}/live_update_subscribers/${userId}`;
    const existing =
      await this.firestore.getDocument<EventLiveUpdateSubscriberSchema>(path);
    if (existing) return false;

    await this._writeNotificationLevel(path, userId, level, null);
    return true;
  }

  async setNotificationLevel(
    eventId: string,
    level: EventNotificationLevel,
  ): Promise<void> {
    const userId = this.auth.user.uid;
    if (!userId) throw new Error("Sign in before changing live updates.");

    const path = `events/${eventId}/live_update_subscribers/${userId}`;
    const existing =
      await this.firestore.getDocument<EventLiveUpdateSubscriberSchema>(path);
    await this._writeNotificationLevel(path, userId, level, existing);
  }

  private async _writeNotificationLevel(
    path: string,
    userId: string,
    level: EventNotificationLevel,
    existing: EventLiveUpdateSubscriberSchema | null,
  ): Promise<void> {
    const now = Timestamp.now();
    await this.firestore.setDocument<EventLiveUpdateSubscriberSchema>(
      path,
      {
        user_id: userId,
        active: level === "all" || level === "event_updates",
        event_reminders: level === "all" || level === "reminders",
        subscribed_at: existing?.subscribed_at ?? now,
        updated_at: now,
      },
      { merge: false },
    );
  }

  private _notificationLevel(
    subscription: EventLiveUpdateSubscriberSchema,
  ): EventNotificationLevel {
    const updates = subscription.active === true;
    const reminders =
      subscription.event_reminders ?? subscription.active === true;
    if (updates && reminders) return "all";
    if (updates) return "event_updates";
    if (reminders) return "reminders";
    return "none";
  }

  private _eventIdFromSubscriptionPath(path: string): string | null {
    const parts = path.split("/");
    return parts.length === 4 &&
      parts[0] === "events" &&
      parts[2] === "live_update_subscribers"
      ? parts[1]
      : null;
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

  applyOperationalChange(
    request: ApplyEventOperationalChangeRequest,
  ): Promise<ApplyEventOperationalChangeResponse> {
    return this.functions.call<
      ApplyEventOperationalChangeRequest,
      ApplyEventOperationalChangeResponse
    >("applyEventOperationalChange", request);
  }
}
