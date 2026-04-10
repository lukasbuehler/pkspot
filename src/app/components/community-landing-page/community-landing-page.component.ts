import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatCardModule } from "@angular/material/card";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { map } from "rxjs/operators";
import { SpotListComponent } from "../spot-list/spot-list.component";
import { CommunityPlaceholderSectionComponent } from "../community-placeholder-section/community-placeholder-section.component";
import { CommunityLandingPageData } from "../../services/firebase/firestore/landing-pages.service";

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
}
