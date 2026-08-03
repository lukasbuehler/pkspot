import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { Event as PkEvent } from "../../../db/models/Event";
import {
  EventAccessRole,
  EVENT_ACCESS_ROLES,
} from "../../../db/schemas/EventSchema";
import { UserReferenceSchema } from "../../../db/schemas/UserSchema";
import {
  EventAccessDocument,
  EventsService,
} from "../../services/firebase/firestore/events.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { ProfileButtonComponent } from "../profile-button/profile-button.component";
import { UserPickerComponent } from "../user-picker/user-picker.component";

interface EventAccessRow {
  grant: EventAccessDocument;
  user: UserReferenceSchema;
}

@Component({
  selector: "app-event-access-manager",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ProfileButtonComponent,
    UserPickerComponent,
  ],
  templateUrl: "./event-access-manager.component.html",
  styleUrl: "./event-access-manager.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventAccessManagerComponent {
  private readonly _events = inject(EventsService);
  private readonly _users = inject(UsersService);
  private _loadVersion = 0;

  readonly event = input.required<PkEvent>();
  readonly roleControl = new FormControl<EventAccessRole>("viewer", {
    nonNullable: true,
  });
  readonly roles = EVENT_ACCESS_ROLES;
  readonly rows = signal<EventAccessRow[]>([]);
  readonly selectedUserId = signal("");
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const event = this.event();
      void this._reload(event);
    });
  }

  roleLabel(role: EventAccessRole): string {
    return role === "collaborator"
      ? $localize`:@@event_access.role.collaborator:Collaborator`
      : $localize`:@@event_access.role.viewer:Viewer`;
  }

  async addGrant(): Promise<void> {
    const uid = this.selectedUserId().trim();
    if (!uid || this.saving()) return;

    this.saving.set(true);
    this.error.set(null);
    try {
      await this._events.setEventAccess(
        this.event(),
        uid,
        this.roleControl.value,
      );
      this.selectedUserId.set("");
      await this._reload(this.event());
    } catch (error) {
      console.error("EventAccessManager: failed to add access", error);
      this.error.set(
        $localize`:@@event_access.error.save:Access could not be saved.`,
      );
    } finally {
      this.saving.set(false);
    }
  }

  async changeRole(row: EventAccessRow, role: EventAccessRole): Promise<void> {
    if (row.grant.role === role || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this._events.setEventAccess(this.event(), row.grant.user_id, role);
      await this._reload(this.event());
    } catch (error) {
      console.error("EventAccessManager: failed to update access", error);
      this.error.set(
        $localize`:@@event_access.error.save:Access could not be saved.`,
      );
    } finally {
      this.saving.set(false);
    }
  }

  async removeGrant(row: EventAccessRow): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this._events.removeEventAccess(this.event(), row.grant.user_id);
      await this._reload(this.event());
    } catch (error) {
      console.error("EventAccessManager: failed to remove access", error);
      this.error.set(
        $localize`:@@event_access.error.remove:Access could not be removed.`,
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async _reload(event: PkEvent): Promise<void> {
    const version = ++this._loadVersion;
    this.loading.set(true);
    this.error.set(null);
    try {
      const grants = await this._events.listEventAccess(event);
      const users = await Promise.all(
        grants.map(async (grant) => {
          const user = await this._users.getUserRefernceById(grant.user_id);
          return {
            grant,
            user: user ?? { uid: grant.user_id },
          } satisfies EventAccessRow;
        }),
      );
      if (version === this._loadVersion) this.rows.set(users);
    } catch (error) {
      if (version !== this._loadVersion) return;
      console.error("EventAccessManager: failed to load access", error);
      this.error.set(
        $localize`:@@event_access.error.load:Access could not be loaded.`,
      );
    } finally {
      if (version === this._loadVersion) this.loading.set(false);
    }
  }

}
