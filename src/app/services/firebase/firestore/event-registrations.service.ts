import { Injectable, inject } from "@angular/core";
import { Observable, map, of, switchMap } from "rxjs";
import {
  CancelEventRegistrationResponse,
  EventAdmissionStateSchema,
  EventRegistrationSchema,
  RegisterForEventResponse,
} from "../../../../db/schemas/EventRegistrationSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";

@Injectable({ providedIn: "root" })
export class EventRegistrationsService {
  private readonly _auth = inject(AuthenticationService);
  private readonly _firestore = inject(FirestoreAdapterService);
  private readonly _functions = inject(FunctionsAdapterService);

  observeMyRegistration(
    eventId: string,
  ): Observable<EventRegistrationSchema | null> {
    return this._auth.authState$.pipe(
      switchMap((user) =>
        user?.uid
          ? this._firestore.documentSnapshots<EventRegistrationSchema>(
              `events/${eventId}/registrations/${user.uid}`,
            )
          : of(null),
      ),
    );
  }

  observeAdmissionState(eventId: string): Observable<EventAdmissionStateSchema> {
    return this._firestore
      .documentSnapshots<EventAdmissionStateSchema>(
        `events/${eventId}/admission/state`,
      )
      .pipe(
        map(
          (state) =>
            state ?? {
              registered: 0,
              waitlisted: 0,
              time_updated: new Date(0),
            },
        ),
      );
  }

  register(eventId: string): Promise<RegisterForEventResponse> {
    return this._functions.call("registerForEvent", { eventId });
  }

  cancel(
    eventId: string,
    userId?: string,
  ): Promise<CancelEventRegistrationResponse> {
    return this._functions.call("cancelEventRegistration", {
      eventId,
      ...(userId ? { userId } : {}),
    });
  }

  listRegistrations(
    eventId: string,
  ): Promise<Array<EventRegistrationSchema & { id: string }>> {
    return this._firestore.getCollection<
      EventRegistrationSchema & { id: string }
    >(`events/${eventId}/registrations`, undefined, [
      { type: "orderBy", fieldPath: "time_updated", direction: "desc" },
    ]);
  }
}
