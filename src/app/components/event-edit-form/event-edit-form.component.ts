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
  FormControl,
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
  EventFeaturedParticipantRole,
  EventFeaturedParticipantSchema,
  EventFeaturedParticipantType,
  EventLinkKind,
  EventLinkSchema,
  EventExternalSourceSchema,
  EventOrganizerSchema,
  EventProgramItemSchema,
  EventProgramPlanKind,
  EventProgramPlanSchema,
  EventProgramSchema,
  EventProgramSpotRefSchema,
  EventProgramItemStatus,
  EventSchema,
  InlineEventSpotSchema,
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
import {
  CommunitySearchPreview,
  SearchService,
} from "../../services/search.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MapsApiService } from "../../services/maps-api.service";
import { BoundsPickerComponent } from "../bounds-picker/bounds-picker.component";
import { MediaUpload } from "../media-upload/media-upload.component";
import { MarkerComponent } from "../marker/marker.component";
import { SpotPickerComponent } from "../spot-picker/spot-picker.component";
import { LocaleMapEditFieldComponent } from "../locale-map-edit-field/locale-map-edit-field.component";
import { eventImageDisplaySrc } from "../event-display/event-display.helpers";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";

type OrganizationDocument = OrganizationSchema & { id: string };
type EditableEventMarker = {
  id: string;
  name: string;
  description: string;
  locality: string;
  googlePlaceId: string;
  url: string;
  imageUrl: string;
  lat: number | null;
  lng: number | null;
  icons: string;
  color: "primary" | "secondary" | "tertiary" | "gray";
  priority: "auto" | "required";
};
type EditableInlineSpotBoundsPoint = {
  id: string;
  lat: number | null;
  lng: number | null;
};
type EditableInlineEventSpot = {
  key: string;
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  description: string;
  imagesCsv: string;
  isIconic: boolean;
  bounds: EditableInlineSpotBoundsPoint[];
};
type EventLocationSearchOption =
  | {
      type: "spot";
      id: string;
      label: string;
      subtitle: string;
      location: { lat: number; lng: number };
    }
  | {
      type: "place";
      id: string;
      label: string;
      subtitle: string;
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
type EditableFeaturedParticipant = {
  id: string;
  name: string;
  type: EventFeaturedParticipantType;
  role: EventFeaturedParticipantRole;
  description: string;
  url: string;
  imageSrc: string;
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
  "bounds" | "area_polygon" | "location" | "description_i18n" | "external_source"
> & {
  area_polygon?: EventSchema["area_polygon"] | null;
  description_i18n?: EventSchema["description_i18n"] | null;
  external_source?: EventSchema["external_source"] | null;
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
 * Specialized fields (promo_region, challenge_spot_map) are still
 * Firestore-console territory
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
  private _authService = inject(AuthenticationService);
  private _mapsApiService = inject(MapsApiService);
  private _loadedEventId: string | null = null;
  private _locationSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private _locationSearchRequestId = 0;
  private _communitySearchTimer: ReturnType<typeof setTimeout> | null = null;
  private _communitySearchRequestId = 0;
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
    legacy_area_polygon_outer_ring: [false],

    // Optional
    description: [""],
    slug: ["", [Validators.pattern(/^[a-z0-9-]*$/)]],
    organizer_query: [""],
    url: [""],
    external_source_provider: [""],
    external_source_id: [""],
    external_source_url: [""],
    published: [true],
    banner_src: [""],
    banner_fit: ["cover"],
    banner_accent_color: [""],
    logo_src: [""],
    logo_background_color: [""],
    focus_zoom: [null as number | null],
    series_ids_csv: [""],
    promo_radius_m: [null as number | null],
    is_promoted: [false],
    sponsor_name: [""],
    sponsor_url: [""],
    sponsor_logo_src: [""],
    sponsor_logo_background_color: [""],
    external_media_url: [""],
    external_media_source_url: [""],
    external_media_attribution_text: [""],
  });
  locationSearchControl = new FormControl<string | EventLocationSearchOption>(
    "",
  );
  communitySearchControl = new FormControl<string | CommunitySearchPreview>(
    "",
  );

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
  inlineSpots = signal<EditableInlineEventSpot[]>([]);
  featuredParticipants = signal<EditableFeaturedParticipant[]>([]);
  externalMedia = signal<MediaSchema[]>([]);
  eventLinks = signal<EditableEventLink[]>([]);
  ticketOptions = signal<EditableTicketOption[]>([]);
  programPlans = signal<EditableProgramPlan[]>([]);
  activeProgramPlanId = signal<string>("");
  seriesMemberships = signal<EditableSeriesMembership[]>([]);
  locationSearchResults = signal<EventLocationSearchOption[]>([]);
  locationSearchLoading = signal<boolean>(false);
  communitySearchQuery = signal<string>("");
  communitySearchResults = signal<CommunitySearchPreview[]>([]);
  communitySearchLoading = signal<boolean>(false);
  private _descriptionLocaleMap = signal<LocaleMap | undefined>(undefined);
  readonly featuredParticipantTypes = [
    "person",
    "group",
  ] as const satisfies readonly EventFeaturedParticipantType[];
  readonly featuredParticipantRoles = [
    "athlete",
    "judge",
    "coach",
    "instructor",
    "speaker",
    "artist",
    "dj",
    "performer",
    "host",
    "guest",
  ] as const satisfies readonly EventFeaturedParticipantRole[];

  /** Whether the parent passed in an existing event (vs. create mode). */
  readonly isEditMode = computed(() => this.event() !== null);
  readonly isAdmin = computed(() => this._authService.isAdmin());

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
      e.externalSource ||
      e.organizer ||
      e.featuredParticipants.length > 0 ||
      e.location ||
      e.bannerSrc ||
      e.logoSrc ||
      e.inlineSpots.length > 0 ||
      e.sponsor ||
      e.promoRegion ||
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
  readonly displayLocationSearchOption = (
    value: EventLocationSearchOption | string | null,
  ): string => {
    if (!value) return "";
    return typeof value === "string" ? value : value.label;
  };
  readonly displayCommunitySearchOption = (
    value: CommunitySearchPreview | string | null,
  ): string => {
    if (!value) return "";
    return typeof value === "string"
      ? value
      : value.displayName || value.communityKey;
  };

  readonly formattedLocation = computed(() => {
    const location = this.location();
    return location
      ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
      : $localize`:@@event_edit.location_not_set:Not set`;
  });

  featuredParticipantTypeLabel(type: EventFeaturedParticipantType): string {
    switch (type) {
      case "group":
        return $localize`:@@event_featured_participant.type.group:Group or act`;
      case "person":
        return $localize`:@@event_featured_participant.type.person:Person`;
    }
  }

  featuredParticipantRoleLabel(role: EventFeaturedParticipantRole): string {
    switch (role) {
      case "athlete":
        return $localize`:@@event_featured_participant.role.athlete:Athlete`;
      case "judge":
        return $localize`:@@event_featured_participant.role.judge:Judge`;
      case "coach":
        return $localize`:@@event_featured_participant.role.coach:Coach`;
      case "instructor":
        return $localize`:@@event_featured_participant.role.instructor:Instructor`;
      case "speaker":
        return $localize`:@@event_featured_participant.role.speaker:Speaker`;
      case "artist":
        return $localize`:@@event_featured_participant.role.artist:Artist`;
      case "dj":
        return $localize`:@@event_featured_participant.role.dj:DJ`;
      case "performer":
        return $localize`:@@event_featured_participant.role.performer:Performer`;
      case "host":
        return $localize`:@@event_featured_participant.role.host:Host`;
      case "guest":
        return $localize`:@@event_featured_participant.role.guest:Guest`;
    }
  }

  constructor() {
    // Sync the form to the input event whenever it changes (or arrives).
    effect(() => {
      const e = this.event();
      if (!e) {
        this._loadedEventId = null;
        this.form.reset({
          published: true,
          banner_fit: "cover",
          legacy_area_polygon_outer_ring: false,
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
        this.inlineSpots.set([]);
        this.featuredParticipants.set([]);
        this.externalMedia.set([]);
        this.eventLinks.set([]);
        this.ticketOptions.set([]);
        this.programPlans.set([]);
        this.activeProgramPlanId.set("");
        this.seriesMemberships.set([]);
        this._descriptionLocaleMap.set(undefined);
        this.locationSearchControl.setValue("", { emitEvent: false });
        this.locationSearchResults.set([]);
        this._resetCommunitySearch();
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
        legacy_area_polygon_outer_ring: hasLegacyAreaPolygonOuterRing(
          e.areaPolygon,
        ),
        url: e.url ?? "",
        external_source_provider: e.externalSource?.provider ?? "",
        external_source_id: e.externalSource?.id ?? "",
        external_source_url: e.externalSource?.url ?? "",
        published: e.published,
        banner_src: e.bannerSrc ?? "",
        banner_fit: e.bannerFit,
        banner_accent_color: e.bannerAccentColor ?? "",
        logo_src: e.logoSrc ?? "",
        logo_background_color: e.logoBackgroundColor ?? "",
        focus_zoom: e.focusZoom ?? null,
        series_ids_csv: e.seriesIds.join(", "),
        promo_radius_m:
          typeof e.promoRegion?.radius_m === "number"
            ? e.promoRegion.radius_m
            : null,
        is_promoted: e.isPromoted,
        sponsor_name: e.sponsor?.name ?? "",
        sponsor_url: e.sponsor?.url ?? "",
        sponsor_logo_src: e.sponsor?.logo_src ?? "",
        sponsor_logo_background_color:
          e.sponsor?.logo_background_color ?? "",
        external_media_url: "",
        external_media_source_url: "",
        external_media_attribution_text: "",
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
          id: marker.id || `marker-${index}`,
          name: marker.name ?? "",
          description: marker.description ?? "",
          locality: marker.locality ?? "",
          googlePlaceId: marker.google_place_id ?? "",
          url: marker.url ?? "",
          imageUrl:
            marker.media?.find((media) => media.type === MediaType.Image)
              ?.src ?? "",
          lat: marker.location.lat,
          lng: marker.location.lng,
          icons: (marker.icons ?? ["info"]).join(", "),
          color: marker.color ?? "tertiary",
          priority: marker.priority === "required" ? "required" : "auto",
        })),
      );
      this.inlineSpots.set(
        e.inlineSpots.map((spot, index) => ({
          key: `temporary-spot-${index}`,
          id: spot.id || `temporary-spot-${index + 1}`,
          name: spot.name ?? "",
          lat: spot.location.lat,
          lng: spot.location.lng,
          description: spot.description ?? "",
          imagesCsv: (spot.images ?? []).join(", "),
          isIconic: spot.is_iconic === true,
          bounds: (spot.bounds ?? []).map((point, pointIndex) => ({
            id: `temporary-spot-${index}-bounds-${pointIndex}`,
            lat: point.lat,
            lng: point.lng,
          })),
        })),
      );
      this.featuredParticipants.set(
        e.featuredParticipants.map((participant, index) => ({
          id: `featured-participant-${index}`,
          name: participant.name,
          type: participant.type,
          role: participant.role,
          description: participant.description ?? "",
          url: participant.url ?? "",
          imageSrc: participant.image_src ?? "",
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
      this.locationSearchControl.setValue("", { emitEvent: false });
      this.locationSearchResults.set([]);
      this._resetCommunitySearch();
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
    this._setEventLocation(location);
  }

  onLocationSearchInput(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const query = input?.value.trim() ?? "";
    if (this._locationSearchTimer) {
      clearTimeout(this._locationSearchTimer);
    }
    if (query.length < 2) {
      this.locationSearchResults.set([]);
      this.locationSearchLoading.set(false);
      return;
    }
    this.locationSearchLoading.set(true);
    this._locationSearchTimer = setTimeout(() => {
      void this._searchLocationOptions(query);
    }, 250);
  }

  async onLocationSearchSelected(
    event: MatAutocompleteSelectedEvent,
  ): Promise<void> {
    const option = event.option.value as EventLocationSearchOption;
    this.locationSearchResults.set([]);
    this.locationSearchControl.setValue(option.label, { emitEvent: false });
    if (option.type === "spot") {
      this._setEventLocation(option.location);
      return;
    }

    try {
      const place = await this._mapsApiService.getGooglePlaceById(option.id);
      const location = place.location;
      const lat = location?.lat();
      const lng = location?.lng();
      if (typeof lat === "number" && typeof lng === "number") {
        this._setEventLocation({ lat, lng });
      }
    } catch (err) {
      console.warn("EventEditForm: location place lookup failed", err);
    }
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

  onCommunitySearchInput(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const query = input?.value.trim() ?? "";
    const requestId = ++this._communitySearchRequestId;
    this.communitySearchQuery.set(query);

    if (this._communitySearchTimer) {
      clearTimeout(this._communitySearchTimer);
    }
    if (query.length < 2) {
      this.communitySearchResults.set([]);
      this.communitySearchLoading.set(false);
      return;
    }

    this.communitySearchLoading.set(true);
    this._communitySearchTimer = setTimeout(() => {
      void this._searchCommunityOptions(query, requestId);
    }, 250);
  }

  onCommunitySearchSelected(event: MatAutocompleteSelectedEvent): void {
    const community = event.option.value as CommunitySearchPreview;
    this.addCommunityKey(community.communityKey);
    this._resetCommunitySearch();
  }

  communitySearchSubtitle(community: CommunitySearchPreview): string {
    const parts = [
      community.scope === "locality" ? community.regionName : undefined,
      community.scope !== "country" ? community.countryName : undefined,
    ].filter((part): part is string => !!part);
    return parts.join(", ");
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

  previewImageSrc(
    controlName: "banner_src" | "logo_src" | "sponsor_logo_src",
  ): string | undefined {
    const value = this.form.controls[controlName].value;
    return typeof value === "string"
      ? eventImageDisplaySrc(value.trim())
      : undefined;
  }

  addInlineSpot(): void {
    const location = this.location();
    this.inlineSpots.update((spots) => [
      ...spots,
      {
        key: `temporary-spot-${Date.now()}-${spots.length}`,
        id: `temporary-spot-${spots.length + 1}`,
        name: "",
        description: "",
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        imagesCsv: "",
        isIconic: spots.length === 0,
        bounds: [],
      },
    ]);
  }

  removeInlineSpot(key: string): void {
    this.inlineSpots.update((spots) => spots.filter((spot) => spot.key !== key));
  }

  updateInlineSpot(
    key: string,
    patch: Partial<Omit<EditableInlineEventSpot, "bounds" | "key">>,
  ): void {
    this.inlineSpots.update((spots) =>
      spots.map((spot) => (spot.key === key ? { ...spot, ...patch } : spot)),
    );
  }

  updateInlineSpotCoordinate(
    key: string,
    field: "lat" | "lng",
    value: number,
  ): void {
    this.updateInlineSpot(key, {
      [field]: Number.isFinite(value) ? value : null,
    });
  }

  addInlineSpotBoundsPoint(spotKey: string): void {
    const location = this.location();
    this.inlineSpots.update((spots) =>
      spots.map((spot) =>
        spot.key === spotKey
          ? {
              ...spot,
              bounds: [
                ...spot.bounds,
                {
                  id: `bounds-${Date.now()}-${spot.bounds.length}`,
                  lat: location?.lat ?? spot.lat,
                  lng: location?.lng ?? spot.lng,
                },
              ],
            }
          : spot,
      ),
    );
  }

  removeInlineSpotBoundsPoint(spotKey: string, pointId: string): void {
    this.inlineSpots.update((spots) =>
      spots.map((spot) =>
        spot.key === spotKey
          ? {
              ...spot,
              bounds: spot.bounds.filter((point) => point.id !== pointId),
            }
          : spot,
      ),
    );
  }

  updateInlineSpotBoundsPoint(
    spotKey: string,
    pointId: string,
    field: "lat" | "lng",
    value: number,
  ): void {
    this.inlineSpots.update((spots) =>
      spots.map((spot) =>
        spot.key === spotKey
          ? {
              ...spot,
              bounds: spot.bounds.map((point) =>
                point.id === pointId
                  ? {
                      ...point,
                      [field]: Number.isFinite(value) ? value : null,
                    }
                  : point,
              ),
            }
          : spot,
      ),
    );
  }

  addCustomMarker(): void {
    const location = this.location();
    this.customMarkers.update((markers) => [
      ...markers,
      {
        id: `marker-${Date.now()}-${markers.length}`,
        name: "",
        description: "",
        locality: "",
        googlePlaceId: "",
        url: "",
        imageUrl: "",
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
    const sourcePageUrl = safeExternalUrl(
      this.form.value.external_media_source_url,
    );
    if (this.form.value.external_media_source_url && !sourcePageUrl) {
      this.form.controls["external_media_source_url"].setErrors({ url: true });
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
              source_page_url: sourcePageUrl ?? undefined,
              attribution_text:
                this.form.value.external_media_attribution_text?.trim() ||
                undefined,
            },
          ],
    );
    this.form.patchValue({
      external_media_url: "",
      external_media_source_url: "",
      external_media_attribution_text: "",
    });
    this.form.controls["external_media_url"].setErrors(null);
    this.form.controls["external_media_source_url"].setErrors(null);
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

  addFeaturedParticipant(): void {
    this.featuredParticipants.update((participants) => [
      ...participants,
      {
        id: `featured-participant-${Date.now()}-${participants.length}`,
        name: "",
        type: "person",
        role: "athlete",
        description: "",
        url: "",
        imageSrc: "",
      },
    ]);
  }

  updateFeaturedParticipant(
    id: string,
    patch: Partial<Omit<EditableFeaturedParticipant, "id">>,
  ): void {
    this.featuredParticipants.update((participants) =>
      participants.map((participant) =>
        participant.id === id ? { ...participant, ...patch } : participant,
      ),
    );
  }

  updateFeaturedParticipantType(id: string, type: string): void {
    if (isFeaturedParticipantType(type)) {
      this.updateFeaturedParticipant(id, { type });
    }
  }

  updateFeaturedParticipantRole(id: string, role: string): void {
    if (isFeaturedParticipantRole(role)) {
      this.updateFeaturedParticipant(id, { role });
    }
  }

  removeFeaturedParticipant(id: string): void {
    this.featuredParticipants.update((participants) =>
      participants.filter((participant) => participant.id !== id),
    );
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
    if (
      isExternalSourceProvider(v.external_source_provider) &&
      !safeExternalUrl(v.external_source_url)
    ) {
      this.form.controls["external_source_url"].setErrors({ url: true });
      this.form.controls["external_source_url"].markAsTouched();
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
      external_source: this._buildExternalSourcePatch(),
      event_links: this._buildEventLinksPatch(),
      featured_participants: this._buildFeaturedParticipantsPatch(),
      ticket_options: this._buildTicketOptionsPatch(),
      program: this._buildProgramPatch(),
      published: v.published === true,
      banner_src: trimOrUndefined(v.banner_src),
      banner_fit: v.banner_fit ?? "cover",
      banner_accent_color: trimOrUndefined(v.banner_accent_color),
      logo_src: trimOrUndefined(v.logo_src),
      logo_background_color: trimOrUndefined(v.logo_background_color),
      focus_zoom: numberOrUndefined(v.focus_zoom),
      media: [...this.externalMedia()],
      custom_markers: this._buildCustomMarkersPatch(),
      inline_spots: this._buildInlineSpotsPatch(),
      spot_ids: [...this.spotIds()],
      community_keys: [...this.communityKeys()],
      series_ids: uniqueStrings([
        ...csvToArray(v.series_ids_csv),
        ...this.seriesMemberships().map((membership) => membership.seriesId),
      ]),
      series_memberships: this._buildSeriesMembershipsPatch(),
      organizer: this._buildOrganizerPatch(),
      promo_radius_m: numberOrUndefined(v.promo_radius_m),
      is_promoted: v.is_promoted === true,
      is_sponsored: v.is_promoted === true,
      sponsor:
        v.sponsor_name?.trim() ||
        v.sponsor_url?.trim() ||
        v.sponsor_logo_src?.trim() ||
        v.sponsor_logo_background_color?.trim()
          ? {
              name: (v.sponsor_name ?? "").trim() || "Sponsor",
              url: trimOrUndefined(v.sponsor_url),
              logo_src: trimOrUndefined(v.sponsor_logo_src),
              logo_background_color: trimOrUndefined(
                v.sponsor_logo_background_color,
              ),
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

  private _setEventLocation(location: { lat: number; lng: number }): void {
    this.location.set(location);
    this.form.patchValue({
      location_lat: location.lat,
      location_lng: location.lng,
    });
  }

  private async _searchLocationOptions(query: string): Promise<void> {
    const requestId = ++this._locationSearchRequestId;
    try {
      const [spotsResult, places] = await Promise.all([
        this._searchService.searchSpots(query),
        this._searchService.searchPlaces(query),
      ]);
      if (requestId !== this._locationSearchRequestId) return;

      const spotOptions = this._spotLocationOptionsFromResult(spotsResult);
      const placeOptions = places.slice(0, 5).map((place) => ({
        type: "place" as const,
        id: place.place_id,
        label:
          place.structured_formatting?.main_text ||
          place.description ||
          $localize`:@@event_edit.location_search_google_place:Google Place`,
        subtitle: place.structured_formatting?.secondary_text || place.description || "",
      }));

      this.locationSearchResults.set([...spotOptions, ...placeOptions]);
    } catch (err) {
      if (requestId === this._locationSearchRequestId) {
        console.warn("EventEditForm: location search failed", err);
        this.locationSearchResults.set([]);
      }
    } finally {
      if (requestId === this._locationSearchRequestId) {
        this.locationSearchLoading.set(false);
      }
    }
  }

  private async _searchCommunityOptions(
    query: string,
    requestId: number,
  ): Promise<void> {
    try {
      const results = await this._searchService.searchCommunities(query);
      if (requestId !== this._communitySearchRequestId) return;
      const selected = new Set(this.communityKeys());

      this.communitySearchResults.set(
        results
          .filter((community) => !selected.has(community.communityKey))
          .slice(0, 10),
      );
    } catch (err) {
      if (requestId === this._communitySearchRequestId) {
        console.warn("EventEditForm: community search failed", err);
        this.communitySearchResults.set([]);
      }
    } finally {
      if (requestId === this._communitySearchRequestId) {
        this.communitySearchLoading.set(false);
      }
    }
  }

  private _resetCommunitySearch(): void {
    ++this._communitySearchRequestId;
    if (this._communitySearchTimer) {
      clearTimeout(this._communitySearchTimer);
      this._communitySearchTimer = null;
    }
    this.communitySearchControl.setValue("", { emitEvent: false });
    this.communitySearchQuery.set("");
    this.communitySearchResults.set([]);
    this.communitySearchLoading.set(false);
  }

  private _spotLocationOptionsFromResult(
    result: unknown,
  ): EventLocationSearchOption[] {
    const hits = Array.isArray((result as { hits?: unknown })?.hits)
      ? ((result as { hits: unknown[] }).hits)
      : [];
    return hits.reduce<EventLocationSearchOption[]>((options, hit) => {
      const preview = this._spotPreviewFromHit(hit);
      const location = spotPreviewLocation(preview);
      if (!preview?.id || !location) return options;
      options.push({
        type: "spot",
        id: preview.id,
        label: preview.name || $localize`:@@event_edit.location_search_unnamed_spot:Unnamed spot`,
        subtitle: preview.locality || preview.countryName || "PK Spot",
        location,
      });
      return options;
    }, []);
  }

  private _spotPreviewFromHit(hit: unknown): SpotPreviewData | null {
    const hitRecord = hit as { preview?: unknown } | null;
    if (hitRecord?.preview) {
      return hitRecord.preview as SpotPreviewData;
    }
    return this._searchService.getSpotPreviewFromHit(hit);
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
    const eventAreaPolygon = this.event()?.areaPolygon;
    const wantsLegacyOuterRing =
      this.form.value.legacy_area_polygon_outer_ring === true;
    const legacyOuterRingChanged =
      hasLegacyAreaPolygonOuterRing(eventAreaPolygon) !== wantsLegacyOuterRing;
    if (!this.areaTouched() && eventAreaPolygon && !legacyOuterRingChanged) {
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
      area_polygon: pathToAreaPolygon(path, wantsLegacyOuterRing),
    };
  }

  private _buildCustomMarkersPatch(): EventCustomMarkerSchema[] {
    return this.customMarkers().reduce<EventCustomMarkerSchema[]>(
      (markers, marker) => {
        const lat = numberOrUndefined(marker.lat);
        const lng = numberOrUndefined(marker.lng);
        if (lat === undefined || lng === undefined) return markers;

        const icons = csvToArray(marker.icons);
        const url = safeExternalUrl(marker.url);
        const imageUrl = safeExternalUrl(marker.imageUrl);
        markers.push({
          id: trimOrUndefined(marker.id) ?? slugifyId(marker.name || "marker"),
          name: trimOrUndefined(marker.name),
          description: trimOrUndefined(marker.description),
          locality: trimOrUndefined(marker.locality),
          google_place_id: trimOrUndefined(marker.googlePlaceId),
          url: url ?? undefined,
          media: imageUrl
            ? [
                {
                  src: imageUrl,
                  type: MediaType.Image,
                  isInStorage: false,
                  origin: "other",
                },
              ]
            : undefined,
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

  private _buildInlineSpotsPatch(): InlineEventSpotSchema[] {
    return this.inlineSpots().reduce<InlineEventSpotSchema[]>((spots, spot) => {
      const name = trimOrUndefined(spot.name);
      const lat = numberOrUndefined(spot.lat);
      const lng = numberOrUndefined(spot.lng);
      if (!name || lat === undefined || lng === undefined) return spots;

      const bounds = spot.bounds.reduce<Array<{ lat: number; lng: number }>>(
        (points, point) => {
          const pointLat = numberOrUndefined(point.lat);
          const pointLng = numberOrUndefined(point.lng);
          if (pointLat === undefined || pointLng === undefined) return points;
          points.push({ lat: pointLat, lng: pointLng });
          return points;
        },
        [],
      );

      spots.push({
        id: trimOrUndefined(spot.id) ?? slugifyId(name),
        name,
        location: { lat, lng },
        description: trimOrUndefined(spot.description),
        images: csvToArray(spot.imagesCsv),
        bounds: bounds.length >= 3 ? bounds : undefined,
        is_iconic: spot.isIconic || undefined,
      });
      return spots;
    }, []);
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

  private _buildExternalSourcePatch():
    | EventExternalSourceSchema
    | null
    | undefined {
    const provider = this.form.value.external_source_provider;
    const url = safeExternalUrl(this.form.value.external_source_url);
    if (isExternalSourceProvider(provider) && url) {
      return {
        provider,
        id: trimOrUndefined(this.form.value.external_source_id),
        url,
      };
    }

    return this.event()?.externalSource ? null : undefined;
  }

  private _buildFeaturedParticipantsPatch(): EventFeaturedParticipantSchema[] {
    return this.featuredParticipants().reduce<EventFeaturedParticipantSchema[]>(
      (participants, participant) => {
        const name = trimOrUndefined(participant.name);
        if (!name) return participants;
        participants.push({
          name,
          type: participant.type,
          role: participant.role,
          description: trimOrUndefined(participant.description),
          url: safeExternalUrl(participant.url) ?? undefined,
          image_src: trimOrUndefined(participant.imageSrc),
        });
        return participants;
      },
      [],
    );
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

  private _descriptionI18nPatch(): LocaleMap | null | undefined {
    const descriptions = this._descriptionLocaleMap();
    if (!descriptions || Object.keys(descriptions).length === 0) {
      const event = this.event();
      const hadExistingDescription = Boolean(
        event?.description ||
          (event?.descriptions && Object.keys(event.descriptions).length > 0),
      );
      return hadExistingDescription ? null : undefined;
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
  path: Array<{ lat: number; lng: number }>,
  includeLegacyOuterRing = false,
): EventSchema["area_polygon"] {
  const areaPolygon: EventSchema["area_polygon"] = [
    {
      area_name: "Main area",
      points: path,
    },
  ];
  if (includeLegacyOuterRing) {
    areaPolygon.unshift(legacyAreaPolygonOuterRing());
  }
  return areaPolygon;
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

function legacyAreaPolygonOuterRing(): NonNullable<
  EventSchema["area_polygon"]
>[number] {
  return {
    points: [
      { lat: 0, lng: -90 },
      { lat: 0, lng: 90 },
      { lat: 90, lng: -90 },
      { lat: 90, lng: 90 },
    ],
  };
}

function hasLegacyAreaPolygonOuterRing(
  areaPolygon: EventSchema["area_polygon"] | undefined,
): boolean {
  const firstRing = areaPolygon?.[0];
  if (!firstRing || firstRing.points.length !== 4) return false;
  return pathsEqual(firstRing.points, legacyAreaPolygonOuterRing().points);
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

function spotPreviewLocation(
  preview: SpotPreviewData | null,
): { lat: number; lng: number } | null {
  if (!preview) return null;
  const raw = preview.location_raw;
  if (
    typeof raw?.lat === "number" &&
    Number.isFinite(raw.lat) &&
    typeof raw.lng === "number" &&
    Number.isFinite(raw.lng)
  ) {
    return { lat: raw.lat, lng: raw.lng };
  }

  const location = preview.location as
    | {
        lat?: (() => number) | number;
        lng?: (() => number) | number;
        latitude?: number;
        longitude?: number;
      }
    | undefined;
  if (!location) return null;

  const lat =
    typeof location.lat === "function"
      ? location.lat()
      : typeof location.lat === "number"
        ? location.lat
        : location.latitude;
  const lng =
    typeof location.lng === "function"
      ? location.lng()
      : typeof location.lng === "number"
        ? location.lng
        : location.longitude;

  return typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng)
    ? { lat, lng }
    : null;
}

function csvToArray(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function slugifyId(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `temporary-spot-${Date.now()}`
  );
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

function isExternalSourceProvider(
  value: unknown,
): value is EventExternalSourceSchema["provider"] {
  return (
    value === "eventfrog" ||
    value === "spt" ||
    value === "spl" ||
    value === "parkour_earth" ||
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

function isFeaturedParticipantType(
  value: string,
): value is EventFeaturedParticipantType {
  return value === "person" || value === "group";
}

function isFeaturedParticipantRole(
  value: string,
): value is EventFeaturedParticipantRole {
  return (
    value === "athlete" ||
    value === "judge" ||
    value === "coach" ||
    value === "instructor" ||
    value === "speaker" ||
    value === "artist" ||
    value === "dj" ||
    value === "performer" ||
    value === "host" ||
    value === "guest"
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
