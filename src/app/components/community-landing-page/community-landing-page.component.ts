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
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { LocalSpot, Spot } from "../../../db/models/Spot";
import { countries } from "../../../scripts/Countries";

type CommunityExploreMode = "all" | "dry";

interface CommunityExternalLink {
  label: string;
  url: string;
}

interface CommunitySectionItem {
  name: string;
  url: string | null;
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

    return data.description;
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
  communityLinks = computed(() => this._toCommunityLinks(this.communityData()));
  resources = computed(() =>
    this._toSectionItems(this.communityData()?.resources ?? []),
  );
  organisations = computed(() =>
    this._toSectionItems(this.communityData()?.organisations ?? []),
  );
  athletes = computed(() =>
    this._toSectionItems(this.communityData()?.athletes ?? []),
  );
  events = computed(() =>
    this._toSectionItems(this.communityData()?.events ?? []),
  );
  hasManualSections = computed(() => {
    return (
      this.communityLinks().length > 0 ||
      this.resources().length > 0 ||
      this.organisations().length > 0 ||
      this.athletes().length > 0 ||
      this.events().length > 0
    );
  });
  hasFeaturedSpots = computed(() => {
    const data = this.communityData();
    return (
      (data?.topRatedSpots.length ?? 0) > 0 || (data?.drySpots.length ?? 0) > 0
    );
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

  private _toCommunityLinks(
    data: CommunityPanelData | undefined,
  ): CommunityExternalLink[] {
    if (!data) {
      return [];
    }

    const linkEntries: Array<[string, string | null | undefined]> = [
      ["WhatsApp", data.links.whatsapp],
      ["Telegram", data.links.telegram],
      ["Instagram", data.links.instagram],
      ["Discord", data.links.discord],
    ];

    return linkEntries
      .map(([label, url]) => ({
        label,
        url: this._safeExternalUrl(url),
      }))
      .filter((item): item is CommunityExternalLink => item.url !== null);
  }

  private _toSectionItems(
    items: CommunityPanelData["resources"],
  ): CommunitySectionItem[] {
    return items
      .map((item) => ({
        name: item.name.trim(),
        url: this._safeExternalUrl(item.url ?? undefined),
      }))
      .filter((item) => item.name.length > 0);
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
