import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from "@angular/material/autocomplete";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatChipsModule } from "@angular/material/chips";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";
import { MatDividerModule } from "@angular/material/divider";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatTimepickerModule } from "@angular/material/timepicker";
import { GeoPoint, Timestamp } from "firebase/firestore";
import { Event as PkEvent } from "../../../db/models/Event";
import {
  EventBoundsSchema,
  EventOrganizerSchema,
  EventSchema,
} from "../../../db/schemas/EventSchema";
import {
  OrganizationReferenceSchema,
  OrganizationSchema,
} from "../../../db/schemas/OrganizationSchema";
import { StorageBucket } from "../../../db/schemas/Media";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { SearchService } from "../../services/search.service";
import { BoundsPickerComponent } from "../bounds-picker/bounds-picker.component";
import { MediaUpload } from "../media-upload/media-upload.component";
import { SpotPickerComponent } from "../spot-picker/spot-picker.component";

type OrganizationDocument = OrganizationSchema & { id: string };
export type EventEditPatch = Omit<
  Partial<EventSchema>,
  "bounds" | "area_polygon"
> & {
  bounds?: EventBoundsSchema | null;
  area_polygon?: EventSchema["area_polygon"] | null;
};

/**
 * Admin event editor. Single reactive form for both create AND edit:
 * the Required section is always visible up top; the Optional details
 * live in an expansion panel below so creating a new event only asks
 * for the essentials.
 *
 * Pickers used:
 *   - Date + time: mat-datepicker + mat-timepicker (split internally,
 *     composed back into a Timestamp on save).
 *   - Image fields: <app-media-upload> writing to Firebase Storage
 *     under `event_media/`. On upload completion we capture the
 *     returned URL and patch the corresponding form control.
 *   - Bounds: <app-bounds-picker> (small map with a draggable +
 *     editable rectangle).
 *   - Spot list: <app-spot-picker> (chip list backed by SearchField).
 *   - Community keys: chip list auto-suggested from event center
 *     vs. published community circles. User can add / remove freely.
 *
 * Specialized fields (inline_spots, area_polygon, promo_region,
 * custom_markers, challenge_spot_map, structured_data) are still
 * Firestore-console territory — they're preserved on save via the
 * patch surface (we only emit the fields this form owns).
 */
