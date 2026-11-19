import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MetaTagService } from "../../services/meta-tag.service";
import { RELEASES } from "../../releases/release-notes";
import { releaseView } from "../../releases/release-view";
import { ReleaseCardComponent } from "../release-card/release-card.component";

/**
 * `/releases`: every PK Spot release, newest first, as cards with the
 * release's banner and highlights. The full notes are on each release page.
 */
@Component({
  selector: "app-releases-page",
  imports: [ReleaseCardComponent],
  templateUrl: "./releases-page.component.html",
  styleUrl: "./releases-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleasesPageComponent {
  protected readonly releases = RELEASES.map(releaseView);

  constructor() {
    inject(MetaTagService).setStaticPageMetaTags(
      $localize`:@@releases.meta.title:What's new`,
      $localize`:@@releases.meta.description:Release notes for every PK Spot update: new features, improvements and bug fixes on the web, iOS and Android.`,
      undefined,
      "/releases",
    );
  }
}
