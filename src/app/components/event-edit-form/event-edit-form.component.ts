import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatDividerModule } from "@angular/material/divider";
import { Timestamp } from "firebase/firestore";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventSchema } from "../../../db/schemas/EventSchema";

/**
 * Admin event editor. Self-contained reactive form covering the
 * essential event fields. Reused by:
 *  - event-page (edit existing event inline; toggled via isEditing)
 *  - event-create-page (create new event)
 *
 * Specialized fields (`inline_spots`, `area_polygon`, `promo_region`,
 * `custom_markers`, `challenge_spot_map`) are intentionally left out of
 * this form — admins edit those in the Firestore console until we
 * build dedicated visual editors. The form preserves any existing
 * values for those fields on save (it merges into the input event's
 * data rather than overwriting).
 */
@Component({
  selector: "app-event-edit-form",
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatDividerModule,
  ],
  templateUrl: "./event-edit-form.component.html",
  styleUrl: "./event-edit-form.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventEditFormComponent {
  /** Existing event to edit. When null, the form is in create mode. */
  event = input<PkEvent | null>(null);

  /** Hide the Delete button (e.g., on the create page). Defaults to true when editing. */
  showDeleteButton = input<boolean>(true);

  /** Disable controls while a parent-driven save is in flight. */
  saving = input<boolean>(false);

  /** Emits the patch / new-doc data the parent should send to EventsService. */
  save = output<Partial<EventSchema>>();
  cancel = output<void>();
  delete = output<void>();

  private _fb = inject(FormBuilder);

  form: FormGroup = this._fb.group({
    name: ["", Validators.required],
    description: [""],
    slug: ["", [Validators.pattern(/^[a-z0-9-]*$/)]],
    venue_string: ["", Validators.required],
    locality_string: ["", Validators.required],
    start: ["", Validators.required],
    end: ["", Validators.required],
    url: [""],
    published: [true],
    banner_src: [""],
    banner_fit: ["cover"],
    banner_accent_color: [""],
    focus_zoom: [null as number | null],
    spot_ids_csv: [""],
    community_keys_csv: [""],
    series_ids_csv: [""],
    bounds_north: [null as number | null, Validators.required],
    bounds_south: [null as number | null, Validators.required],
    bounds_east: [null as number | null, Validators.required],
    bounds_west: [null as number | null, Validators.required],
    sponsor_name: [""],
    sponsor_url: [""],
    sponsor_logo_src: [""],
  });

  /** Whether the parent passed in an existing event (vs. create mode). */
  readonly isEditMode = computed(() => this.event() !== null);

  showDeleteConfirm = signal<boolean>(false);

  constructor() {
    // Sync the form to the input event whenever it changes (or arrives).
    effect(() => {
      const e = this.event();
      if (!e) {
        this.form.reset({
          published: true,
          banner_fit: "cover",
        });
        return;
      }
      this.form.reset({
        name: e.name,
        description: e.description ?? "",
        slug: e.slug ?? "",
        venue_string: e.venueString,
        locality_string: e.localityString,
        start: toDatetimeLocal(e.start),
        end: toDatetimeLocal(e.end),
        url: e.url ?? "",
        published: e.published,
        banner_src: e.bannerSrc ?? "",
        banner_fit: e.bannerFit,
        banner_accent_color: e.bannerAccentColor ?? "",
        focus_zoom: e.focusZoom ?? null,
        spot_ids_csv: e.spotIds.join(", "),
        community_keys_csv: e.communityKeys.join(", "),
        series_ids_csv: e.seriesIds.join(", "),
        bounds_north: e.bounds.north,
        bounds_south: e.bounds.south,
        bounds_east: e.bounds.east,
        bounds_west: e.bounds.west,
        sponsor_name: e.sponsor?.name ?? "",
        sponsor_url: e.sponsor?.url ?? "",
        sponsor_logo_src: e.sponsor?.logo_src ?? "",
      });
    });
  }

  /** Whether to show the sponsor sub-form (any sponsor field has content). */
  get hasSponsor(): boolean {
    return !!(
      this.form.value.sponsor_name ||
      this.form.value.sponsor_url ||
      this.form.value.sponsor_logo_src
    );
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.value;
    const patch: Partial<EventSchema> = {
      name: v.name!.trim(),
      description: trimOrUndefined(v.description),
      slug: trimOrUndefined(v.slug?.toLowerCase()),
      venue_string: v.venue_string!.trim(),
      locality_string: v.locality_string!.trim(),
      start: Timestamp.fromDate(new Date(v.start)),
      end: Timestamp.fromDate(new Date(v.end)),
      url: trimOrUndefined(v.url),
      published: v.published === true,
      banner_src: trimOrUndefined(v.banner_src),
      banner_fit: v.banner_fit ?? "cover",
      banner_accent_color: trimOrUndefined(v.banner_accent_color),
      focus_zoom: numberOrUndefined(v.focus_zoom),
      spot_ids: csvToArray(v.spot_ids_csv),
      community_keys: csvToArray(v.community_keys_csv),
      series_ids: csvToArray(v.series_ids_csv),
      bounds: {
        north: numberOrThrow(v.bounds_north, "bounds_north"),
        south: numberOrThrow(v.bounds_south, "bounds_south"),
        east: numberOrThrow(v.bounds_east, "bounds_east"),
        west: numberOrThrow(v.bounds_west, "bounds_west"),
      },
      sponsor:
        v.sponsor_name?.trim() ||
        v.sponsor_url?.trim() ||
        v.sponsor_logo_src?.trim()
          ? {
              name: (v.sponsor_name ?? "").trim() || "Sponsor",
              url: trimOrUndefined(v.sponsor_url),
              logo_src: trimOrUndefined(v.sponsor_logo_src),
            }
          : undefined,
    };

    this.save.emit(patch);
  }

  onCancel() {
    this.cancel.emit();
  }

  onDeleteClick() {
    this.showDeleteConfirm.set(true);
  }

  onDeleteCancel() {
    this.showDeleteConfirm.set(false);
  }

  onDeleteConfirm() {
    this.showDeleteConfirm.set(false);
    this.delete.emit();
  }
}

function trimOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function numberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberOrThrow(value: number | null | undefined, field: string): number {
  const n = numberOrUndefined(value);
  if (n === undefined) {
    throw new Error(`EventEditForm: ${field} must be a finite number.`);
  }
  return n;
}

function csvToArray(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Format a Date as `YYYY-MM-DDTHH:mm` for <input type="datetime-local">.
 * Uses local time on purpose — the input is local-time-only, so we
 * round-trip through `new Date(...)` on save which gives a proper UTC
 * Timestamp.
 */
function toDatetimeLocal(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
