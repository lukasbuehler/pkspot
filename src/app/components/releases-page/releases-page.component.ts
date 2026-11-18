import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { MetaTagService } from "../../services/meta-tag.service";
import { RELEASES } from "../../releases/release-notes";
import { releaseView } from "../../releases/release-view";
import { ReleaseHeroComponent } from "../release-hero/release-hero.component";
import { ReleaseHighlightsComponent } from "../release-highlights/release-highlights.component";
import { ReleaseNotesListComponent } from "../release-notes-list/release-notes-list.component";

/**
 * `/releases`: every PK Spot release, newest first. The latest one is
 * featured with its animated hero; older ones show their notes in full.
 */
@Component({
  selector: "app-releases-page",
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    RouterLink,
    ReleaseHeroComponent,
    ReleaseHighlightsComponent,
    ReleaseNotesListComponent,
  ],
  templateUrl: "./releases-page.component.html",
  styleUrl: "./releases-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleasesPageComponent {
  protected readonly latest = releaseView(RELEASES[0]);
  protected readonly older = RELEASES.slice(1).map(releaseView);

  constructor() {
    inject(MetaTagService).setStaticPageMetaTags(
      $localize`:@@releases.meta.title:What's new`,
      $localize`:@@releases.meta.description:Release notes for every PK Spot update: new features, improvements and bug fixes on the web, iOS and Android.`,
      undefined,
      "/releases",
    );
  }
}
