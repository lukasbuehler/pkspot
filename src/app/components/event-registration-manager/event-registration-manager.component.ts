import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { Event as PkEvent } from "../../../db/models/Event";
import {
  EventRegistrationSchema,
  EventRegistrationStatus,
} from "../../../db/schemas/EventRegistrationSchema";
import type { UserReferenceSchema } from "../../../db/schemas/UserSchema";
import { EventRegistrationsService } from "../../services/firebase/firestore/event-registrations.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { ProfileButtonComponent } from "../profile-button/profile-button.component";

interface RegistrationRow {
  registration: EventRegistrationSchema & { id: string };
  user: UserReferenceSchema;
}

@Component({
  selector: "app-event-registration-manager",
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ProfileButtonComponent,
  ],
  templateUrl: "./event-registration-manager.component.html",
  styleUrl: "./event-registration-manager.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventRegistrationManagerComponent {
  private readonly _registrations = inject(EventRegistrationsService);
  private readonly _users = inject(UsersService);
  private _loadVersion = 0;

  readonly event = input.required<PkEvent>();
  readonly rows = signal<RegistrationRow[]>([]);
  readonly loading = signal(true);
  readonly savingUserId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => void this._reload(this.event()));
  }

  statusLabel(status: EventRegistrationStatus): string {
    switch (status) {
      case "registered":
        return $localize`:@@event_registration_manager.status.registered:Registered`;
      case "waitlisted":
        return $localize`:@@event_registration_manager.status.waitlisted:Waitlisted`;
      case "cancelled":
        return $localize`:@@event_registration_manager.status.cancelled:Cancelled`;
    }
  }

  async cancelRegistration(row: RegistrationRow): Promise<void> {
    const userId = row.registration.user_id;
    if (this.savingUserId()) return;
    this.savingUserId.set(userId);
    this.error.set(null);
    try {
      await this._registrations.cancel(this.event().id, userId);
      await this._reload(this.event());
    } catch (error) {
      console.error("Could not cancel attendee registration", error);
      this.error.set(
        $localize`:@@event_registration_manager.cancel_failed:Registration could not be cancelled.`,
      );
    } finally {
      this.savingUserId.set(null);
    }
  }

  private async _reload(event: PkEvent): Promise<void> {
    const version = ++this._loadVersion;
    this.loading.set(true);
    this.error.set(null);
    try {
      const registrations = await this._registrations.listRegistrations(
        event.id,
      );
      const rows = await Promise.all(
        registrations.map(async (registration) => ({
          registration,
          user:
            (await this._users.getUserRefernceById(registration.user_id)) ?? {
              uid: registration.user_id,
            },
        })),
      );
      if (version === this._loadVersion) this.rows.set(rows);
    } catch (error) {
      if (version !== this._loadVersion) return;
      console.error("Could not load event registrations", error);
      this.error.set(
        $localize`:@@event_registration_manager.load_failed:Registrations could not be loaded.`,
      );
    } finally {
      if (version === this._loadVersion) this.loading.set(false);
    }
  }
}
