import { DatePipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatCardModule } from "@angular/material/card";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { map } from "rxjs/operators";
import { SpotListComponent } from "../spot-list/spot-list.component";
import { CommunityPlaceholderSectionComponent } from "../community-placeholder-section/community-placeholder-section.component";
import { CommunityLandingPageData } from "../../services/firebase/firestore/landing-pages.service";

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
    MatCardModule,
    RouterLink,
    SpotListComponent,
    CommunityPlaceholderSectionComponent,
  ],
  templateUrl: "./community-landing-page.component.html",
  styleUrl: "./community-landing-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityLandingPageComponent {
  private _route = inject(ActivatedRoute);

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

  landingData = computed(() => this._landingData());

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
