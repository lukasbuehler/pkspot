import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  SafetyIncidentClassification,
  SafetyIncidentRetentionState,
  SafetyIncidentReportingRoute,
  SafetyIncidentReportingStatus,
  SafetyIncidentSchema,
  SafetyIncidentStatus,
  SafetyIncidentUkLink,
} from "../../../db/schemas/SafetyIncidentSchema";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  SafetyIncidentsService,
  SafetyIncidentUpdate,
} from "../../services/firebase/firestore/safety-incidents.service";
import { SystemDatePipe } from "../../pipes/system-date.pipe";
import { Subscription } from "rxjs";

@Component({
  selector: "app-safety-incident-page",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SystemDatePipe,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: "./safety-incident-page.component.html",
  styleUrl: "./safety-incident-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SafetyIncidentPageComponent implements OnDestroy {
  private readonly _route = inject(ActivatedRoute);
  private readonly _incidents = inject(SafetyIncidentsService);
  private readonly _snackbar = inject(MatSnackBar);
  readonly authService = inject(AuthenticationService);

  readonly incident = signal<(SafetyIncidentSchema & { id: string }) | null>(
    null,
  );
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly createdAt = computed(() => this._dateValue(this.incident()?.created_at));
  readonly incidentId = this._route.snapshot.paramMap.get("incidentId") ?? "";
  private readonly _authSubscription: Subscription;

  readonly form = new FormGroup({
    status: new FormControl<SafetyIncidentStatus>("triage", {
      nonNullable: true,
    }),
    classification: new FormControl<SafetyIncidentClassification>(
      "undetermined",
      { nonNullable: true },
    ),
    uk_link: new FormControl<SafetyIncidentUkLink>("unknown", {
      nonNullable: true,
    }),
    retention_state: new FormControl<SafetyIncidentRetentionState>(
      "triage_hold",
      { nonNullable: true },
    ),
    reporting_route: new FormControl<SafetyIncidentReportingRoute>("pending", {
      nonNullable: true,
    }),
    reporting_status: new FormControl<SafetyIncidentReportingStatus>(
      "not_assessed",
      { nonNullable: true },
    ),
    runbook: new FormGroup({
      evidence_preserved: new FormControl(false, { nonNullable: true }),
      access_restricted: new FormControl(false, { nonNullable: true }),
      context_collected: new FormControl(false, { nonNullable: true }),
      uk_link_assessed: new FormControl(false, { nonNullable: true }),
      reporting_route_assessed: new FormControl(false, {
        nonNullable: true,
      }),
      external_action_recorded: new FormControl(false, {
        nonNullable: true,
      }),
    }),
    containment_summary: new FormControl("", { nonNullable: true }),
    posthog_context: new FormControl("", { nonNullable: true }),
    external_report_reference: new FormControl("", { nonNullable: true }),
    reporting_decision_summary: new FormControl("", { nonNullable: true }),
    notes: new FormControl("", { nonNullable: true }),
  });

  constructor() {
    this._authSubscription = this.authService.authState$.subscribe(() => {
      if (this.authService.isAdmin()) {
        void this.load();
      } else if (this.authService.initialAuthStateResolved()) {
        this.isLoading.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this._authSubscription.unsubscribe();
  }

  async load(): Promise<void> {
    if (!this.incidentId || !this.authService.isAdmin()) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    try {
      const incident = await this._incidents.getIncident(this.incidentId);
      this.incident.set(incident);
      if (incident) {
        this.form.reset({
          status: incident.status,
          classification: incident.classification,
          uk_link: incident.uk_link,
          retention_state: incident.retention_state,
          reporting_route: incident.reporting_route ?? "pending",
          reporting_status: incident.reporting_status ?? "not_assessed",
          runbook: incident.runbook ?? {
            evidence_preserved: false,
            access_restricted: false,
            context_collected: false,
            uk_link_assessed: false,
            reporting_route_assessed: false,
            external_action_recorded: false,
          },
          containment_summary: incident.containment_summary ?? "",
          posthog_context: incident.posthog_context ?? "",
          external_report_reference:
            incident.external_report_reference ?? "",
          reporting_decision_summary:
            incident.reporting_decision_summary ?? "",
          notes: incident.notes ?? "",
        });
      }
    } catch (error) {
      console.error("Failed to load safety incident", error);
      this._snackbar.open($localize`Failed to load safety incident`, undefined, {
        duration: 4000,
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  async save(): Promise<void> {
    if (!this.incident() || this.isSaving()) {
      return;
    }
    this.isSaving.set(true);
    try {
      const value = this.form.getRawValue();
      await this._incidents.updateIncident(this.incidentId, {
        ...value,
        containment_summary: value.containment_summary.trim() || undefined,
        posthog_context: value.posthog_context.trim() || undefined,
        external_report_reference:
          value.external_report_reference.trim() || undefined,
        reporting_decision_summary:
          value.reporting_decision_summary.trim() || undefined,
        notes: value.notes.trim() || undefined,
      } satisfies SafetyIncidentUpdate);
      await this.load();
      this._snackbar.open($localize`Safety incident saved`, undefined, {
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to save safety incident", error);
      this._snackbar.open($localize`Failed to save safety incident`, undefined, {
        duration: 4000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  private _dateValue(value: unknown): Date | number | string | undefined {
    if (
      value &&
      typeof value === "object" &&
      "toDate" in value &&
      typeof value.toDate === "function"
    ) {
      return value.toDate() as Date;
    }
    return value instanceof Date ||
      typeof value === "number" ||
      typeof value === "string"
      ? value
      : undefined;
  }
}
