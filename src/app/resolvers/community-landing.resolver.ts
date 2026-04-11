import { inject } from "@angular/core";
import { ResolveFn } from "@angular/router";
import type { Response } from "express";
import { RESPONSE } from "../../express.token";
import {
  buildCommunityLandingPath,
  normalizeCommunitySlug,
} from "../../scripts/CommunityHelpers";
import { humanizeSlugSegment } from "../../scripts/SpotLandingHelpers";
import { MetaTagService } from "../services/meta-tag.service";
import { StructuredDataService } from "../services/structured-data.service";
import {
  CommunityLandingPageData,
  LandingPagesService,
} from "../services/firebase/firestore/landing-pages.service";

const COMMUNITY_STRUCTURED_DATA_IDS = [
  "community-page",
  "community-breadcrumbs",
  "community-top-rated",
  "community-dry-spots",
] as const;

export const communityLandingResolver: ResolveFn<
  CommunityLandingPageData
> = async (route) => {
  const landingPagesService = inject(LandingPagesService);
  const metaTagService = inject(MetaTagService);
  const structuredDataService = inject(StructuredDataService);
  const response = inject(RESPONSE, { optional: true }) as Response | null;

  const requestedSlug = normalizeCommunitySlug(route.paramMap.get("slug"));
  const pageData = await landingPagesService.getCommunityPage(requestedSlug);

  for (const id of COMMUNITY_STRUCTURED_DATA_IDS) {
    structuredDataService.removeStructuredData(id);
  }

  if (!pageData) {
    const canonicalPath = buildCommunityLandingPath(requestedSlug);
    const pageTitle = `${humanizeSlugSegment(requestedSlug)} Community`;

    response?.status(404);
    metaTagService.setStaticPageMetaTags(
      `${pageTitle} Not Found`,
      "This PK Spot community landing page could not be found.",
      undefined,
      canonicalPath
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
      imageUrl: "/assets/banner_1200x630.png",
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
      topRatedSpots: [],
      drySpots: [],
      links: {},
      resources: [],
      organisations: [],
      athletes: [],
      events: [],
      notFound: true,
    };
  }

  response?.status(200);

  metaTagService.setCommunityLandingMetaTags(
    pageData.title,
    pageData.description,
    pageData.imageUrl,
    pageData.canonicalPath
  );

  structuredDataService.addStructuredData(
    "community-page",
    structuredDataService.generateCommunityLandingPageData(pageData)
  );
  structuredDataService.addStructuredData(
    "community-breadcrumbs",
    structuredDataService.generateBreadcrumbList(
      structuredDataService.buildCommunityBreadcrumbs(pageData)
    )
  );

  if (pageData.topRatedSpots.length > 0) {
    structuredDataService.addStructuredData(
      "community-top-rated",
      structuredDataService.generateSpotItemList(
        pageData.topRatedSpots,
        "Top Rated Parkour Spots"
      )
    );
  }

  if (pageData.drySpots.length > 0) {
    structuredDataService.addStructuredData(
      "community-dry-spots",
      structuredDataService.generateSpotItemList(
        pageData.drySpots,
        "Dry Parkour Spots"
      )
    );
  }

  return pageData;
};
