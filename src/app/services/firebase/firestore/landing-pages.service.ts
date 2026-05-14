import { Injectable, inject } from "@angular/core";
import { Event as PkEvent } from "../../../../db/models/Event";
import {
  CommunityChildSummarySchema,
  CommunityEventPreviewSchema,
  CommunityPageSchema,
} from "../../../../db/schemas/CommunityPageSchema";
import { EventId, EventSchema } from "../../../../db/schemas/EventSchema";
import { CommunitySlugSchema } from "../../../../db/schemas/CommunitySlugSchema";
import { SpotPreviewData } from "../../../../db/schemas/SpotPreviewData";
import {
  buildCommunityLandingPath,
  normalizeCommunitySlug,
} from "../../../../scripts/CommunityHelpers";
import { FirestoreAdapterService } from "../firestore-adapter.service";

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

export type CommunityChildSummary = CommunityChildSummarySchema;

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
  hasCustomImage: boolean;
  country: CommunityLandingLocation;
  region?: CommunityLandingLocation;
  locality?: CommunityLandingLocation;
  breadcrumbs: CommunityLandingBreadcrumb[];
  totalSpotCount: number;
  topRatedCount: number;
  dryCount: number;
  topRatedSpots: SpotPreviewData[];
  drySpots: SpotPreviewData[];
  links: CommunityPageSchema["links"];
  resources: CommunityPageSchema["resources"];
  organisations: CommunityPageSchema["organisations"];
  athletes: CommunityPageSchema["athletes"];
  events: CommunityPageSchema["events"];
  childCommunities: CommunityChildSummary[];
  eventPreviews: PkEvent[];
  generatedAt?: CommunityPageSchema["generatedAt"];
  sourceMaxUpdatedAt?: CommunityPageSchema["sourceMaxUpdatedAt"];
  boundsCenter?: CommunityPageSchema["bounds_center"];
  boundsRadiusM?: CommunityPageSchema["bounds_radius_m"];
  googleMapsPlaceId?: CommunityPageSchema["google_maps_place_id"];
  notFound?: boolean;
}

type CommunityPageDocument = CommunityPageSchema & { id: string };
type CommunitySlugDocument = CommunitySlugSchema & { id: string };

@Injectable({
  providedIn: "root",
})
export class LandingPagesService {
  private _firestoreAdapter = inject(FirestoreAdapterService);

  async getCommunityPage(
    slug: string,
    limitCount: number = 8,
    _includeChildCommunities: boolean = true,
  ): Promise<CommunityLandingPageData | null> {
    const normalizedSlug = normalizeCommunitySlug(slug);
    if (!normalizedSlug) {
      return null;
    }

    const slugDoc =
      await this._firestoreAdapter.getDocument<CommunitySlugDocument>(
        `community_slugs/${normalizedSlug}`,
      );

    if (!slugDoc?.communityKey) {
      return null;
    }

    const pageDoc =
      await this._firestoreAdapter.getDocument<CommunityPageDocument>(
        `community_pages/${slugDoc.communityKey}`,
      );

    if (!pageDoc) {
      return null;
    }

    if (pageDoc.published === false) {
      return null;
    }

    return this._mapPageDoc(pageDoc, normalizedSlug, limitCount);
  }

