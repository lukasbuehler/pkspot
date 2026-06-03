import { DatePipe, NgOptimizedImage } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatTooltipModule } from "@angular/material/tooltip";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { map } from "rxjs/operators";
import { SpotListComponent } from "../spot-list/spot-list.component";
import { CommunityLandingPageData as CommunityPanelData } from "../../services/firebase/firestore/landing-pages.service";
import { Event as PkEvent } from "../../../db/models/Event";
import { MapInfoPanelComponent } from "../map-info-panel/map-info-panel.component";
import { EventCardComponent } from "../event-card/event-card.component";
import { CommunityInfoCardSchema } from "../../../db/schemas/CommunityPageSchema";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { countries } from "../../../scripts/Countries";
import { buildSpotCanonicalPath } from "../../../scripts/SpotRouteHelpers";

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
    MatTooltipModule,
    RouterLink,
    SpotListComponent,
    EventCardComponent,
    MapInfoPanelComponent,
  ],
  templateUrl: "./community-landing-page.component.html",
  styleUrl: "./community-landing-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityLandingPageComponent {
  private _route = inject(ActivatedRoute);

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

  communityData = computed(
    () => this.communityDataInput() ?? this._communityData() ?? undefined,
  );

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
      .map((card, index) => ({
        id: card.id || `${index}-${card.title}`,
        title: card.title.trim(),
        body: card.body?.trim() || null,
        icon: card.icon?.trim() || this._communityInfoCardIcon(card),
        disclosure: this._communityInfoDisclosure(card),
        cta: this._communityInfoCardCta(card),
        priority: card.priority ?? index,
      }))
      .filter((card) => card.title.length > 0)
      .sort(
        (left, right) =>
          left.priority - right.priority || left.id.localeCompare(right.id),
      );
  }

  private _communityInfoCardIcon(card: CommunityInfoCardSchema): string {
    switch (card.category) {
      case "jams":
        return "calendar_month";
      case "chat":
        return "groups";
      case "classes":
        return "school";
      case "spots":
        return "place";
      case "events":
        return "event";
      case "safety":
        return "info";
      default:
        return card.cta?.target === "url" ? "link" : "info";
    }
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

    const label = cta.label.trim();
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
}
