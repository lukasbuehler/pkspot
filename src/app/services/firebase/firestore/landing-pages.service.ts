import { Injectable, inject } from "@angular/core";
import { CommunityPageSchema } from "../../../../db/schemas/CommunityPageSchema";
import { SpotPreviewData } from "../../../../db/schemas/SpotPreviewData";
import {
  buildCommunityLandingPath,
  normalizeCommunitySlug,
} from "../../../../scripts/CommunityHelpers";
import {
  FirestoreAdapterService,
  QueryConstraintOptions,
  QueryFilter,
} from "../firestore-adapter.service";

export type CommunityLandingScope = CommunityPageSchema["scope"];

export interface CommunityLandingLocation {
  name: string;
  slug?: string;
  code?: string;
}

export interface CommunityLandingBreadcrumb {
  name: string;
  path: string;
}

export interface CommunityLandingPageData {
  communityKey: string;
  scope: CommunityLandingScope;
  displayName: string;
  preferredSlug: string;
  requestedSlug: string;
  canonicalPath: string;
  title: string;
  description: string;
  imageUrl: string;
  country: CommunityLandingLocation;
  region?: CommunityLandingLocation;
  locality?: CommunityLandingLocation;
  breadcrumbs: CommunityLandingBreadcrumb[];
  totalSpotCount: number;
  topRatedCount: number;
  dryCount: number;
  topRatedSpots: SpotPreviewData[];
  drySpots: SpotPreviewData[];
  generatedAt?: CommunityPageSchema["generatedAt"];
  sourceMaxUpdatedAt?: CommunityPageSchema["sourceMaxUpdatedAt"];
  notFound?: boolean;
}

type CommunityPageDocument = CommunityPageSchema & { id: string };

@Injectable({
  providedIn: "root",
})
export class LandingPagesService {
  private _firestoreAdapter = inject(FirestoreAdapterService);

  async getCommunityPage(
    slug: string,
    limitCount: number = 12
  ): Promise<CommunityLandingPageData | null> {
    const normalizedSlug = normalizeCommunitySlug(slug);
    if (!normalizedSlug) {
      return null;
    }

    const filters: QueryFilter[] = [
      {
        fieldPath: "allSlugs",
        opStr: "array-contains",
        value: normalizedSlug,
      },
    ];
    const constraints: QueryConstraintOptions[] = [
      { type: "limit", limit: 1 },
    ];

    const [pageDoc] = await this._firestoreAdapter.getCollection<CommunityPageDocument>(
      "community_pages",
      filters,
      constraints
    );

    if (!pageDoc) {
      return null;
    }

    return this._mapPageDoc(pageDoc, normalizedSlug, limitCount);
  }

  private _mapPageDoc(
    pageDoc: CommunityPageDocument,
    requestedSlug: string,
    limitCount: number
  ): CommunityLandingPageData {
    const topRatedSpots = (pageDoc.topRatedSpots ?? []).slice(0, limitCount);
    const drySpots = (pageDoc.drySpots ?? []).slice(0, limitCount);
    const countrySlug =
      pageDoc.scope === "country"
        ? pageDoc.preferredSlug
        : this._getSlugFromPath(pageDoc.breadcrumbs?.[1]?.path) ||
          pageDoc.geography.countrySlug;

    return {
      communityKey: pageDoc.communityKey,
      scope: pageDoc.scope,
      displayName: pageDoc.displayName,
      preferredSlug: pageDoc.preferredSlug,
      requestedSlug,
      canonicalPath:
        pageDoc.canonicalPath || buildCommunityLandingPath(pageDoc.preferredSlug),
      title: pageDoc.title,
      description: pageDoc.description,
      imageUrl: pageDoc.image?.url || "/assets/banner_1200x630.png",
      country: {
        code: pageDoc.geography.countryCode,
        name: pageDoc.geography.countryName || pageDoc.displayName,
        slug: countrySlug,
      },
      region: pageDoc.geography.regionName
        ? {
            code: pageDoc.geography.regionCode,
            name: pageDoc.geography.regionName,
            slug: pageDoc.geography.regionSlug,
          }
        : undefined,
      locality:
        pageDoc.scope === "locality" && pageDoc.geography.localityName
          ? {
              name: pageDoc.geography.localityName,
              slug: pageDoc.preferredSlug,
            }
          : undefined,
      breadcrumbs: pageDoc.breadcrumbs ?? [],
      totalSpotCount: pageDoc.counts?.totalSpots ?? 0,
      topRatedCount: pageDoc.counts?.topRated ?? topRatedSpots.length,
      dryCount: pageDoc.counts?.dry ?? drySpots.length,
      topRatedSpots,
      drySpots,
      generatedAt: pageDoc.generatedAt,
      sourceMaxUpdatedAt: pageDoc.sourceMaxUpdatedAt,
    };
  }

  private _getSlugFromPath(path: string | undefined): string | undefined {
    if (!path) {
      return undefined;
    }

    return path.split("/").filter(Boolean).at(-1);
  }
}
