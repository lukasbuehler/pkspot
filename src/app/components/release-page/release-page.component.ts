import { ChangeDetectionStrategy, Component, computed, effect, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { map } from "rxjs";
import { MetaTagService } from "../../services/meta-tag.service";
import { RELEASES } from "../../releases/release-notes";
import { releaseView } from "../../releases/release-view";
import { ReleaseHeroComponent } from "../release-hero/release-hero.component";
import { ReleaseHighlightsComponent } from "../release-highlights/release-highlights.component";
import { ReleaseNotesListComponent } from "../release-notes-list/release-notes-list.component";

/**
 * `/releases/:version`: one release with its animated hero, translated
 * highlights and full notes. `releaseExistsGuard` keeps unknown versions out.
 */
@Component({
  selector: "app-release-page",
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    ReleaseHeroComponent,
    ReleaseHighlightsComponent,
    ReleaseNotesListComponent,
  ],
  templateUrl: "./release-page.component.html",
  styleUrl: "./release-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleasePageComponent {
  private readonly metaTags = inject(MetaTagService);
  private readonly version = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get("version") ?? "")),
    { initialValue: "" },
  );

  private readonly index = computed(() => RELEASES.findIndex((release) => release.version === this.version()));
  protected readonly view = computed(() => {
    const release = RELEASES[this.index()];
    return release ? releaseView(release) : null;
  });
  /** RELEASES is newest first. */
  protected readonly newer = computed(() => (this.index() > 0 ? releaseView(RELEASES[this.index() - 1]) : null));
  protected readonly older = computed(() => {
    const release = RELEASES[this.index() + 1];
    return this.index() >= 0 && release ? releaseView(release) : null;
  });

  constructor() {
    // Moving between releases reuses this component, so the tags follow the route.
    effect(() => {
      const view = this.view();
      if (!view) return;
      const name = view.release.name ? ` – ${view.release.name}` : "";
      this.metaTags.setStaticPageMetaTags(
        $localize`:@@release.meta.title:Version ${view.label}:version:` + name,
        view.highlights.length
          ? view.highlights.map((highlight) => highlight.title).join(" · ")
          : view.notes.slice(0, 3).map((note) => note.text).join(" · "),
        undefined,
        `/releases/${view.release.version}`,
      );
    });
  }
}
