import { ClipboardModule } from "@angular/cdk/clipboard";
import { ChangeDetectionStrategy, Component, computed, inject, signal, effect, untracked } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { SystemDatePipe } from "../../pipes/system-date.pipe";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { PlannedSessionsService } from "../../services/planned-sessions.service";
import { SpotPickerComponent } from "../spot-picker/spot-picker.component";
import { UserPickerComponent } from "../user-picker/user-picker.component";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import { environment } from "../../../environments/environment.default";
import type { PlannedSessionInput, PlannedSessionView } from "../../../db/schemas/PlannedSessionSchema";

@Component({
  selector: "app-session-planner-page",
  imports: [ClipboardModule, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCheckboxModule, RouterLink, SpotPickerComponent, UserPickerComponent, SystemDatePipe],
  templateUrl: "./session-planner-page.component.html",
  styleUrl: "./session-planner-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionPlannerPageComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly service = inject(PlannedSessionsService);
  private readonly age = inject(AgeAssuranceService);
  private readonly meta = inject(MetaTagService);
  private readonly telemetry = inject(FeatureTelemetryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authState = toSignal(this.auth.authState$, { initialValue: this.auth.authState$.value });
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly enabled = environment.features.plannedSessions || !!this.service.visualFixture;
  readonly signedIn = computed(() => !!this.authState()?.uid);
  readonly adult = computed(() => { this.authState(); return this.age.hasVerifiedAdultEligibility(); });
  readonly id = computed(() => this.params().get("sessionId"));
  readonly listMode = this.route.snapshot.data["sessionList"] === true;
  private loadGeneration = 0;
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly view = signal<PlannedSessionView | null>(null);
  readonly items = signal<PlannedSessionView[]>([]);
  readonly community = signal(false);
  readonly editing = signal(false);
  readonly spots = signal<string[]>([]);
  readonly invitee = signal("");
  readonly invitations = signal<string[]>([]);
  readonly attendees = signal<{ uid: string; name: string }[]>([]);
  readonly reminder = signal(false);
  readonly confirmCancel = signal(false);
  readonly copied = signal<boolean | null>(null);
  readonly shareUrl = computed(() => `${environment.baseUrl}/events/session/${this.id()}`);
  readonly visible = signal(false);
  readonly heading = computed(() => this.view()?.session.title || (this.listMode
    ? $localize`:@@planned.sessions:Sessions` : $localize`:@@planned.plan:Plan a session`));
  readonly form = new FormGroup({
    title: new FormControl("", { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    notes: new FormControl("", { nonNullable: true, validators: [Validators.maxLength(2000)] }),
    start: new FormControl("", { nonNullable: true, validators: [Validators.required] }),
    end: new FormControl("", { nonNullable: true, validators: [Validators.required] }),
    audience: new FormControl<"private" | "community">("private", { nonNullable: true }),
  });
  constructor() {
    this.meta.setStaticPageMetaTags($localize`:@@planned.sessions:Sessions`, $localize`:@@planned.description:Plan your next training session on PK Spot.`, undefined, "/events/session/new");
    this.meta.setRobotsContent("noindex,nofollow");
    effect(() => {
      this.id(); this.authState();
      untracked(() => void this.load());
    });
  }
  async load(): Promise<void> {
    if (!this.enabled) return;
    const generation = ++this.loadGeneration;
    this.loading.set(true); this.error.set(""); this.view.set(null); this.items.set([]); this.attendees.set([]); this.invitations.set([]);
    const id = this.id(), uid = this.authState()?.uid;
    try {
      if (id) {
        const view = await this.service.get(id, !!uid);
        if (generation !== this.loadGeneration || id !== this.id() || uid !== this.authState()?.uid) return;
        this.view.set(view); this.reminder.set(view.mine?.reminder ?? false); this.visible.set(view.canAttendVisibly && view.mine?.attendance === "visible");
        this.meta.setStaticPageMetaTags(view.session.title, $localize`:@@planned.description:Plan your next training session on PK Spot.`, undefined, `/events/session/${id}`);
        this.meta.setRobotsContent("noindex,nofollow");
      } else if (this.listMode && uid) {
        const items = await this.service.list(this.community() ? "community" : "mine");
        if (generation === this.loadGeneration && uid === this.authState()?.uid) this.items.set(items);
      }
    } catch (error) { if (generation === this.loadGeneration) this.failed("load", error); }
    finally { if (generation === this.loadGeneration) this.loading.set(false); }
  }
  edit(): void {
    const s = this.view()?.session;
    if (!s) return;
    this.form.setValue({ title: s.title, notes: s.notes, start: localDate(s.startsAt), end: localDate(s.endsAt), audience: s.audience });
    this.spots.set([s.spotId]); this.editing.set(true);
  }
  async submit(): Promise<void> {
    if (this.form.invalid || this.spots().length !== 1) { this.form.markAllAsTouched(); this.error.set($localize`:@@planned.complete:Choose a Spot and complete the session details.`); return; }
    await this.run("create_or_update", async () => {
      const f = this.form.getRawValue();
      const session: PlannedSessionInput = { title: f.title, notes: f.notes, audience: f.audience, spotId: this.spots()[0],
        startsAt: new Date(f.start).getTime(), endsAt: new Date(f.end).getTime(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      if (this.id()) { await this.service.update(this.id()!, session); this.editing.set(false); await this.load(); }
      else { const result = await this.service.create(session); await this.router.navigate(["/events/session", result.id]); }
    });
  }
  async save(saved: boolean): Promise<void> {
    await this.run("save", async () => { await this.service.save(this.id()!, { saved, reminder: this.reminder(), attendance: this.visible() ? "visible" : "private" }); await this.load(); });
  }
  async cancel(): Promise<void> {
    await this.run("cancel", async () => { await this.service.cancel(this.id()!); await this.load(); });
  }
  async invite(): Promise<void> {
    await this.run("invite", async () => { await this.service.invite(this.id()!, this.invitee()); this.invitee.set(""); this.invitations.set(await this.service.invitations(this.id()!)); });
  }
  async revoke(uid: string): Promise<void> {
    await this.run("revoke", async () => { await this.service.revoke(this.id()!, uid); this.invitations.set(await this.service.invitations(this.id()!)); });
  }
  async loadInvitations(): Promise<void> { await this.run("invitations", async () => this.invitations.set(await this.service.invitations(this.id()!))); }
  async loadAttendees(): Promise<void> { await this.run("attendees", async () => this.attendees.set(await this.service.attendees(this.id()!))); }
  async browse(community: boolean): Promise<void> { this.community.set(community); await this.load(); }
  private async run(action: string, operation: () => Promise<unknown>): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true); this.error.set("");
    try { await this.telemetry.run("planned_sessions", action, operation, action !== "save"); } catch (error) { this.failed(action, error); }
    finally { this.saving.set(false); }
  }
  private failed(action: string, error: unknown): void {
    this.telemetry.failure("planned_sessions", action, error);
    this.error.set($localize`:@@planned.failed:This action could not be completed. Check your access and try again.`);
  }
}
function localDate(ms: number): string {
  const date = new Date(ms);
  return new Date(ms - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
