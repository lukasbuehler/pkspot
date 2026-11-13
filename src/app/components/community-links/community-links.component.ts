import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
} from "@angular/core";
import { Router } from "@angular/router";
import { MapCommunityListComponent } from "../map/map-community-list/map-community-list.component";
import { COMMUNITY_PATH_OPENER } from "./community-path-opener";
import { buildCommunityLandingPath } from "../../../scripts/CommunityHelpers";
import {
  CommunitySearchPreview,
  SearchService,
} from "../../services/search.service";

/** Most specific first, like the map's community list: town, region, country. */
const SCOPE_ORDER: Record<string, number> = { locality: 0, region: 1, country: 2 };

/**
 * Orders community previews from the most specific to the broadest (ties keep
 * the order of `keys`) and gives each its page path in `canonicalPath`. Previews without a page (unpublished or unknown keys, or no
 * slug) are skipped so the list never links to a route that would render
 * "Community not found".
 */
export function communityLinksFromPreviews(
  keys: readonly string[],
  previews: readonly CommunitySearchPreview[],
): CommunitySearchPreview[] {
  const byKey = new Map(previews.map((preview) => [preview.communityKey, preview]));
  const seen = new Set<string>();
  const links: CommunitySearchPreview[] = [];
  for (const key of keys) {
    const preview = byKey.get(key);
    if (!preview || seen.has(key)) continue;
    const path =
      preview.canonicalPath ||
      (preview.slug ? buildCommunityLandingPath(preview.slug) : "");
    if (!path || !preview.displayName) continue;
    seen.add(key);
    links.push({ ...preview, canonicalPath: path });
  }
  const rank = (preview: CommunitySearchPreview) =>
    SCOPE_ORDER[preview.scope ?? ""] ?? 1;
  return links.sort((a, b) => rank(a) - rank(b));
}

/**
 * Communities a Spot or Event belongs to, shown like the map's community list.
 * Rows are plain `<a href>` links so crawlers can follow them without running
 * JavaScript; clicks navigate in the app.
 */
@Component({
  selector: "app-community-links",
  imports: [MapCommunityListComponent],
  templateUrl: "./community-links.component.html",
  styleUrl: "./community-links.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityLinksComponent {
  private readonly search = inject(SearchService);
  private readonly router = inject(Router);
  private readonly pathOpener = inject(COMMUNITY_PATH_OPENER, { optional: true });

  /** Which context the list is shown in; selects the heading copy. */
  readonly kind = input.required<"spot" | "event">();
  readonly communityKeys = input<readonly string[]>([]);

  private readonly previews = resource({
    params: () => {
      const keys = this.communityKeys();
      return keys.length > 0 ? { keys } : undefined;
    },
    loader: async ({ params, abortSignal }) => {
      try {
        return await this.search.getCommunityPreviewsByKeys(
          params.keys,
          abortSignal,
        );
      } catch (error) {
        if (!abortSignal.aborted) {
          console.warn("[CommunityLinks] communities unavailable", error);
        }
        return [];
      }
    },
  });

  readonly links = computed(() =>
    communityLinksFromPreviews(this.communityKeys(), this.previews.value() ?? []),
  );

  openCommunity(community: CommunitySearchPreview): void {
    const path = community.canonicalPath;
    if (!path) return;
    if (this.pathOpener) {
      this.pathOpener.openCommunityPath(path);
    } else {
      void this.router.navigateByUrl(path);
    }
  }
}