@Component({
  selector: "app-event-edit-form",
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatDividerModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTimepickerModule,
    BoundsPickerComponent,
    MediaUpload,
    SpotPickerComponent,
  ],
  templateUrl: "./event-edit-form.component.html",
  styleUrl: "./event-edit-form.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventEditFormComponent {
  /** Existing event to edit. When null, the form is in create mode. */
  event = input<PkEvent | null>(null);

  /** Hide the Delete button (e.g., on the create page). */
  showDeleteButton = input<boolean>(true);

  /** Disable controls while a parent-driven save is in flight. */
  saving = input<boolean>(false);

  /** Emits the patch / new-doc data the parent should send to EventsService. */
  save = output<EventEditPatch>();
  cancel = output<void>();
  delete = output<void>();

  private _fb = inject(FormBuilder);
  private _searchService = inject(SearchService);
  private _organizationsService = inject(OrganizationsService);

  /** Storage folder for banner / logo / sponsor-logo uploads. */
  readonly eventMediaBucket = StorageBucket.EventMedia;

  // ---------------------------------------------------------------------
  // Form structure
  //
  // Required section (always visible): name, venue, locality, dates,
  // bounds (via the map picker).
  //
  // Everything else lives under the Optional details expansion below.
  // Dates are split into _date / _time controls and recomposed in
  // onSubmit so we can use the friendlier pickers.
  // ---------------------------------------------------------------------
  form: FormGroup = this._fb.group({
    name: ["", Validators.required],
    venue_string: ["", Validators.required],
    locality_string: ["", Validators.required],
    location_lat: [null as number | null, Validators.required],
    location_lng: [null as number | null, Validators.required],
    start_date: [null as Date | null, Validators.required],
    start_time: [null as Date | null, Validators.required],
    end_date: [null as Date | null, Validators.required],
    end_time: [null as Date | null, Validators.required],

    // Optional
    description: [""],
    slug: ["", [Validators.pattern(/^[a-z0-9-]*$/)]],
    organizer_query: [""],
    url: [""],
    published: [true],
    banner_src: [""],
    banner_fit: ["cover"],
    banner_accent_color: [""],
    logo_src: [""],
    focus_zoom: [null as number | null],
    series_ids_csv: [""],
    sponsor_name: [""],
    sponsor_url: [""],
    sponsor_logo_src: [""],
  });

  /**
   * Event location and optional area state — kept outside the FormGroup
   * because the map picker edits richer objects than flat form controls.
   */
  location = signal<{ lat: number; lng: number } | null>(null);
  areaPath = signal<Array<{ lat: number; lng: number }> | null>(null);
  bounds = signal<EventBoundsSchema | null>(null);
  areaTouched = signal<boolean>(false);
  /**
   * Spot IDs the event highlights. Kept outside the FormGroup for
   * the same reason — chip list rather than a scalar form control.
   */
  spotIds = signal<string[]>([]);
  /**
   * Community keys to attach. Pre-filled from the event's existing
   * keys, augmented with auto-suggestions derived from the center of
   * the bounds rectangle.
   */
  communityKeys = signal<string[]>([]);
  /** Organizations loaded for the admin-only organizer autocomplete. */
  organizations = signal<OrganizationDocument[]>([]);
  organizerQuery = signal<string>("");
  selectedOrganizer = signal<OrganizationReferenceSchema | null>(null);
  /** Community keys auto-suggested from the current bounds center. */
  autoSuggestedCommunityKeys = signal<string[]>([]);

  /** Whether the parent passed in an existing event (vs. create mode). */
  readonly isEditMode = computed(() => this.event() !== null);

  /** Center of the bounds rectangle — used for community auto-suggest. */
  readonly boundsCenter = computed(() => {
    const b = this.bounds();
    if (!b) return null;
    return {
      lat: (b.north + b.south) / 2,
      lng: (b.east + b.west) / 2,
    };
  });

  /** True if the form has at least one optional field populated (for expansion default-open). */
  readonly hasAnyOptionalValues = computed(() => {
    const e = this.event();
    if (!e) return false;
    return !!(
      e.description ||
      e.slug ||
      e.url ||
      e.organizer ||
      e.location ||
      e.bannerSrc ||
      e.logoSrc ||
      e.sponsor ||
      e.focusZoom ||
      (e.seriesIds && e.seriesIds.length > 0)
    );
  });

  showDeleteConfirm = signal<boolean>(false);

  readonly filteredOrganizations = computed(() => {
    const query = this.organizerQuery().trim().toLowerCase();
    const organizations = this.organizations();
    if (!query) return organizations.slice(0, 20);
    return organizations
      .filter((organization) => {
        const haystack = [
          organization.name,
          organization.slug,
          organization.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 20);
  });

  readonly displayOrganization = (
    value: OrganizationDocument | string | null,
  ): string => {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value.name;
  };

  constructor() {
    // Sync the form to the input event whenever it changes (or arrives).
    effect(() => {
      const e = this.event();
      if (!e) {
        this.form.reset({
          published: true,
          banner_fit: "cover",
        });
        this.location.set(null);
        this.areaPath.set(null);
        this.bounds.set(null);
        this.areaTouched.set(false);
        this.spotIds.set([]);
        this.communityKeys.set([]);
        this.selectedOrganizer.set(null);
        this.organizerQuery.set("");
        return;
      }
      this.form.reset({
        name: e.name,
        description: e.description ?? "",
        slug: e.slug ?? "",
        organizer_query: e.organizer?.organization.name ?? "",
        venue_string: e.venueString,
        locality_string: e.localityString,
        location_lat: e.location?.lat ?? null,
        location_lng: e.location?.lng ?? null,
        start_date: e.start,
        start_time: e.start,
        end_date: e.end,
        end_time: e.end,
        url: e.url ?? "",
        published: e.published,
        banner_src: e.bannerSrc ?? "",
        banner_fit: e.bannerFit,
        banner_accent_color: e.bannerAccentColor ?? "",
        logo_src: e.logoSrc ?? "",
        focus_zoom: e.focusZoom ?? null,
        series_ids_csv: e.seriesIds.join(", "),
        sponsor_name: e.sponsor?.name ?? "",
        sponsor_url: e.sponsor?.url ?? "",
        sponsor_logo_src: e.sponsor?.logo_src ?? "",
      });
      this.location.set(e.location);
      this.areaPath.set(eventAreaPath(e.areaPolygon) ?? boundsToPath(e.bounds));
      this.bounds.set(e.bounds ?? null);
      this.areaTouched.set(false);
      this.spotIds.set([...e.spotIds]);
      this.communityKeys.set([...e.communityKeys]);
      this.selectedOrganizer.set(e.organizer?.organization ?? null);
      this.organizerQuery.set(e.organizer?.organization.name ?? "");
    });

    this._loadOrganizations();

    // Recompute auto-suggested communities whenever the bounds center
    // moves. Cheap — `listCommunities()` is in-memory after first call
    // (Typesense response cached by SearchService).
    effect(() => {
      const center = this.boundsCenter();
      if (!center) {
        this.autoSuggestedCommunityKeys.set([]);
        return;
      }
      this._refreshSuggestedCommunities(center);
    });
  }

  /**
   * Suggested community keys that aren't already in the user's
   * `communityKeys` selection — these are the chips we offer with a
   * "+ Add" affordance.
   */
  readonly newSuggestedCommunities = computed(() => {
    const current = new Set(this.communityKeys());
    return this.autoSuggestedCommunityKeys().filter((k) => !current.has(k));
  });

  onAreaChange(path: Array<{ lat: number; lng: number }> | null): void {
    this.areaPath.set(path);
    this.bounds.set(pathToBounds(path));
    this.areaTouched.set(true);
  }

  onLocationInputChange(): void {
    const lat = numberOrUndefined(this.form.value.location_lat);
    const lng = numberOrUndefined(this.form.value.location_lng);
    if (lat === undefined || lng === undefined) return;
    this.location.set({ lat, lng });
  }

  onLocationChange(location: { lat: number; lng: number }): void {
    this.location.set(location);
    this.form.patchValue({
      location_lat: location.lat,
      location_lng: location.lng,
    });
  }

  onSpotIdsChange(ids: string[]): void {
    this.spotIds.set(ids);
  }

  onOrganizerInput(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const value = input?.value ?? "";
    this.organizerQuery.set(value);
    if (value.trim() !== this.selectedOrganizer()?.name) {
      this.selectedOrganizer.set(null);
    }
  }

  onOrganizerSelected(event: MatAutocompleteSelectedEvent): void {
    const organization = event.option.value as OrganizationDocument;
    const reference = this._organizationsService.makeReference(organization);
    this.selectedOrganizer.set(reference);
    this.organizerQuery.set(reference.name);
    this.form.patchValue({ organizer_query: reference.name });
  }

  removeCommunityKey(key: string): void {
    this.communityKeys.update((keys) => keys.filter((k) => k !== key));
  }

  addCommunityKey(key: string): void {
    this.communityKeys.update((keys) =>
      keys.includes(key) ? keys : [...keys, key]
    );
  }

  /**
   * Handle a new image upload from any of the three MediaUpload slots.
   * The MediaUpload component emits the resulting storage URL via
   * `newMedia.src`; we patch the corresponding form control with it.
   */
  onBannerUploaded(event: { src: string }): void {
    this.form.patchValue({ banner_src: event.src });
  }

  onLogoUploaded(event: { src: string }): void {
    this.form.patchValue({ logo_src: event.src });
  }

  onSponsorLogoUploaded(event: { src: string }): void {
    this.form.patchValue({ sponsor_logo_src: event.src });
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.value;
    const start = combineDateAndTime(v.start_date, v.start_time);
    const end = combineDateAndTime(v.end_date, v.end_time);
    if (!start || !end) {
      this.form.markAllAsTouched();
      return;
    }

    const patch: EventEditPatch = {
      ...this._buildLocationPatch(v.location_lat, v.location_lng),
      ...this._buildGeometryPatch(),
      name: v.name!.trim(),
      description: trimOrUndefined(v.description),
      slug: trimOrUndefined(v.slug?.toLowerCase()),
      venue_string: v.venue_string!.trim(),
      locality_string: v.locality_string!.trim(),
      start: Timestamp.fromDate(start),
      end: Timestamp.fromDate(end),
      url: trimOrUndefined(v.url),
      published: v.published === true,
      banner_src: trimOrUndefined(v.banner_src),
      banner_fit: v.banner_fit ?? "cover",
      banner_accent_color: trimOrUndefined(v.banner_accent_color),
      logo_src: trimOrUndefined(v.logo_src),
      focus_zoom: numberOrUndefined(v.focus_zoom),
      spot_ids: [...this.spotIds()],
      community_keys: [...this.communityKeys()],
      series_ids: csvToArray(v.series_ids_csv),
      organizer: this._buildOrganizerPatch(),
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

  private async _refreshSuggestedCommunities(center: {
    lat: number;
    lng: number;
  }): Promise<void> {
    try {
      const communities = await this._searchService.listCommunities();
      const matches = communities
        .filter((c) => {
          if (!c.boundsCenter || typeof c.boundsRadiusM !== "number") {
            return false;
          }
          return this._isPointInsideCircle(
            center,
            { lat: c.boundsCenter[0], lng: c.boundsCenter[1] },
            c.boundsRadiusM
          );
        })
        .map((c) => c.communityKey);
      this.autoSuggestedCommunityKeys.set(matches);

      // On first arrival (no community keys yet on a fresh event), pre-fill.
      // We don't auto-add later to respect manual edits the admin makes.
      const isCreateMode = untracked(() => !this.event());
      const current = untracked(() => this.communityKeys());
      if (isCreateMode && current.length === 0 && matches.length > 0) {
        this.communityKeys.set([...matches]);
      }
    } catch (err) {
      console.warn("EventEditForm: community auto-suggest failed", err);
      this.autoSuggestedCommunityKeys.set([]);
    }
  }

  private async _loadOrganizations(): Promise<void> {
    try {
      this.organizations.set(
        await this._organizationsService.getOrganizations(),
      );
    } catch (err) {
      console.warn("EventEditForm: organization autocomplete failed", err);
      this.organizations.set([]);
    }
  }

  private _buildOrganizerPatch(): EventOrganizerSchema | undefined {
    const organization = this.selectedOrganizer();
    return organization
      ? {
          type: "organization",
          organization,
        }
      : undefined;
  }

  private _buildLocationPatch(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
  ): Pick<Partial<EventSchema>, "location" | "location_raw"> {
    const lat = numberOrUndefined(latitude);
    const lng = numberOrUndefined(longitude);
    return lat !== undefined && lng !== undefined
      ? {
          location: new GeoPoint(lat, lng),
          location_raw: { lat, lng },
        }
      : {};
  }

  private _buildGeometryPatch(): Pick<
    EventEditPatch,
    "bounds" | "area_polygon"
  > {
    if (!this.areaTouched()) {
      return {};
    }
    const path = this.areaPath();
    const bounds = pathToBounds(path);
    if (!path || !bounds) {
      return {
        bounds: null,
        area_polygon: null,
      };
    }
    return {
      bounds,
      area_polygon: pathToAreaPolygon(path),
    };
  }

  /** Approximate point-in-circle test in meters via haversine. */
  private _isPointInsideCircle(
    point: { lat: number; lng: number },
    center: { lat: number; lng: number },
    radiusM: number
  ): boolean {
    const R = 6371e3;
    const φ1 = (center.lat * Math.PI) / 180;
    const φ2 = (point.lat * Math.PI) / 180;
    const Δφ = ((point.lat - center.lat) * Math.PI) / 180;
    const Δλ = ((point.lng - center.lng) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const distance = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return distance <= radiusM;
  }
}

function pathToAreaPolygon(
  path: Array<{ lat: number; lng: number }>
): EventSchema["area_polygon"] {
  return [
    {
      points: [
        { lat: -85, lng: -180 },
        { lat: -85, lng: 180 },
        { lat: 85, lng: 180 },
        { lat: 85, lng: -180 },
      ],
    },
    {
      points: path,
    },
  ];
}

function eventAreaPath(
  areaPolygon: EventSchema["area_polygon"] | undefined
): Array<{ lat: number; lng: number }> | null {
  const ring = areaPolygon?.find((candidate) =>
    candidate.points.every((point) => Math.abs(point.lat) < 85)
  );
  return ring && ring.points.length >= 3 ? [...ring.points] : null;
}

function boundsToPath(
  bounds: EventBoundsSchema | undefined
): Array<{ lat: number; lng: number }> | null {
  if (!bounds) return null;
  return [
    { lat: bounds.north, lng: bounds.west },
    { lat: bounds.north, lng: bounds.east },
    { lat: bounds.south, lng: bounds.east },
    { lat: bounds.south, lng: bounds.west },
  ];
}

function pathToBounds(
  path: Array<{ lat: number; lng: number }> | null
): EventBoundsSchema | null {
  if (!path || path.length < 3) return null;
  return path.reduce(
    (acc, point) => ({
      north: Math.max(acc.north, point.lat),
      south: Math.min(acc.south, point.lat),
      east: Math.max(acc.east, point.lng),
      west: Math.min(acc.west, point.lng),
    }),
    {
      north: Number.NEGATIVE_INFINITY,
      south: Number.POSITIVE_INFINITY,
      east: Number.NEGATIVE_INFINITY,
      west: Number.POSITIVE_INFINITY,
    }
  );
}

function trimOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function numberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function csvToArray(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Compose a date-only `Date` and a time-only `Date` (from mat-datepicker
 * + mat-timepicker respectively) into a single `Date`. The date side
 * provides year/month/day; the time side provides hours/minutes.
 */
function combineDateAndTime(
  date: Date | string | null | undefined,
  time: Date | string | null | undefined
): Date | null {
  const d = date instanceof Date ? date : date ? new Date(date) : null;
  const t = time instanceof Date ? time : time ? new Date(time) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const out = new Date(d.getTime());
  if (t && !Number.isNaN(t.getTime())) {
    out.setHours(t.getHours(), t.getMinutes(), 0, 0);
  } else {
    out.setHours(0, 0, 0, 0);
  }
  return out;
}
