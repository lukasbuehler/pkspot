import { DatePipe, NgOptimizedImage } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { map } from "rxjs/operators";
import { SpotListComponent } from "../spot-list/spot-list.component";
import {
  CommunityLandingPageData as CommunityPanelData,
  LandingPagesService,
} from "../../services/firebase/firestore/landing-pages.service";
import { Event as PkEvent } from "../../../db/models/Event";
import { MapInfoPanelComponent } from "../map-info-panel/map-info-panel.component";
import { EventCardComponent } from "../event-card/event-card.component";
import { CommunityInfoCardSchema } from "../../../db/schemas/CommunityPageSchema";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { countries } from "../../../scripts/Countries";
import { buildSpotCanonicalPath } from "../../../scripts/SpotRouteHelpers";
import {
  communityInfoCardCategoryIcon,
  communityLocalizedText,
} from "../../../scripts/CommunityInfoCardHelpers";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { CommunityKnowledgeEditorComponent } from "../community-knowledge-editor/community-knowledge-editor.component";
import { collectCommunitySpotDirectory } from "../../shared/community-spot-directory";

type CommunityExploreMode = "all" | "dry";

type CommunityInfoCardCtaView =
  | {
      label: string;
      target: "spot" | "event";
      path: string;
    }
  | {
      label: string;
      target: "url";
      url: string;
    };

interface CommunityInfoCardView {
  id: string;
  title: string;
  body: string | null;
  icon: string;
  disclosure: string | null;
  cta: CommunityInfoCardCtaView | null;
  priority: number;
}

