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
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
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
import { Timestamp } from "@angular/fire/firestore";
import { Event as PkEvent } from "../../../db/models/Event";
import {
  EventBoundsSchema,
  EventCategory,
  EventCustomMarkerSchema,
  EventLinkKind,
  EventLinkSchema,
  EventOrganizerSchema,
  EventProgramItemSchema,
  EventProgramPlanKind,
  EventProgramPlanSchema,
  EventProgramSchema,
  EventProgramSpotRefSchema,
  EventProgramItemStatus,
  EventSchema,
  EventQualificationPathSchema,
  EventQualificationRefSchema,
  EventQualificationRequirementMode,
  EventSeriesMembershipSchema,
  EventSeriesRole,
  EventTicketAvailability,
  EventTicketBadge,
  EventTicketOptionSchema,
} from "../../../db/schemas/EventSchema";
import {
  OrganizationReferenceSchema,
  OrganizationSchema,
} from "../../../db/schemas/OrganizationSchema";
import { MediaSchema, StorageBucket } from "../../../db/schemas/Media";
import { LocaleMap, MediaType } from "../../../db/models/Interfaces";
import { makeLocaleMapFromObject } from "../../../scripts/LanguageHelpers";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { SearchService } from "../../services/search.service";
import { BoundsPickerComponent } from "../bounds-picker/bounds-picker.component";
import { MediaUpload } from "../media-upload/media-upload.component";
import { MarkerComponent } from "../marker/marker.component";
import { SpotPickerComponent } from "../spot-picker/spot-picker.component";
import { LocaleMapEditFieldComponent } from "../locale-map-edit-field/locale-map-edit-field.component";

type OrganizationDocument = OrganizationSchema & { id: string };
type EditableEventMarker = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  icons: string;
  color: "primary" | "secondary" | "tertiary" | "gray";
  priority: "auto" | "required";
};
type EditableEventLink = {
  id: string;
  label: string;
  url: string;
  kind: EventLinkKind;
  primary: boolean;
  provider: string;
};
type EditableTicketOption = {
  id: string;
  label: string;
  labelI18n?: LocaleMap;
  description: string;
  descriptionI18n?: LocaleMap;
  url: string;
  currency: string;
  amount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  availability: EventTicketAvailability;
  badge: EventTicketBadge | "";
  saleStartsAt: string;
  saleEndsAt: string;
};
type EditableProgramItem = {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  start: string;
  end: string;
  spotRefKind: EventProgramSpotRefSchema["kind"] | "";
  spotRefId: string;
  status: EventProgramItemStatus;
  linkedEventId: string;
  preserved: Partial<
    Omit<
      EventProgramItemSchema,
      | "id"
      | "title"
      | "description"
      | "category"
      | "start"
      | "end"
      | "spot_ref"
      | "status"
      | "linked_event_id"
    >
  >;
};
type EditableProgramPlan = {
  id: string;
  label: string;
  kind: EventProgramPlanKind;
  conditionLabel: string;
  items: EditableProgramItem[];
  preserved: Partial<
    Omit<
      EventProgramPlanSchema,
      "id" | "label" | "kind" | "condition_label" | "items"
    >
  >;
};
type EditableQualificationRef = {
  id: string;
  kind: EventQualificationRefSchema["kind"];
  eventId: string;
  programItemId: string;
};
type EditableQualificationPath = {
  id: string;
  label: string;
  requirementMode: EventQualificationRequirementMode;
  requirements: EditableQualificationRef[];
  preserved: Partial<
    Omit<
      EventQualificationPathSchema,
      "id" | "label" | "requirement_mode" | "requirements"
    >
  >;
};
type EditableSeriesMembership = {
  id: string;
  seriesId: string;
  role: EventSeriesRole;
  qualificationRequired: boolean;
  qualificationHint: string;
  sourceUrl: string;
  qualifiesTo: EditableQualificationRef[];
  qualificationPaths: EditableQualificationPath[];
  preserved: Partial<
    Omit<
      EventSeriesMembershipSchema,
      | "series_id"
      | "role"
      | "qualification_required"
      | "qualification_hint"
      | "source_url"
      | "qualifies_to"
      | "qualification_paths"
    >
  >;
};
export type EventEditPatch = Omit<
  Partial<EventSchema>,
  "bounds" | "area_polygon" | "location"
> & {
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
 *   - Area: <app-bounds-picker> (small map with a draggable event pin +
 *     editable area polygon).
 *   - Spot list: <app-spot-picker> (chip list backed by SearchField).
 *   - Community keys: chip list auto-suggested from event center
 *     vs. published community circles. User can add / remove freely.
 *
 * Specialized fields (inline_spots, area_polygon, promo_region,
 * custom_markers, challenge_spot_map) are still Firestore-console territory
 * — they're preserved on save via the patch surface (we only emit the fields
 * this form owns).
 */
