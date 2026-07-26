import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router, RouterLink } from "@angular/router";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { MetaTagService } from "../../services/meta-tag.service";
import {
  EventEditFormComponent,
  EventEditPatch,
} from "../event-edit-form/event-edit-form.component";

@Component({
  selector: "app-session-planner-page",
  imports: [
    EventEditFormComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RouterLink,
  ],
  templateUrl: "./session-planner-page.component.html",
  styleUrl: "./session-planner-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionPlannerPageComponent implements OnInit {
  private readonly auth = inject(AuthenticationService);
  private readonly events = inject(EventsService);
  private readonly ageAssurance = inject(AgeAssuranceService);
  private readonly analytics = inject(AnalyticsService);
  private readonly meta = inject(MetaTagService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);

  private readonly authState = toSignal(this.auth.authState$, {
    initialValue: this.auth.authState$.value,
  });

  readonly authReady = this.auth.initialAuthStateResolved;
  readonly signedIn = computed(() => !!this.authState()?.uid);
  readonly canPlan = computed(
    () => this.signedIn() && this.ageAssurance.canParticipatePublicly(),
  );
  readonly restrictionMessage = computed(() =>
    this.ageAssurance.getRestrictionMessage(),
  );
  readonly saving = signal(false);

  ngOnInit(): void {
    this.meta.setStaticPageMetaTags(
      $localize`:@@session_planner.meta.title:Plan a session`,
      $localize`:@@session_planner.meta.description:Plan a local parkour training session and invite the community.`,
      undefined,
      "/events/session/new",
    );
    this.meta.setRobotsContent("noindex,nofollow");
  }

  async onSave(patch: EventEditPatch): Promise<void> {
    const userId = this.auth.user.uid;
    if (!userId || !this.canPlan()) return;

    this.saving.set(true);
    try {
      const event = await this.events.createEvent({
        ...patch,
        owner: { type: "user", user_id: userId },
        kind: "session",
        schedule_mode: "single",
        lifecycle_status: "planned",
        priority: "normal",
        publication_state: "published",
        published: true,
        visibility: "public",
        discoverability: { audience: "global" },
      });
      this.analytics.trackEvent("session_created", {
        visibility: "public",
        attendance_admission: event.attendance.admission,
      });
      this.snackbar.open(
        $localize`:@@session_planner.created:Session created.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 3000 },
      );
      await this.router.navigate(["/events", event.slug ?? event.id]);
    } catch (error) {
      console.error("Failed to create session", error);
      this.snackbar.open(
        $localize`:@@session_planner.failed:Couldn't create the session. Please try again.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 5000 },
      );
      this.saving.set(false);
    }
  }

  onCancel(): void {
    void this.router.navigate(["/events"]);
  }
}