@Component({
  selector: "app-community-landing-page",
  imports: [
    DatePipe,
    NgOptimizedImage,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    RouterLink,
    SpotListComponent,
    EventCardComponent,
    MapInfoPanelComponent,
    CommunityKnowledgeEditorComponent,
  ],
  templateUrl: "./community-landing-page.component.html",
  styleUrl: "./community-landing-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityLandingPageComponent {
  private _route = inject(ActivatedRoute);
  private _authService = inject(AuthenticationService);
  private _landingPagesService = inject(LandingPagesService);
  private _snackbar = inject(MatSnackBar);
  private _locale = inject(LOCALE_ID);

  communityDataInput = input<CommunityPanelData | null | undefined>(undefined);
  panelMode = input(false);
  openProgress = input<number>(1);
  backLabel = input<string | null>(null);
  backTypeLabel = input<string | null>(null);
  loading = input(false);
  loadingTitle = input<string>("");
  loadingTotalSpots = input<number | null>(null);
  loadingScope = input<CommunityPanelData["scope"] | undefined>(undefined);
  loadingCountryCode = input<string | null | undefined>(undefined);

  /** Emitted when the user closes the panel (panel mode only). */
  closePanel = output<void>();
  /** Emitted when the user taps the contextual panel back button. */
  back = output<void>();

  /** Emitted when the user clicks an event card in panel mode. */
  selectEvent = output<PkEvent>();

  /** Emitted when panel-mode navigation should stay inside the map panel. */
  openCommunityPath = output<string>();

  /** Emitted when the user clicks a spot card in panel mode. */
  selectSpot = output<SpotPreviewData>();
  /** Emitted when panel mode should close and show the map around this community. */
  exploreCommunitySpots = output<CommunityExploreMode>();

  isAdmin = computed(() => this._authService.isAdmin());
  isEditingKnowledge = signal(false);
  isSavingKnowledge = signal(false);
  private _infoCardsOverride = signal<{
    communityKey: string;
    infoCards: CommunityInfoCardSchema[];
  } | null>(null);

  onClose() {
    this.closePanel.emit();
  }

  onBack() {
    this.back.emit();
  }

  /** Maximum events shown above the spots before falling back to a "more" link. */
  private readonly EVENT_LIMIT = 3;
  /** Event previews embedded on the community document. */
  communityEvents = computed(() => this.communityData()?.eventPreviews ?? []);
  visibleEvents = computed(() =>
    this.communityEvents().slice(0, this.EVENT_LIMIT),
  );
  hasMoreEvents = computed(
    () => this.communityEvents().length > this.EVENT_LIMIT,
  );

  private _communityData = toSignal(
    this._route.data.pipe(
      map((data) => data["communityLanding"] as CommunityPanelData | undefined),
    ),
    {
      initialValue: this._route.snapshot.data["communityLanding"] as
        | CommunityPanelData
        | undefined,
    },
  );

  communityData = computed(() => {
    const data = this.communityDataInput() ?? this._communityData() ?? undefined;
    const override = this._infoCardsOverride();
    if (!data || override?.communityKey !== data.communityKey) {
      return data;
    }

    return {
      ...data,
      infoCards: override.infoCards,
    };
  });

  heading = computed(() => {
    if (this.loading()) {
      return this.loadingTitle();
    }

    const data = this.communityData();
    return data?.displayName ?? "";
  });

  introText = computed(() => {
    const data = this.communityData();
    if (!data) {
      return "";
    }

    if (data.notFound) {
      return "We could not find a PK Spot community page for this route yet.";
    }

    return `Find parkour spots, events, and local community info for ${data.displayName}.`;
  });

  scopeLabel = computed(() => {
    const scope = this.loading() ? this.loadingScope() : this.communityData()?.scope;
    if (!scope) {
      return "Community";
    }

    return `${scope.charAt(0).toUpperCase()}${scope.slice(1)} Community`;
  });

  parentBreadcrumb = computed(() => {
    const data = this.communityData();
    if (!data || data.breadcrumbs.length < 3) {
      return null;
    }

    return data.breadcrumbs[data.breadcrumbs.length - 2] ?? null;
  });

  countryBreadcrumb = computed(() => {
    const data = this.communityData();
    if (!data) {
      return null;
    }

    return (
      data.breadcrumbs.find(
        (breadcrumb) => breadcrumb.name === data.country.name,
      ) ??
      data.breadcrumbs[1] ??
      null
    );
  });

  totalSpotCount = computed(() => this.communityData()?.totalSpotCount ?? 0);
  topRatedCount = computed(() => this.communityData()?.topRatedCount ?? 0);
  dryCount = computed(() => this.communityData()?.dryCount ?? 0);
  countryFlag = computed(() =>
    this._getCountryFlag(
      this.loading()
        ? this.loadingCountryCode()
        : this.communityData()?.country.code,
    ),
  );
  childCommunities = computed(
    () => this.communityData()?.childCommunities ?? [],
  );
  communityInfoCards = computed(() =>
    this._toCommunityInfoCards(this.communityData()?.infoCards ?? []),
  );
  communityKnowledgeCards = computed(
    () => this.communityData()?.infoCards ?? [],
  );
  contactQueryParams = computed(() => {
    const data = this.communityData();
    return {
      topic: "general",
      ...(data?.canonicalPath ? { source: data.canonicalPath } : {}),
      ...(data?.displayName ? { community: data.displayName } : {}),
    };
  });
  canEditKnowledge = computed(
    () => this.isAdmin() && !!this.communityData()?.communityKey,
  );
  hasFeaturedSpots = computed(() => {
    const data = this.communityData();
    return (
      this.communityPickSections().length > 0 ||
      (data?.spots?.length ?? 0) > 0 ||
      (data?.topRatedSpots.length ?? 0) > 0 ||
      (data?.drySpots.length ?? 0) > 0
    );
  });
  featuredSpots = computed(() => {
    const data = this.communityData();
    return data?.spots?.length ? data.spots : (data?.topRatedSpots ?? []);
  });
  communityPickSections = computed(() =>
    (this.communityData()?.communityPicks ?? []).filter(
      (section) => section.spots.length > 0,
    ),
  );
  crawlerSpotDirectory = computed(() => {
    const data = this.communityData();
    return data ? collectCommunitySpotDirectory(data) : [];
  });

  crawlerSpotDirectoryHeading = computed(() => {
    const data = this.communityData();
    return data
      ? `Parkour spots in ${data.displayName}`
      : "Parkour spot directory";
  });

  onSelectEvent(event: PkEvent): void {
    this.selectEvent.emit(event);
  }

  onCommunityPathClick(event: MouseEvent, path: string): void {
    event.preventDefault();
    this.openCommunityPath.emit(path);
  }

  onSelectSpot(spot: SpotPreviewData | Spot | LocalSpot): void {
    if ("clone" in spot) {
      return;
    }

    this.selectSpot.emit(spot);
  }

  exploreMapQueryParams(mode: CommunityExploreMode): Record<string, string> {
    const data = this.communityData();
    const params: Record<string, string> = {};
    if (data?.preferredSlug) {
      params["community"] = data.preferredSlug;
    }
    if (mode === "dry") {
      params["filter"] = "dry";
    }
    return params;
  }

  onExploreCommunitySpots(event: MouseEvent, mode: CommunityExploreMode): void {
    if (!this.panelMode()) {
      return;
    }

    event.preventDefault();
    this.exploreCommunitySpots.emit(mode);
  }

  spotDirectoryPath(spot: SpotPreviewData): string {
    return buildSpotCanonicalPath(spot.slug ?? spot.id);
  }

  spotDirectoryDescription(spot: SpotPreviewData): string {
    const parts = [
      spot.locality,
      this._spotTypeLabel(spot.type),
      this._spotAccessLabel(spot.access),
      this._spotRatingLabel(spot.rating),
      this._spotAmenityLabel(spot),
    ]
      .filter((part): part is string => !!part)
      .filter((part, index, all) => all.indexOf(part) === index);

    return parts.join(" - ");
  }

  startKnowledgeEdit(): void {
    if (!this.canEditKnowledge()) {
      return;
    }
    this.isEditingKnowledge.set(true);
  }

  cancelKnowledgeEdit(): void {
    this.isEditingKnowledge.set(false);
  }

  async saveKnowledgeCards(cards: CommunityInfoCardSchema[]): Promise<void> {
    const data = this.communityData();
    if (!data || !this.canEditKnowledge()) {
      return;
    }

    this.isSavingKnowledge.set(true);
    try {
      await this._landingPagesService.updateCommunityInfoCards(
        data.communityKey,
        cards,
      );
      this._infoCardsOverride.set({
        communityKey: data.communityKey,
        infoCards: cards,
      });
      this.isEditingKnowledge.set(false);
      this._snackbar.open($localize`Community knowledge saved`, undefined, {
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to save community knowledge cards", error);
      this._snackbar.open(
        $localize`Failed to save community knowledge`,
        undefined,
        { duration: 5000 },
      );
    } finally {
      this.isSavingKnowledge.set(false);
    }
  }

  lastUpdatedDate = computed(() => {
    const data = this.communityData();
    const timestamp = data?.sourceMaxUpdatedAt ?? data?.generatedAt;

    if (!timestamp) {
      return null;
    }

    if (timestamp instanceof Date) {
      return timestamp;
    }

    if (typeof (timestamp as { toDate?: () => Date }).toDate === "function") {
      return (timestamp as { toDate: () => Date }).toDate();
    }

    if (typeof (timestamp as { seconds?: number }).seconds === "number") {
      return new Date((timestamp as { seconds: number }).seconds * 1000);
    }

    return null;
  });

  private _toCommunityInfoCards(
    cards: CommunityInfoCardSchema[],
  ): CommunityInfoCardView[] {
    return cards
      .filter((card) => card.visibility !== "hidden")
      .map((card, index) => {
        const title = communityLocalizedText(card.title, this._locale);
        return {
          id: card.id || `${index}-${title}`,
          title,
          body: communityLocalizedText(card.body, this._locale) || null,
          icon: communityInfoCardCategoryIcon(card.category),
          disclosure: this._communityInfoDisclosure(card),
          cta: this._communityInfoCardCta(card),
          priority: card.priority ?? index,
        };
      })
      .filter((card) => card.title.length > 0)
      .sort(
        (left, right) =>
          left.priority - right.priority || left.id.localeCompare(right.id),
      );
  }

  private _communityInfoDisclosure(
    card: CommunityInfoCardSchema,
  ): string | null {
    switch (card.commercialDisclosure) {
      case "classes":
        return $localize`:@@community.info_disclosure_classes:Classes`;
      case "paid-partnership":
        return $localize`:@@community.info_disclosure_paid:Paid partnership`;
      case "shop":
        return $localize`:@@community.info_disclosure_shop:Shop`;
      default:
        return null;
    }
  }

  private _communityInfoCardCta(
    card: CommunityInfoCardSchema,
  ): CommunityInfoCardCtaView | null {
    const cta = card.cta;
    if (!cta) {
      return null;
    }

    const label = communityLocalizedText(cta.label, this._locale);
    if (!label) {
      return null;
    }

    switch (cta.target) {
      case "spot":
        if (!cta.spotId.trim()) {
          return null;
        }
        return {
          label,
          target: "spot",
          path: buildSpotCanonicalPath(cta.spotId),
        };
      case "event":
        if (!cta.eventId.trim()) {
          return null;
        }
        return {
          label,
          target: "event",
          path: `/events/${encodeURIComponent(cta.eventId)}`,
        };
      case "url": {
        const url = this._safeExternalUrl(cta.url);
        return url
          ? {
              label,
              target: "url",
              url,
            }
          : null;
      }
    }
  }

  private _safeExternalUrl(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.toString();
      }
      return null;
    } catch {
      return null;
    }
  }

  private _getCountryFlag(countryCode: string | null | undefined): string {
    const normalizedCode = String(countryCode ?? "").trim().toUpperCase();
    return normalizedCode ? (countries[normalizedCode]?.emoji ?? "") : "";
  }

  private _spotTypeLabel(type: string | null | undefined): string | null {
    const labels: Record<string, string> = {
      pk_park: "parkour park",
      parkour_gym: "parkour gym",
      street_spot: "street spot",
      school: "schoolyard spot",
      playground: "playground spot",
      trampoline_park: "trampoline park",
      gymnastics_gym: "gymnastics gym",
    };
    return type ? (labels[type] ?? null) : null;
  }

  private _spotAccessLabel(access: string | null | undefined): string | null {
    const labels: Record<string, string> = {
      public: "public access",
      commercial: "commercial access",
      private: "private access",
      off_limits: "off limits",
    };
    return access ? (labels[access] ?? null) : null;
  }

  private _spotRatingLabel(rating: number | null | undefined): string | null {
    if (typeof rating !== "number" || !Number.isFinite(rating) || rating <= 0) {
      return null;
    }
    return `${rating}/5 rating`;
  }

  private _spotAmenityLabel(spot: SpotPreviewData): string | null {
    const amenityNames = Object.entries(spot.amenities ?? {})
      .filter(([, value]) => value === true)
      .map(([key]) => key.replace(/_/gu, " "));

    return amenityNames.length > 0
      ? `amenities: ${amenityNames.slice(0, 4).join(", ")}`
      : null;
  }
}
