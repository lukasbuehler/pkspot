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
  EventCustomMarkerSchema,
  EventLinkKind,
  EventLinkSchema,
  EventOrganizerSchema,
  EventSchema,
  EventTicketAvailability,
  EventTicketBadge,
  EventTicketOptionSchema,
} from "../../../db/schemas/EventSchema";
import {
  OrganizationReferenceSchema,
  OrganizationSchema,
} from "../../../db/schemas/OrganizationSchema";
import { MediaSchema, StorageBucket } from "../../../db/schemas/Media";
import { MediaType } from "../../../db/models/Interfaces";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { SearchService } from "../../services/search.service";
import { BoundsPickerComponent } from "../bounds-picker/bounds-picker.component";
import { MediaUpload } from "../media-upload/media-upload.component";
import { MarkerComponent } from "../marker/marker.component";
import { SpotPickerComponent } from "../spot-picker/spot-picker.component";

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
  description: string;
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
    MarkerComponent,
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
        console.debug("[EventAreaDebug] form reset empty event");
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
        return;
      }
      if (this._loadedEventId === e.id) {
        console.debug("[EventAreaDebug] form ignored same-event refresh", {
          eventId: e.id,
          incomingArea: summarizePath(eventAreaPath(e.areaPolygon)),
          incomingBounds: e.bounds ?? null,
          localArea: summarizePath(this.areaPath()),
          areaTouched: this.areaTouched(),
        });
        return;
      }
      this._loadedEventId = e.id;
      console.debug("[EventAreaDebug] form initializing from event", {
        eventId: e.id,
        incomingArea: summarizePath(eventAreaPath(e.areaPolygon)),
        incomingBounds: e.bounds ?? null,
      });
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
          description: ticket.description ?? "",
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
    console.debug("[EventAreaDebug] form areaChange", {
      path: summarizePath(path),
      previousArea: summarizePath(this.areaPath()),
      boundsContext: this.bounds(),
    });
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
      description: trimOrUndefined(v.description),
      slug: trimOrUndefined(v.slug?.toLowerCase()),
      venue_string: v.venue_string!.trim(),
      locality_string: v.locality_string!.trim(),
      start: Timestamp.fromDate(start),
      end: Timestamp.fromDate(end),
      url: trimOrUndefined(v.url),
      event_links: this._buildEventLinksPatch(),
      ticket_options: this._buildTicketOptionsPatch(),
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

    console.debug("[EventAreaDebug] form submit patch", {
      localArea: summarizePath(this.areaPath()),
      areaTouched: this.areaTouched(),
      patchArea: summarizeAreaPolygon(patch.area_polygon),
      hasBoundsInPatch: "bounds" in patch,
    });
    this.save.emit(patch);
  }

  private _syncAreaFromPickerForSubmit(): void {
    const livePath = this._boundsPicker?.currentAreaPath() ?? null;
    const originalPath = eventAreaPath(this.event()?.areaPolygon);
    const localPath = this.areaPath();
    const differsFromLocal = !pathsEqual(livePath, localPath);
    const differsFromOriginal = !pathsEqual(livePath, originalPath);

    console.debug("[EventAreaDebug] form submit live picker sync", {
      livePath: summarizePath(livePath),
      localPath: summarizePath(localPath),
      originalPath: summarizePath(originalPath),
      differsFromLocal,
      differsFromOriginal,
      areaTouchedBefore: this.areaTouched(),
    });

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
      console.debug("[EventAreaDebug] form geometry patch clears area", {
        areaTouched: this.areaTouched(),
        path: summarizePath(path),
      });
      return {
        area_polygon: null,
      };
    }
    console.debug("[EventAreaDebug] form geometry patch writes area", {
      path: summarizePath(path),
    });
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
          description: trimOrUndefined(ticket.description),
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

function summarizeAreaPolygon(
  areaPolygon: EventSchema["area_polygon"] | null | undefined,
): Array<{
  areaName?: string;
  count: number;
  first?: { lat: number; lng: number };
  last?: { lat: number; lng: number };
}> | null {
  if (!areaPolygon) return null;
  return areaPolygon.map((ring) => ({
    areaName: ring.area_name,
    ...summarizePath(ring.points),
  }));
}

function summarizePath(path: Array<{ lat: number; lng: number }> | null): {
  count: number;
  first?: { lat: number; lng: number };
  last?: { lat: number; lng: number };
} {
  if (!path || path.length === 0) return { count: 0 };
  return {
    count: path.length,
    first: path[0],
    last: path[path.length - 1],
  };
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
