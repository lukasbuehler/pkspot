import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router, RouterLink } from "@angular/router";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { EventSchema } from "../../../db/schemas/EventSchema";
import { EventEditFormComponent } from "../event-edit-form/event-edit-form.component";

/**
 * Standalone create page at `/events/new`. Hosts the shared
 * EventEditFormComponent in create mode. Non-admins get a friendly
 * "admins only" message rather than an empty form — the rules layer
 * also rejects the write, but failing-fast here is nicer UX.
 */
@Component({
  selector: "app-event-create-page",
  templateUrl: "./event-create-page.component.html",
  styleUrl: "./event-create-page.component.scss",
  imports: [
    EventEditFormComponent,
    MatButtonModule,
    MatIconModule,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCreatePageComponent implements OnInit {
  private _authService = inject(AuthenticationService);
  private _eventsService = inject(EventsService);
  private _router = inject(Router);
  private _snackbar = inject(MatSnackBar);
  private _metaTagService = inject(MetaTagService);

  readonly isAdmin = computed(
    () => this._authService.user.data?.isAdmin === true
  );

  readonly saving = signal<boolean>(false);

  ngOnInit(): void {
    this._metaTagService.setStaticPageMetaTags(
      $localize`:@@event_create.meta.title:Create event`,
      $localize`:@@event_create.meta.description:Admin tool for adding a new parkour event to PK Spot.`,
      undefined,
      "/events/new"
    );
    this._metaTagService.setRobotsContent("noindex,nofollow");
  }

  async onSave(patch: Partial<EventSchema>): Promise<void> {
    if (!this.isAdmin()) return;
    this.saving.set(true);
    try {
      const event = await this._eventsService.createEvent(patch);
      this._snackbar.open(
        $localize`:@@event_create.snackbar.created:Event created.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 3000 }
      );
      // Land on the new event's detail page.
      this._router.navigate(["/events", event.slug ?? event.id]);
    } catch (err) {
      console.error("Failed to create event", err);
      this._snackbar.open(
        $localize`:@@event_create.snackbar.failed:Couldn't create the event. Check the console for details.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 5000 }
      );
      this.saving.set(false);
    }
  }

  onCancel(): void {
    this._router.navigate(["/events"]);
  }
}