@Component({
  selector: "app-event-edit-form",
  imports: [
    CommonModule,
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
    MarkerComponent,
    SpotPickerComponent,
    LocaleMapEditFieldComponent,
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
  private _loadedEventId: string | null = null;
  @ViewChild(BoundsPickerComponent) private _boundsPicker?: BoundsPickerComponent;

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
    external_media_url: [""],
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
  customMarkers = signal<EditableEventMarker[]>([]);
  externalMedia = signal<MediaSchema[]>([]);
  eventLinks = signal<EditableEventLink[]>([]);
  ticketOptions = signal<EditableTicketOption[]>([]);
  programPlans = signal<EditableProgramPlan[]>([]);
  activeProgramPlanId = signal<string>("");
  seriesMemberships = signal<EditableSeriesMembership[]>([]);
  private _descriptionLocaleMap = signal<LocaleMap | undefined>(undefined);

  /** Whether the parent passed in an existing event (vs. create mode). */
  readonly isEditMode = computed(() => this.event() !== null);

  /** Center of the bounds rectangle — used for community auto-suggest. */
  readonly boundsCenter = computed(() => {
    const b = pathToBounds(this.areaPath()) ?? this.bounds();
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
        this._loadedEventId = null;
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
        this.customMarkers.set([]);
        this.externalMedia.set([]);
        this.eventLinks.set([]);
        this.ticketOptions.set([]);
        this.programPlans.set([]);
        this.activeProgramPlanId.set("");
        this.seriesMemberships.set([]);
        this._descriptionLocaleMap.set(undefined);
        return;
      }
      if (this._loadedEventId === e.id) {
        return;
      }
      this._loadedEventId = e.id;
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
        external_media_url: "",
      });
      this.location.set(e.location);
      this.areaPath.set(eventAreaPath(e.areaPolygon));
      this.bounds.set(e.bounds ?? null);
      this.areaTouched.set(false);
      this.spotIds.set([...e.spotIds]);
      this.communityKeys.set([...e.communityKeys]);
      this.selectedOrganizer.set(e.organizer?.organization ?? null);
      this.organizerQuery.set(e.organizer?.organization.name ?? "");
      this.customMarkers.set(
        e.customMarkers.map((marker, index) => ({
          id: `marker-${index}`,
          name: marker.name ?? "",
          lat: marker.location.lat,
          lng: marker.location.lng,
          icons: (marker.icons ?? ["info"]).join(", "),
          color: marker.color ?? "tertiary",
          priority: marker.priority === "required" ? "required" : "auto",
        })),
      );
      this.externalMedia.set([...e.media]);
      this.eventLinks.set(
        e.eventLinks.map((link, index) => ({
          id: `link-${index}`,
          label: link.label,
          url: link.url,
          kind: link.kind,
          primary: link.primary === true,
          provider: link.provider ?? "",
        })),
      );
      this.ticketOptions.set(
        e.ticketOptions.map((ticket, index) => ({
          id: ticket.id || `ticket-${index}`,
          label: ticket.label,
          labelI18n: ticket.labelI18n,
          description: ticket.description ?? "",
          descriptionI18n: ticket.descriptionI18n,
          url: ticket.url ?? "",
          currency: ticket.price?.currency ?? "CHF",
          amount:
            ticket.price && "amount" in ticket.price
              ? ticket.price.amount
              : null,
          minAmount:
            ticket.price && "min_amount" in ticket.price
              ? ticket.price.min_amount
              : null,
          maxAmount:
            ticket.price && "max_amount" in ticket.price
              ? ticket.price.max_amount
              : null,
          availability: ticket.availability ?? "available",
          badge: ticket.badge ?? "",
          saleStartsAt: dateInputValue(ticket.saleStartsAt),
          saleEndsAt: dateInputValue(ticket.saleEndsAt),
        })),
      );
      this.programPlans.set(
        (e.program?.plans ?? []).map((plan) => ({
          id: plan.id,
          label: plan.label,
          kind: plan.kind,
          conditionLabel: plan.condition_label ?? "",
          preserved: {
            label_i18n: plan.label_i18n,
            condition_label_i18n: plan.condition_label_i18n,
          },
          items: plan.items.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description ?? "",
            category: item.category,
            start: dateTimeLocalValue(item.start),
            end: dateTimeLocalValue(item.end),
            spotRefKind: item.spot_ref?.kind ?? "",
            spotRefId: item.spot_ref?.id ?? "",
            status: item.status ?? "scheduled",
            linkedEventId: item.linked_event_id ?? "",
            preserved: {
              title_i18n: item.title_i18n,
              description_i18n: item.description_i18n,
              runtime_override: item.runtimeOverride
                ? {
                    ...item.runtimeOverride,
                    start: item.runtimeOverride.start
                      ? Timestamp.fromDate(item.runtimeOverride.start)
                      : undefined,
                    end: item.runtimeOverride.end
                      ? Timestamp.fromDate(item.runtimeOverride.end)
                      : undefined,
                  }
                : undefined,
              series_memberships: item.series_memberships,
              participation: item.participation,
            },
          })),
        })),
      );
      this.activeProgramPlanId.set(e.program?.active_plan_id ?? "");
      this.seriesMemberships.set(
        e.seriesMemberships.map((membership, index) =>
          editableSeriesMembership(membership, index),
        ),
      );
      this._descriptionLocaleMap.set(e.descriptions);
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

  addCustomMarker(): void {
    const location = this.location();
    this.customMarkers.update((markers) => [
      ...markers,
      {
        id: `marker-${Date.now()}-${markers.length}`,
        name: "",
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        icons: "info",
        color: "tertiary",
        priority: "auto",
      },
    ]);
  }

  removeCustomMarker(id: string): void {
    this.customMarkers.update((markers) =>
      markers.filter((marker) => marker.id !== id),
    );
  }

  markerIcons(marker: EditableEventMarker): string[] {
    const icons = csvToArray(marker.icons);
    return icons.length > 0 ? icons : ["info"];
  }

  updateCustomMarker(
    id: string,
    patch: Partial<Omit<EditableEventMarker, "id">>,
  ): void {
    this.customMarkers.update((markers) =>
      markers.map((marker) =>
        marker.id === id ? { ...marker, ...patch } : marker,
      ),
    );
  }

  updateCustomMarkerColor(id: string, color: string): void {
    if (
      color === "primary" ||
      color === "secondary" ||
      color === "tertiary" ||
      color === "gray"
    ) {
      this.updateCustomMarker(id, { color });
    }
  }

  updateCustomMarkerPriority(id: string, priority: string): void {
    if (priority === "auto" || priority === "required") {
      this.updateCustomMarker(id, { priority });
    }
  }

  updateCustomMarkerCoordinate(
    id: string,
    field: "lat" | "lng",
    value: number,
  ): void {
    this.updateCustomMarker(id, {
      [field]: Number.isFinite(value) ? value : null,
    });
  }

  addExternalMediaFromUrl(): void {
    const url = safeExternalUrl(this.form.value.external_media_url);
    if (!url) {
      this.form.controls["external_media_url"].setErrors({ url: true });
      return;
    }

    this.externalMedia.update((items) =>
      items.some((item) => item.src === url)
        ? items
        : [
            ...items,
            {
              src: url,
              type: inferMediaType(url),
              isInStorage: false,
              origin: "other",
            },
          ],
    );
    this.form.patchValue({ external_media_url: "" });
    this.form.controls["external_media_url"].setErrors(null);
  }

  removeExternalMedia(src: string): void {
    this.externalMedia.update((items) =>
      items.filter((item) => item.src !== src),
    );
  }

  addEventLink(): void {
    this.eventLinks.update((links) => [
      ...links,
      {
        id: `link-${Date.now()}-${links.length}`,
        label: "",
        url: "",
        kind: "website",
        primary: links.length === 0,
        provider: "",
      },
    ]);
  }

  updateEventLink(id: string, patch: Partial<Omit<EditableEventLink, "id">>): void {
    this.eventLinks.update((links) =>
      links.map((link) => (link.id === id ? { ...link, ...patch } : link)),
    );
  }

  updateEventLinkKind(id: string, kind: string): void {
    if (isEventLinkKind(kind)) {
      this.updateEventLink(id, { kind });
    }
  }

  removeEventLink(id: string): void {
    this.eventLinks.update((links) => links.filter((link) => link.id !== id));
  }

  addTicketOption(): void {
    this.ticketOptions.update((tickets) => [
      ...tickets,
      {
        id: `ticket-${Date.now()}-${tickets.length}`,
        label: "",
        description: "",
        url: "",
        currency: "CHF",
        amount: null,
        minAmount: null,
        maxAmount: null,
        availability: "available",
        badge: "",
        saleStartsAt: "",
        saleEndsAt: "",
      },
    ]);
  }

  updateTicketOption(
    id: string,
    patch: Partial<Omit<EditableTicketOption, "id">>,
  ): void {
    this.ticketOptions.update((tickets) =>
      tickets.map((ticket) =>
        ticket.id === id ? { ...ticket, ...patch } : ticket,
      ),
    );
  }

  updateTicketAvailability(id: string, availability: string): void {
    if (isTicketAvailability(availability)) {
      this.updateTicketOption(id, { availability });
    }
  }

  updateTicketBadge(id: string, badge: string): void {
    if (badge === "" || isTicketBadge(badge)) {
      this.updateTicketOption(id, { badge });
    }
  }

  updateTicketNumber(
    id: string,
    field: "amount" | "minAmount" | "maxAmount",
    value: number,
  ): void {
    this.updateTicketOption(id, {
      [field]: Number.isFinite(value) ? value : null,
    });
  }

  removeTicketOption(id: string): void {
    this.ticketOptions.update((tickets) =>
      tickets.filter((ticket) => ticket.id !== id),
    );
  }

  addProgramPlan(): void {
    this.programPlans.update((plans) => {
      const id = `plan-${Date.now()}-${plans.length}`;
      if (!this.activeProgramPlanId()) {
        this.activeProgramPlanId.set(id);
      }
      return [
        ...plans,
        {
          id,
          label: plans.length === 0 ? "Main program" : "Alternate plan",
          kind: plans.length === 0 ? "main" : "alternate",
          conditionLabel: "",
          items: [],
          preserved: {},
        },
      ];
    });
  }

  removeProgramPlan(id: string): void {
    this.programPlans.update((plans) => plans.filter((plan) => plan.id !== id));
    if (this.activeProgramPlanId() === id) {
      this.activeProgramPlanId.set(this.programPlans()[0]?.id ?? "");
    }
  }

  updateProgramPlan(
    id: string,
    patch: Partial<Omit<EditableProgramPlan, "id" | "items" | "preserved">>,
  ): void {
    this.programPlans.update((plans) =>
      plans.map((plan) => (plan.id === id ? { ...plan, ...patch } : plan)),
    );
  }

  updateProgramPlanKind(id: string, kind: string): void {
    if (kind === "main" || kind === "alternate") {
      this.updateProgramPlan(id, { kind });
    }
  }

  addProgramItem(planId: string): void {
    this.programPlans.update((plans) =>
      plans.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              items: [
                ...plan.items,
                {
                  id: `item-${Date.now()}-${plan.items.length}`,
                  title: "",
                  description: "",
                  category: "other",
                  start: "",
                  end: "",
                  spotRefKind: "",
                  spotRefId: "",
                  status: "scheduled",
                  linkedEventId: "",
                  preserved: {},
                },
              ],
            }
          : plan,
      ),
    );
  }

  removeProgramItem(planId: string, itemId: string): void {
    this.programPlans.update((plans) =>
      plans.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              items: plan.items.filter((item) => item.id !== itemId),
            }
          : plan,
      ),
    );
  }

  updateProgramItem(
    planId: string,
    itemId: string,
    patch: Partial<Omit<EditableProgramItem, "id" | "preserved">>,
  ): void {
    this.programPlans.update((plans) =>
      plans.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              items: plan.items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item,
              ),
            }
          : plan,
      ),
    );
  }

  updateProgramItemCategory(
    planId: string,
    itemId: string,
    category: string,
  ): void {
    if (isEventCategory(category)) {
      this.updateProgramItem(planId, itemId, { category });
    }
  }

  updateProgramItemStatus(
    planId: string,
    itemId: string,
    status: string,
  ): void {
    if (isProgramItemStatus(status)) {
      this.updateProgramItem(planId, itemId, { status });
    }
  }

  updateProgramSpotRefKind(
    planId: string,
    itemId: string,
    kind: string,
  ): void {
    if (kind === "" || kind === "spot" || kind === "inline_spot") {
      this.updateProgramItem(planId, itemId, { spotRefKind: kind });
    }
  }

  addSeriesMembership(): void {
    this.seriesMemberships.update((memberships) => [
      ...memberships,
      {
        id: `membership-${Date.now()}-${memberships.length}`,
        seriesId: "",
        role: "series_event",
        qualificationRequired: false,
        qualificationHint: "",
        sourceUrl: "",
        qualifiesTo: [],
        qualificationPaths: [],
        preserved: {},
      },
    ]);
  }

  removeSeriesMembership(id: string): void {
    this.seriesMemberships.update((memberships) =>
      memberships.filter((membership) => membership.id !== id),
    );
  }

  updateSeriesMembership(
    id: string,
    patch: Partial<
      Omit<
        EditableSeriesMembership,
        | "id"
        | "qualifiesTo"
        | "qualificationPaths"
        | "preserved"
      >
    >,
  ): void {
    this.seriesMemberships.update((memberships) =>
      memberships.map((membership) =>
        membership.id === id ? { ...membership, ...patch } : membership,
      ),
    );
  }

  updateSeriesMembershipRole(id: string, role: string): void {
    if (isSeriesRole(role)) {
      this.updateSeriesMembership(id, { role });
    }
  }

  addQualificationTarget(membershipId: string): void {
    this.seriesMemberships.update((memberships) =>
      memberships.map((membership) =>
        membership.id === membershipId
          ? {
              ...membership,
              qualifiesTo: [
                ...membership.qualifiesTo,
                this._newQualificationRef(membership.qualifiesTo.length),
              ],
            }
          : membership,
      ),
    );
  }

  removeQualificationTarget(membershipId: string, refId: string): void {
    this.seriesMemberships.update((memberships) =>
      memberships.map((membership) =>
        membership.id === membershipId
          ? {
              ...membership,
              qualifiesTo: membership.qualifiesTo.filter(
                (ref) => ref.id !== refId,
              ),
            }
          : membership,
      ),
    );
  }

  updateQualificationTarget(
    membershipId: string,
    refId: string,
    patch: Partial<Omit<EditableQualificationRef, "id">>,
  ): void {
    this.seriesMemberships.update((memberships) =>
      memberships.map((membership) =>
        membership.id === membershipId
          ? {
              ...membership,
              qualifiesTo: membership.qualifiesTo.map((ref) =>
                ref.id === refId ? { ...ref, ...patch } : ref,
              ),
            }
          : membership,
      ),
    );
  }

  updateQualificationTargetKind(
    membershipId: string,
    refId: string,
    kind: string,
  ): void {
    if (isQualificationRefKind(kind)) {
      this.updateQualificationTarget(membershipId, refId, { kind });
    }
  }

  addQualificationPath(membershipId: string): void {
    this.seriesMemberships.update((memberships) =>
      memberships.map((membership) =>
        membership.id === membershipId
          ? {
              ...membership,
              qualificationPaths: [
                ...membership.qualificationPaths,
                {
                  id: `path-${Date.now()}-${membership.qualificationPaths.length}`,
                  label: "",
                  requirementMode: "any",
                  requirements: [],
                  preserved: {},
                },
              ],
            }
          : membership,
      ),
    );
  }

  removeQualificationPath(membershipId: string, pathId: string): void {
    this.seriesMemberships.update((memberships) =>
      memberships.map((membership) =>
        membership.id === membershipId
          ? {
              ...membership,
              qualificationPaths: membership.qualificationPaths.filter(
                (path) => path.id !== pathId,
              ),
            }
          : membership,
      ),
    );
  }

  updateQualificationPath(
    membershipId: string,
    pathId: string,
    patch: Partial<
      Omit<EditableQualificationPath, "requirements" | "preserved">
    >,
  ): void {
    this.seriesMemberships.update((memberships) =>
      memberships.map((membership) =>
        membership.id === membershipId
          ? {
              ...membership,
              qualificationPaths: membership.qualificationPaths.map((path) =>
                path.id === pathId ? { ...path, ...patch } : path,
              ),
            }
          : membership,
      ),
    );
  }

  updateQualificationPathRequirementMode(
    membershipId: string,
    pathId: string,
    requirementMode: string,
  ): void {
    if (requirementMode === "any" || requirementMode === "all") {
      this.updateQualificationPath(membershipId, pathId, { requirementMode });
    }
  }

  addQualificationRequirement(membershipId: string, pathId: string): void {
    this.seriesMemberships.update((memberships) =>
      memberships.map((membership) =>
        membership.id === membershipId
          ? {
              ...membership,
              qualificationPaths: membership.qualificationPaths.map((path) =>
                path.id === pathId
                  ? {
                      ...path,
                      requirements: [
                        ...path.requirements,
                        this._newQualificationRef(path.requirements.length),
                      ],
                    }
                  : path,
              ),
            }
          : membership,
      ),
    );
  }

  removeQualificationRequirement(
    membershipId: string,
    pathId: string,
    refId: string,
  ): void {
    this.seriesMemberships.update((memberships) =>
      memberships.map((membership) =>
        membership.id === membershipId
          ? {
              ...membership,
              qualificationPaths: membership.qualificationPaths.map((path) =>
                path.id === pathId
                  ? {
                      ...path,
                      requirements: path.requirements.filter(
                        (ref) => ref.id !== refId,
                      ),
                    }
                  : path,
              ),
            }
          : membership,
      ),
    );
  }

  updateQualificationRequirement(
    membershipId: string,
    pathId: string,
    refId: string,
    patch: Partial<Omit<EditableQualificationRef, "id">>,
  ): void {
    this.seriesMemberships.update((memberships) =>
      memberships.map((membership) =>
        membership.id === membershipId
          ? {
              ...membership,
              qualificationPaths: membership.qualificationPaths.map((path) =>
                path.id === pathId
                  ? {
                      ...path,
                      requirements: path.requirements.map((ref) =>
                        ref.id === refId ? { ...ref, ...patch } : ref,
                      ),
                    }
                  : path,
              ),
            }
          : membership,
      ),
    );
  }

  updateQualificationRequirementKind(
    membershipId: string,
    pathId: string,
    refId: string,
    kind: string,
  ): void {
    if (isQualificationRefKind(kind)) {
      this.updateQualificationRequirement(membershipId, pathId, refId, {
        kind,
      });
    }
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
    this._syncAreaFromPickerForSubmit();

    const patch: EventEditPatch = {
      ...this._buildLocationPatch(v.location_lat, v.location_lng),
      ...this._buildGeometryPatch(),
      name: v.name!.trim(),
      description_i18n: this._descriptionI18nPatch(),
      slug: trimOrUndefined(v.slug?.toLowerCase()),
      venue_string: v.venue_string!.trim(),
      locality_string: v.locality_string!.trim(),
      start: Timestamp.fromDate(start),
      end: Timestamp.fromDate(end),
      url: trimOrUndefined(v.url),
      event_links: this._buildEventLinksPatch(),
      ticket_options: this._buildTicketOptionsPatch(),
      program: this._buildProgramPatch(),
      published: v.published === true,
      banner_src: trimOrUndefined(v.banner_src),
      banner_fit: v.banner_fit ?? "cover",
      banner_accent_color: trimOrUndefined(v.banner_accent_color),
      logo_src: trimOrUndefined(v.logo_src),
      focus_zoom: numberOrUndefined(v.focus_zoom),
      media: [...this.externalMedia()],
      custom_markers: this._buildCustomMarkersPatch(),
      spot_ids: [...this.spotIds()],
      community_keys: [...this.communityKeys()],
      series_ids: uniqueStrings([
        ...csvToArray(v.series_ids_csv),
        ...this.seriesMemberships().map((membership) => membership.seriesId),
      ]),
      series_memberships: this._buildSeriesMembershipsPatch(),
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

  private _syncAreaFromPickerForSubmit(): void {
    const livePath = this._boundsPicker?.currentAreaPath() ?? null;
    const originalPath = eventAreaPath(this.event()?.areaPolygon);
    const localPath = this.areaPath();
    const differsFromLocal = !pathsEqual(livePath, localPath);
    const differsFromOriginal = !pathsEqual(livePath, originalPath);

    if (differsFromLocal) {
      this.areaPath.set(livePath);
    }
    if (differsFromOriginal) {
      this.areaTouched.set(true);
    }
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
  ): Pick<Partial<EventSchema>, "location_raw"> {
    const lat = numberOrUndefined(latitude);
    const lng = numberOrUndefined(longitude);
    return lat !== undefined && lng !== undefined
      ? {
          location_raw: { lat, lng },
        }
      : {};
  }

  private _buildGeometryPatch(): Pick<
    EventEditPatch,
    "area_polygon"
  > {
    if (!this.areaTouched() && this.event()?.areaPolygon) {
      return {};
    }
    const path = this.areaPath();
    if (!path || path.length < 3) {
      if (!this.areaTouched()) return {};
      return {
        area_polygon: null,
      };
    }
    return {
      area_polygon: pathToAreaPolygon(path),
    };
  }

  private _buildCustomMarkersPatch(): EventCustomMarkerSchema[] {
    return this.customMarkers().reduce<EventCustomMarkerSchema[]>(
      (markers, marker) => {
        const lat = numberOrUndefined(marker.lat);
        const lng = numberOrUndefined(marker.lng);
        if (lat === undefined || lng === undefined) return markers;

        const icons = csvToArray(marker.icons);
        markers.push({
          name: trimOrUndefined(marker.name),
          location: { lat, lng },
          icons: icons.length > 0 ? icons : undefined,
          color: marker.color,
          priority:
            marker.priority === "required" ? ("required" as const) : undefined,
        });
        return markers;
      },
      [],
    );
  }

  private _buildEventLinksPatch(): EventLinkSchema[] {
    return this.eventLinks().reduce<EventLinkSchema[]>((links, link) => {
      const url = safeExternalUrl(link.url);
      const label = trimOrUndefined(link.label);
      if (!url || !label) return links;
      links.push({
        label,
        url,
        kind: link.kind,
        primary: link.primary || undefined,
        provider: trimOrUndefined(link.provider),
      });
      return links;
    }, []);
  }

  private _buildTicketOptionsPatch(): EventTicketOptionSchema[] {
    return this.ticketOptions().reduce<EventTicketOptionSchema[]>(
      (tickets, ticket, index) => {
        const label = trimOrUndefined(ticket.label);
        if (!label) return tickets;
        const price = buildTicketPrice(ticket);
        tickets.push({
          id: trimOrUndefined(ticket.id) ?? `ticket-${index + 1}`,
          label,
          label_i18n: ticket.labelI18n,
          description: trimOrUndefined(ticket.description),
          description_i18n: ticket.descriptionI18n,
          url: safeExternalUrl(ticket.url) ?? undefined,
          price,
          availability: ticket.availability,
          sale_starts_at: timestampFromDateInput(ticket.saleStartsAt),
          sale_ends_at: timestampFromDateInput(ticket.saleEndsAt),
          badge: ticket.badge || undefined,
        });
        return tickets;
      },
      [],
    );
  }

  private _buildProgramPatch(): EventProgramSchema | undefined {
    const plans = this.programPlans()
      .map((plan) => this._buildProgramPlanPatch(plan))
      .filter((plan): plan is EventProgramPlanSchema => !!plan);

    if (plans.length === 0) return undefined;

    const activePlanId =
      plans.some((plan) => plan.id === this.activeProgramPlanId())
        ? this.activeProgramPlanId()
        : plans[0].id;

    return {
      active_plan_id: activePlanId,
      plans,
    };
  }

  private _buildProgramPlanPatch(
    plan: EditableProgramPlan,
  ): EventProgramPlanSchema | null {
    const id = trimOrUndefined(plan.id);
    const label = trimOrUndefined(plan.label);
    if (!id || !label) return null;

    return {
      ...plan.preserved,
      id,
      label,
      kind: plan.kind,
      condition_label: trimOrUndefined(plan.conditionLabel),
      items: plan.items
        .map((item) => this._buildProgramItemPatch(item))
        .filter((item): item is EventProgramItemSchema => !!item)
        .sort((left, right) => left.start.toMillis() - right.start.toMillis()),
    };
  }

  private _buildProgramItemPatch(
    item: EditableProgramItem,
  ): EventProgramItemSchema | null {
    const id = trimOrUndefined(item.id);
    const title = trimOrUndefined(item.title);
    const start = timestampFromDateTimeLocal(item.start);
    if (!id || !title || !start) return null;

    const spotRef =
      item.spotRefKind && trimOrUndefined(item.spotRefId)
        ? {
            kind: item.spotRefKind,
            id: item.spotRefId.trim(),
          }
        : undefined;

    return {
      ...item.preserved,
      id,
      title,
      description: trimOrUndefined(item.description),
      category: item.category,
      start,
      end: timestampFromDateTimeLocal(item.end),
      spot_ref: spotRef,
      status: item.status === "scheduled" ? undefined : item.status,
      linked_event_id: trimOrUndefined(item.linkedEventId),
    };
  }

  private _buildSeriesMembershipsPatch(): EventSeriesMembershipSchema[] {
    return this.seriesMemberships().reduce<EventSeriesMembershipSchema[]>(
      (memberships, membership) => {
        const seriesId = trimOrUndefined(membership.seriesId);
        if (!seriesId) return memberships;

        const qualifiesTo = membership.qualifiesTo
          .map((ref) => this._buildQualificationRefPatch(ref))
          .filter((ref): ref is EventQualificationRefSchema => !!ref);
        const qualificationPaths = membership.qualificationPaths
          .map((path) => this._buildQualificationPathPatch(path))
          .filter((path): path is EventQualificationPathSchema => !!path);

        memberships.push({
          ...membership.preserved,
          series_id: seriesId,
          role: membership.role,
          qualification_required: membership.qualificationRequired || undefined,
          qualification_hint: trimOrUndefined(membership.qualificationHint),
          qualifies_to: qualifiesTo.length > 0 ? qualifiesTo : undefined,
          qualification_paths:
            qualificationPaths.length > 0 ? qualificationPaths : undefined,
          source_url: safeExternalUrl(membership.sourceUrl) ?? undefined,
        });
        return memberships;
      },
      [],
    );
  }

  private _buildQualificationPathPatch(
    path: EditableQualificationPath,
  ): EventQualificationPathSchema | null {
    const id = trimOrUndefined(path.id);
    if (!id) return null;

    const requirements = path.requirements
      .map((ref) => this._buildQualificationRefPatch(ref))
      .filter((ref): ref is EventQualificationRefSchema => !!ref);

    if (requirements.length === 0) return null;

    return {
      ...path.preserved,
      id,
      label: trimOrUndefined(path.label),
      requirement_mode: path.requirementMode,
      requirements,
    };
  }

  private _buildQualificationRefPatch(
    ref: EditableQualificationRef,
  ): EventQualificationRefSchema | null {
    const eventId = trimOrUndefined(ref.eventId);
    if (!eventId) return null;
    const programItemId = trimOrUndefined(ref.programItemId);
    return {
      kind: ref.kind,
      event_id: eventId,
      program_item_id: ref.kind === "program_item" ? programItemId : undefined,
    };
  }

  get descriptionLocaleMap(): LocaleMap | undefined {
    return this._descriptionLocaleMap();
  }

  set descriptionLocaleMap(value: LocaleMap | undefined | null) {
    this._descriptionLocaleMap.set(
      value ? makeLocaleMapFromObject(value) : undefined,
    );
  }

  private _descriptionI18nPatch(): LocaleMap | undefined {
    const descriptions = this._descriptionLocaleMap();
    if (!descriptions || Object.keys(descriptions).length === 0) {
      return undefined;
    }
    return descriptions;
  }

  private _newQualificationRef(index: number): EditableQualificationRef {
    return {
      id: `ref-${Date.now()}-${index}`,
      kind: "event",
      eventId: "",
      programItemId: "",
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
      area_name: "Main area",
      points: path,
    },
  ];
}

function eventAreaPath(
  areaPolygon: EventSchema["area_polygon"] | undefined
): Array<{ lat: number; lng: number }> | null {
  const ring = areaPolygon?.find(
    (candidate) =>
      candidate.area_name?.toLowerCase() !== "outer" &&
      candidate.points.every((point) => Math.abs(point.lat) < 85)
  );
  return ring && ring.points.length >= 3 ? [...ring.points] : null;
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

function pathsEqual(
  a: Array<{ lat: number; lng: number }> | null,
  b: Array<{ lat: number; lng: number }> | null,
): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  return a.every((point, index) => {
    const other = b[index];
    return (
      Math.abs(point.lat - other.lat) < 0.0000001 &&
      Math.abs(point.lng - other.lng) < 0.0000001
    );
  });
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

function uniqueStrings(values: string[]): string[] {
  return [
    ...new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  ];
}

function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function inferMediaType(url: string): MediaType {
  const pathname = new URL(url).pathname.toLowerCase();
  return /\.(?:mp4|m4v|mov|webm|ogv)$/u.test(pathname)
    ? MediaType.Video
    : MediaType.Image;
}

function isEventLinkKind(value: string): value is EventLinkKind {
  return (
    value === "website" ||
    value === "tickets" ||
    value === "schedule" ||
    value === "results" ||
    value === "livestream" ||
    value === "other"
  );
}

function isEventCategory(value: string): value is EventCategory {
  return (
    value === "jam" ||
    value === "competition" ||
    value === "workshop" ||
    value === "camp" ||
    value === "show" ||
    value === "awards" ||
    value === "social" ||
    value === "travel" ||
    value === "other"
  );
}

function isProgramItemStatus(
  value: string,
): value is EventProgramItemStatus {
  return (
    value === "scheduled" ||
    value === "cancelled" ||
    value === "moved" ||
    value === "delayed"
  );
}

function isSeriesRole(value: string): value is EventSeriesRole {
  return (
    value === "series_event" ||
    value === "qualifier" ||
    value === "final" ||
    value === "championship" ||
    value === "feeder" ||
    value === "related"
  );
}

function isQualificationRefKind(
  value: string,
): value is EventQualificationRefSchema["kind"] {
  return value === "event" || value === "program_item";
}

function isTicketAvailability(
  value: string,
): value is EventTicketAvailability {
  return (
    value === "available" ||
    value === "coming_soon" ||
    value === "sold_out" ||
    value === "waitlist" ||
    value === "ended"
  );
}

function isTicketBadge(value: string): value is EventTicketBadge {
  return (
    value === "early_bird" ||
    value === "discount" ||
    value === "regular" ||
    value === "late" ||
    value === "member"
  );
}

function buildTicketPrice(
  ticket: EditableTicketOption,
): EventTicketOptionSchema["price"] | undefined {
  const currency = trimOrUndefined(ticket.currency)?.toUpperCase();
  if (!currency) return undefined;

  if (ticket.amount !== null && Number.isFinite(ticket.amount)) {
    return {
      amount: ticket.amount,
      currency,
    };
  }

  if (
    ticket.minAmount !== null &&
    ticket.maxAmount !== null &&
    Number.isFinite(ticket.minAmount) &&
    Number.isFinite(ticket.maxAmount)
  ) {
    return {
      min_amount: ticket.minAmount,
      max_amount: ticket.maxAmount,
      currency,
    };
  }

  return undefined;
}

function dateInputValue(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timestampFromDateInput(value: string): Timestamp | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : Timestamp.fromDate(date);
}

function dateTimeLocalValue(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function timestampFromDateTimeLocal(value: string): Timestamp | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : Timestamp.fromDate(date);
}

function editableSeriesMembership(
  membership: EventSeriesMembershipSchema,
  index: number,
): EditableSeriesMembership {
  return {
    id: `membership-${index}`,
    seriesId: membership.series_id,
    role: membership.role,
    qualificationRequired: membership.qualification_required === true,
    qualificationHint: membership.qualification_hint ?? "",
    sourceUrl: membership.source_url ?? "",
    qualifiesTo: (membership.qualifies_to ?? []).map((ref, refIndex) =>
      editableQualificationRef(ref, refIndex),
    ),
    qualificationPaths: (membership.qualification_paths ?? []).map(
      (path, pathIndex) => ({
        id: path.id || `path-${pathIndex}`,
        label: path.label ?? "",
        requirementMode: path.requirement_mode,
        requirements: path.requirements.map((ref, refIndex) =>
          editableQualificationRef(ref, refIndex),
        ),
        preserved: {
          label_i18n: path.label_i18n,
        },
      }),
    ),
    preserved: {
      disciplines: membership.disciplines,
      qualification_hint_i18n: membership.qualification_hint_i18n,
      required_qualifiers: membership.required_qualifiers,
    },
  };
}

function editableQualificationRef(
  ref: EventQualificationRefSchema,
  index: number,
): EditableQualificationRef {
  return {
    id: `ref-${index}`,
    kind: ref.kind,
    eventId: String(ref.event_id),
    programItemId: ref.program_item_id ?? "",
  };
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
