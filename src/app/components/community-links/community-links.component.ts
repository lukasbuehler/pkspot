import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { EntityPreviewCardComponent } from "../entity-preview-card/entity-preview-card.component";
import { buildCommunityLandingPath } from "../../../scripts/CommunityHelpers";
import {
  CommunitySearchPreview,
  SearchService,
} from "../../services/search.service";

export interface CommunityLink {
  key: string;
  name: string;
  path: string;
  imageUrl?: string;
}

/**
 * Maps community previews onto links, keeping the order of `keys`. Previews
 * without a page (unpublished or unknown keys, or no slug) are skipped so the
 * list never links to a route that would render "Community not found".
 */
export function communityLinksFromPreviews(
  keys: readonly string[],
  previews: readonly CommunitySearchPreview[],
): CommunityLink[] {
  const byKey = new Map(previews.map((preview) => [preview.communityKey, preview]));
  const seen = new Set<string>();
  const links: CommunityLink[] = [];
  for (const key of keys) {
    const preview = byKey.get(key);
    if (!preview || seen.has(key)) continue;
    const path =
      preview.canonicalPath ||
      (preview.slug ? buildCommunityLandingPath(preview.slug) : "");
    if (!path || !preview.displayName) continue;
    seen.add(key);
    links.push({
      key,
      name: preview.displayName,
      path,
      imageUrl: preview.imageUrl,
    });
  }
  return links;
}

/**
 * Crawlable list of community pages. Renders plain `<a href>` links
 * (`routerLink`) so crawlers can follow them without running JavaScript.
 */
@Component({
  selector: "app-community-links",
  imports: [RouterLink, EntityPreviewCardComponent],
  templateUrl: "./community-links.component.html",
  styleUrl: "./community-links.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityLinksComponent {
  private readonly search = inject(SearchService);

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
}