  private _mapPageDoc(
    pageDoc: CommunityPageDocument,
    requestedSlug: string,
    limitCount: number,
  ): CommunityLandingPageData {
    const topRatedSpots = (pageDoc.topRatedSpots ?? []).slice(0, limitCount);
    const drySpots = (pageDoc.drySpots ?? []).slice(0, limitCount);
    const countrySlug =
      pageDoc.scope === "country"
        ? pageDoc.preferredSlug
        : this._getSlugFromPath(pageDoc.breadcrumbs?.[1]?.path) ||
          pageDoc.geography.countrySlug;

    const canonicalPath = this._normalizeCommunityPath(
      pageDoc.canonicalPath || buildCommunityLandingPath(pageDoc.preferredSlug),
    );

    return {
      communityKey: pageDoc.communityKey,
      scope: pageDoc.scope,
      displayName: pageDoc.displayName,
      preferredSlug: pageDoc.preferredSlug,
      requestedSlug,
      canonicalPath,
      title: pageDoc.title,
      description: pageDoc.description,
      imageUrl: pageDoc.image?.url || "/assets/banner_1200x630.png",
      hasCustomImage: pageDoc.image?.type
        ? pageDoc.image.type !== "default"
        : false,
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
      breadcrumbs: (pageDoc.breadcrumbs ?? []).map((breadcrumb) => ({
        ...breadcrumb,
        path: this._normalizeCommunityPath(breadcrumb.path),
      })),
      totalSpotCount: pageDoc.counts?.totalSpots ?? 0,
      topRatedCount: pageDoc.counts?.topRated ?? topRatedSpots.length,
      dryCount: pageDoc.counts?.dry ?? drySpots.length,
      topRatedSpots,
      drySpots,
      links: pageDoc.links ?? {},
      resources: pageDoc.resources ?? [],
      organisations: pageDoc.organisations ?? [],
      athletes: pageDoc.athletes ?? [],
      events: pageDoc.events ?? [],
      childCommunities: pageDoc.childCommunities ?? [],
      eventPreviews: (pageDoc.eventPreviews ?? []).map((eventPreview) =>
        this._mapEventPreview(eventPreview),
      ),
      generatedAt: pageDoc.generatedAt,
      sourceMaxUpdatedAt: pageDoc.sourceMaxUpdatedAt,
      boundsCenter: pageDoc.bounds_center,
      boundsRadiusM: pageDoc.bounds_radius_m,
      googleMapsPlaceId: pageDoc.google_maps_place_id,
    };
  }

  private _normalizeCommunityPath(path: string): string {
    return path.replace(/^\/map\/community\//u, "/map/communities/");
  }

  async getChildCommunities(
    parentCommunityKey: string,
    limitCount: number = 24,
  ): Promise<CommunityChildSummary[]> {
    const childDocs =
      await this._firestoreAdapter.getCollection<CommunityPageDocument>(
        "community_pages",
        [
          {
            fieldPath: "relationships.parentKeys",
            opStr: "array-contains",
            value: parentCommunityKey,
          },
        ],
      );

    return childDocs
      .filter((doc) => doc.published !== false)
      .map((doc) => ({
        communityKey: doc.communityKey,
        scope: doc.scope,
        displayName: doc.displayName,
        preferredSlug: doc.preferredSlug,
        canonicalPath:
          doc.canonicalPath || buildCommunityLandingPath(doc.preferredSlug),
        totalSpotCount: doc.counts?.totalSpots ?? 0,
        dryCount: doc.counts?.dry ?? 0,
      }))
      .sort((left, right) => {
        if (right.totalSpotCount !== left.totalSpotCount) {
          return right.totalSpotCount - left.totalSpotCount;
        }
        return left.displayName.localeCompare(right.displayName);
      })
      .slice(0, limitCount);
  }

  private _mapEventPreview(preview: CommunityEventPreviewSchema): PkEvent {
    return new PkEvent(
      preview.id as EventId,
      {
        name: preview.name,
        slug: preview.slug,
        banner_src: preview.banner_src,
        banner_fit: preview.banner_fit,
        banner_accent_color: preview.banner_accent_color,
        venue_string: preview.venue_string,
        locality_string: preview.locality_string,
        start: preview.start,
        end: preview.end,
        url: preview.url,
        spot_ids: [],
        bounds: preview.bounds ?? {
          north: 0,
          south: 0,
          east: 0,
          west: 0,
        },
        sponsor: preview.sponsor,
        external_source: preview.external_source,
        published: true,
      } as EventSchema,
    );
  }

  private _getSlugFromPath(path: string | undefined): string | undefined {
    if (!path) {
      return undefined;
    }

    return path.split("/").filter(Boolean).at(-1);
  }
}
