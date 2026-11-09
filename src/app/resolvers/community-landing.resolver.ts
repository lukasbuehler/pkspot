import { inject, PLATFORM_ID, RESPONSE_INIT } from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { ResolveFn, Router } from "@angular/router";
import {
  buildCommunityLandingPath,
  normalizeCommunitySlug,
} from "../../scripts/CommunityHelpers";
import { humanizeSlugSegment } from "../../scripts/SpotLandingHelpers";
import { MetaTagService } from "../services/meta-tag.service";
import { StructuredDataService } from "../services/structured-data.service";
import { permanentCanonicalRedirect } from "./canonical-redirect";
import {
  CommunityLandingPageData,
  LandingPagesService,
} from "../services/firebase/firestore/landing-pages.service";

const COMMUNITY_STRUCTURED_DATA_IDS = [
  "community-page",
  "community-breadcrumbs",
  "community-spots",
  "community-dry-spots",
] as const;

export const communityLandingResolver: ResolveFn<
  CommunityLandingPageData
> = async (route) => {
  const landingPagesService = inject(LandingPagesService);
  const metaTagService = inject(MetaTagService);
  const structuredDataService = inject(StructuredDataService);
  const responseInit = inject(RESPONSE_INIT);
  const router = inject(Router);
  const isServer = isPlatformServer(inject(PLATFORM_ID));

  const requestedSlug = normalizeCommunitySlug(route.paramMap.get("slug"));
  const pageData = await landingPagesService.getCommunityPage(requestedSlug);

  for (const id of COMMUNITY_STRUCTURED_DATA_IDS) {
    structuredDataService.removeStructuredData(id);
  }

  if (!pageData) {
    const canonicalPath = buildCommunityLandingPath(requestedSlug);
    const pageTitle = `${humanizeSlugSegment(requestedSlug)} Community`;

    if (responseInit) responseInit.status = 404;
    metaTagService.setStaticPageMetaTags(
      `${pageTitle} Not Found`,
      "This PK Spot community landing page could not be found.",
      undefined,
      canonicalPath,
    );
    metaTagService.setRobotsContent("noindex,nofollow");

    return {
      communityKey: "",
      scope: "locality",
      displayName: humanizeSlugSegment(requestedSlug),
      preferredSlug: requestedSlug,
      requestedSlug,
      canonicalPath,
      title: `${pageTitle} Not Found - PK Spot`,
      description: "This PK Spot community landing page could not be found.",
      imageUrl: "assets/banner_1200x630.png",
      hasCustomImage: false,
      country: {
        name: humanizeSlugSegment(requestedSlug),
      },
      breadcrumbs: [
        { name: "Map", path: "/map" },
        { name: humanizeSlugSegment(requestedSlug), path: canonicalPath },
      ],
      totalSpotCount: 0,
      topRatedCount: 0,
      dryCount: 0,
      spots: [],
      communityPicks: [],
      topRatedSpots: [],
      drySpots: [],
      links: {},
      infoCards: [],
      resources: [],
      organisations: [],
      athletes: [],
      events: [],
      childCommunities: [],
      eventPreviews: [],
      notFound: true,
    };
  }

  // Slugs of merged or renamed communities resolve to the page of the
  // community they now belong to (for example a suburb merged into its city).
  // Crawlers get a permanent redirect so only the canonical URL is indexed;
  // in-app navigation keeps rendering the resolved page and the map page
  // rewrites the address bar to the canonical path. Only redirect to the
  // community's own preferred-slug path so inconsistent data cannot produce a
  // redirect loop or send crawlers off the community namespace.
  const canonicalSlug = normalizeCommunitySlug(pageData.preferredSlug);
  if (
    isServer &&
    canonicalSlug &&
    route.paramMap.get("slug") !== canonicalSlug &&
    pageData.canonicalPath === buildCommunityLandingPath(canonicalSlug)
  ) {
    return permanentCanonicalRedirect(
      router,
      responseInit,
      pageData.canonicalPath,
      route.queryParams,
    );
  }

  // A canonical redirect re-runs this resolver for the target community in
  // the same server request. Keep its 301: Angular SSR reads the status when
  // it turns the finished navigation into the redirect response.
  if (responseInit && responseInit.status !== 301) responseInit.status = 200;

  metaTagService.setCommunityLandingMetaTags(
    pageData.title,
    pageData.description,
    pageData.imageUrl,
    pageData.canonicalPath,
  );

  structuredDataService.addStructuredData(
    "community-page",
    structuredDataService.generateCommunityLandingPageData(pageData),
  );
  structuredDataService.addStructuredData(
    "community-breadcrumbs",
    structuredDataService.generateBreadcrumbList(
      structuredDataService.buildCommunityBreadcrumbs(pageData),
    ),
  );

  const communitySpots =
    pageData.communityPicks?.flatMap((section) => section.spots) ??
    pageData.spots ??
    pageData.topRatedSpots;
  if (communitySpots.length > 0) {
    structuredDataService.addStructuredData(
      "community-spots",
      structuredDataService.generateSpotItemList(
        communitySpots,
        "Parkour Spots",
      ),
    );
  }

  if (pageData.drySpots.length > 0) {
    structuredDataService.addStructuredData(
      "community-dry-spots",
      structuredDataService.generateSpotItemList(
        pageData.drySpots,
        "Dry Parkour Spots",
      ),
    );
  }

  return pageData;
};
