import { DatePipe, isPlatformBrowser, NgOptimizedImage } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { map } from "rxjs/operators";
import { SpotListComponent } from "../spot-list/spot-list.component";
import { CommunityLandingPageData } from "../../services/firebase/firestore/landing-pages.service";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { MediaPlaceholderComponent } from "../media-placeholder/media-placeholder.component";
import { EntityPreviewCardComponent } from "../entity-preview-card/entity-preview-card.component";

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
    MatTooltipModule,
    RouterLink,
    SpotListComponent,
    MediaPlaceholderComponent,
    EntityPreviewCardComponent,
  ],
  templateUrl: "./community-landing-page.component.html",
  styleUrl: "./community-landing-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityLandingPageComponent {
  private _route = inject(ActivatedRoute);
  private _platformId = inject(PLATFORM_ID);
  private _eventsService = inject(EventsService);

  landingDataInput = input<CommunityLandingPageData | null | undefined>(
    undefined
  );
  panelMode = input(false);

  /** Emitted when the user closes the panel (panel mode only). */
  closePanel = output<void>();

  /** Emitted when the user clicks an event card in panel mode. */
  selectEvent = output<PkEvent>();

  onClose() {
    this.closePanel.emit();
  }

  /** Maximum events shown above the spots before falling back to a "more" link. */
  private readonly EVENT_LIMIT = 3;
  /**
   * Events whose `community_keys` match this page (loaded async).
   * Named `communityEvents` to avoid collision with `events` (manual link
   * items from `CommunityPageSchema.events`).
   */
  communityEvents = signal<PkEvent[]>([]);
  visibleEvents = computed(() =>
    this.communityEvents().slice(0, this.EVENT_LIMIT)
  );
  hasMoreEvents = computed(
    () => this.communityEvents().length > this.EVENT_LIMIT
  );

  private _landingData = toSignal(
    this._route.data.pipe(
      map(
        (data) =>
          data["communityLanding"] as CommunityLandingPageData | undefined
      )
    ),
    {
      initialValue: this._route.snapshot.data[
        "communityLanding"
      ] as CommunityLandingPageData | undefined,
    }
  );

  landingData = computed(
    () => this.landingDataInput() ?? this._landingData() ?? undefined
  );

  heading = computed(() => {
    const data = this.landingData();
    return data?.displayName ?? "";
  });

  introText = computed(() => {
    const data = this.landingData();
    if (!data) {
      return "";
    }

    if (data.notFound) {
      return "We could not find a PK Spot community page for this route yet.";
    }

    return data.description;
  });

  scopeLabel = computed(() => {
    const scope = this.landingData()?.scope;
    if (!scope) {
      return "Community";
    }

    return `${scope.charAt(0).toUpperCase()}${scope.slice(1)} Community`;
  });

  parentBreadcrumb = computed(() => {
    const data = this.landingData();
    if (!data || data.breadcrumbs.length < 3) {
      return null;
    }

    return data.breadcrumbs[data.breadcrumbs.length - 2] ?? null;
  });

  totalSpotCount = computed(() => this.landingData()?.totalSpotCount ?? 0);
  topRatedCount = computed(() => this.landingData()?.topRatedCount ?? 0);
  dryCount = computed(() => this.landingData()?.dryCount ?? 0);
  childCommunities = computed(() => this.landingData()?.childCommunities ?? []);
  communityLinks = computed(() => this._toCommunityLinks(this.landingData()));
  resources = computed(() =>
    this._toSectionItems(this.landingData()?.resources ?? [])
  );
  organisations = computed(() =>
    this._toSectionItems(this.landingData()?.organisations ?? [])
  );
  athletes = computed(() =>
    this._toSectionItems(this.landingData()?.athletes ?? [])
  );
  events = computed(() => this._toSectionItems(this.landingData()?.events ?? []));
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
    const data = this.landingData();
    return (data?.topRatedSpots.length ?? 0) > 0 || (data?.drySpots.length ?? 0) > 0;
  });

  constructor() {
    if (isPlatformBrowser(this._platformId)) {
      // Reload events whenever the landing data (and therefore the community
      // key) changes — e.g., navigating between communities in the panel.
      effect(() => {
        const data = this.landingData();
        if (!data || data.notFound || !data.communityKey) {
          this.communityEvents.set([]);
          return;
        }
        const key = data.communityKey;
        this._eventsService
          .getEventsForCommunity(key, { withinMonths: 6 })
          .then((events) => {
            // Guard against late returns after the user navigated away.
            if (this.landingData()?.communityKey === key) {
              this.communityEvents.set(events);
            }
          })
          .catch((err) => {
            console.warn("CommunityLanding: failed to load events", err);
            this.communityEvents.set([]);
          });
      });
    }
  }

  formatEventDateRange(event: PkEvent): string {
    const start = event.start.toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
    const end = event.end.toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
    return start === end ? start : `${start} – ${end}`;
  }

  onSelectEvent(event: PkEvent): void {
    this.selectEvent.emit(event);
  }

  lastUpdatedDate = computed(() => {
    const data = this.landingData();
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
    data: CommunityLandingPageData | undefined
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
    items: CommunityLandingPageData["resources"]
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
}
