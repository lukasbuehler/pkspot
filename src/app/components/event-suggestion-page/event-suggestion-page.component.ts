import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router, RouterLink } from "@angular/router";
import { EVENT_COUNTRY_CODES } from "../../../db/schemas/EventGeography";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventAuthoringService } from "../../services/event-authoring.service";
import { MetaTagService } from "../../services/meta-tag.service";

@Component({
  selector: "app-event-suggestion-page",
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: "./event-suggestion-page.component.html",
  styleUrl: "./event-suggestion-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventSuggestionPageComponent {
  private readonly _formBuilder = inject(FormBuilder).nonNullable;
  private readonly _auth = inject(AuthenticationService);
  private readonly _ageAssurance = inject(AgeAssuranceService);
  private readonly _authoring = inject(EventAuthoringService);
  private readonly _router = inject(Router);
  private readonly _snackBar = inject(MatSnackBar);
  private readonly _meta = inject(MetaTagService);
  private readonly _locale = inject(LOCALE_ID);
  private readonly _authState = toSignal(this._auth.authState$, {
    initialValue: this._auth.authState$.value,
  });

  readonly signedIn = computed(() => !!this._authState()?.uid);
  readonly eligible = computed(
    () => this.signedIn() && this._ageAssurance.hasVerifiedAdultEligibility(),
  );
  readonly saving = signal(false);
  readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  readonly countries = EVENT_COUNTRY_CODES.map((code) => ({
    code,
    label: displayCountryName(code, this._locale),
  }));
  readonly form = this._formBuilder.group({
    name: ["", [Validators.required, Validators.maxLength(160)]],
    organizerName: ["", Validators.maxLength(160)],
    description: ["", Validators.maxLength(5_000)],
    locality: ["", Validators.maxLength(160)],
    countryCode: [""],
    startsAt: ["", Validators.required],
    endsAt: ["", Validators.required],
    sourceUrl: ["", Validators.maxLength(2_000)],
  });

  constructor() {
    this._meta.setStaticPageMetaTags(
      $localize`:@@event_suggestion.meta_title:Suggest an Event`,
      $localize`:@@event_suggestion.meta_description:Suggest a formal parkour event for staff review.`,
      undefined,
      "/events/suggest",
    );
    this._meta.setRobotsContent("noindex,nofollow");
  }

  async submit(): Promise<void> {
    if (!this.eligible()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const startsAt = dateTimeToIso(value.startsAt);
    const endsAt = dateTimeToIso(value.endsAt);
    if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      this._snackBar.open(
        $localize`:@@event_suggestion.invalid_times:Choose an end time after the start time.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 4_000 },
      );
      return;
    }
    this.saving.set(true);
    try {
      await this._authoring.submitFormalEventSuggestion({
        name: value.name,
        ...(value.organizerName.trim()
          ? { organizerName: value.organizerName }
          : {}),
        ...(value.description.trim() ? { description: value.description } : {}),
        ...(value.locality.trim() ? { locality: value.locality } : {}),
        ...(value.countryCode ? { countryCode: value.countryCode } : {}),
        startsAt,
        endsAt,
        timeZone: this.timeZone,
        ...(value.sourceUrl.trim() ? { sourceUrl: value.sourceUrl } : {}),
      });
      this._snackBar.open(
        $localize`:@@event_suggestion.submitted:Thanks — your suggestion is ready for staff review.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 5_000 },
      );
      await this._router.navigate(["/events"]);
    } catch (error) {
      console.error("Unable to submit event suggestion", error);
      this._snackBar.open(
        error instanceof Error
          ? error.message
          : $localize`:@@event_suggestion.failed:Couldn't send your suggestion. Please try again.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 6_000 },
      );
      this.saving.set(false);
    }
  }
}

function dateTimeToIso(value: string): string | null {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function displayCountryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames(locale, { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
