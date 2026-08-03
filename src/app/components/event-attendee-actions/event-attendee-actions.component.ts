import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { Event as PkEvent } from "../../../db/models/Event";
import type { EventRSVPOption } from "../../../db/schemas/EventRSVPSchema";
import { EventLiveUpdateControlsComponent } from "../event-live-update-controls/event-live-update-controls.component";
import { EventRegistrationComponent } from "../event-registration/event-registration.component";
import { EventRsvpComponent } from "../event-rsvp/event-rsvp.component";

@Component({
  selector: "app-event-attendee-actions",
  imports: [
    EventLiveUpdateControlsComponent,
    EventRegistrationComponent,
    EventRsvpComponent,
  ],
  templateUrl: "./event-attendee-actions.component.html",
  styleUrl: "./event-attendee-actions.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventAttendeeActionsComponent {
  readonly event = input.required<PkEvent>();
  readonly showRsvp = input(false);
  readonly showRegistration = input(false);
  readonly rsvpChanged = output<EventRSVPOption | null>();
}
