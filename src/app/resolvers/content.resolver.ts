import { inject } from "@angular/core";
import { ResolveFn, ActivatedRouteSnapshot } from "@angular/router";
import { LOCALE_ID } from "@angular/core";
import { SpotsService } from "../services/firebase/firestore/spots.service";
import { SpotChallengesService } from "../services/firebase/firestore/spot-challenges.service";
import { SlugsService } from "../services/firebase/firestore/slugs.service";
import { ConsentService } from "../services/consent.service";
import { MetaTagService } from "../services/meta-tag.service";
import { Spot } from "../../db/models/Spot";
import { SpotChallenge } from "../../db/models/SpotChallenge";
import { SpotId } from "../../db/schemas/SpotSchema";

export type ContentType =
  | "spot"
  | "spotEditHistory"
  | "challenge"
  | "event"
  | "user"
  | "post"
  | "static"
  | "home"
  | "map";

export interface RouteContentData {
  contentType: ContentType;
  spot?: Spot;
  challenge?: SpotChallenge;
  event?: any; // TODO: Replace with proper Event type
  user?: any; // TODO: Replace with proper User type
  post?: any; // TODO: Replace with proper Post type
  staticPage?: {
    title: string;
    description: string;
    image?: string;
  };
}

export const contentResolver: ResolveFn<RouteContentData> = async (
  route: ActivatedRouteSnapshot
) => {
  const spotsService = inject(SpotsService);
  const challengesService = inject(SpotChallengesService);
  const slugsService = inject(SlugsService);
  const consentService = inject(ConsentService);
  const metaTagService = inject(MetaTagService);
  const locale = inject(LOCALE_ID);

  // Determine content type from route path
  const contentType = determineContentType(route);
  const result: RouteContentData = { contentType };

  // Handle different content types
  switch (contentType) {
    case "spot":
    case "challenge":
      return await resolveSpotContent(route, result, {
        spotsService,
        challengesService,
        slugsService,
        consentService,
        metaTagService,
        locale,
      });

    case "event":
      return await resolveEventContent(route, result, metaTagService);

    case "user":
      return await resolveUserContent(route, result, metaTagService);

    case "post":
      return await resolvePostContent(route, result, metaTagService);

    case "static":
      return resolveStaticContent(route, result, metaTagService);

    case "home":
      metaTagService.setHomeMetaTags();
      return result;

    case "map":
    default:
      metaTagService.setDefaultMapMetaTags();
      return result;
  }
};

function determineContentType(route: ActivatedRouteSnapshot): ContentType {
  // Get the full path by traversing route tree
  const pathSegments: string[] = [];
  let currentRoute: ActivatedRouteSnapshot | null = route;

  while (currentRoute) {
    if (currentRoute.routeConfig?.path) {
      pathSegments.unshift(currentRoute.routeConfig.path);
    }
    currentRoute = currentRoute.parent;
  }

  const fullPath = pathSegments.join("/");

  // Determine content type based on path patterns
  if (fullPath.includes("map") && getParamFromRouteTree(route, "challenge")) {
    return "challenge";
  } else if (fullPath.includes("map") && fullPath.includes("edits")) {
    return "spotEditHistory";
  } else if (fullPath.includes("map") && getParamFromRouteTree(route, "spot")) {
    return "spot";
  } else if (fullPath.includes("map")) {
    return "map";
  } else if (fullPath.includes("events") || fullPath.includes("event")) {
    return "event";
  } else if (fullPath.includes("profile") || fullPath.includes("u/")) {
    return "user";
  } else if (fullPath.includes("post") || fullPath.includes("p/")) {
    return "post";
  } else if (fullPath === "" || fullPath === "home") {
    return "home";
  } else if (
    ["about", "privacy-policy", "terms-of-service", "impressum"].some((p) =>
      fullPath.includes(p)
    )
  ) {
    return "static";
  }

  return "map"; // default
}

async function resolveSpotContent(
  route: ActivatedRouteSnapshot,
  result: RouteContentData,
  services: any
): Promise<RouteContentData> {
  const spotIdOrSlug = getParamFromRouteTree(route, "spot");
  const challengeId = getParamFromRouteTree(route, "challenge");

  if (!spotIdOrSlug) {
    services.metaTagService.setDefaultMapMetaTags();
    return result;
  }

  // Check for consent before making any Firestore requests
  if (!services.consentService.hasConsent()) {
    console.warn(
      "Content resolver: User consent required for Firestore access"
    );
    services.metaTagService.setDefaultMapMetaTags();
    return result;
  }

  try {
    // Get the spot
    const spotId = await services.slugsService
      .getSpotIdFromSpotSlugHttp(spotIdOrSlug)
      .catch(() => spotIdOrSlug as SpotId);

    const spot = await services.spotsService.getSpotByIdHttp(
      spotId,
      services.locale
    );
    result.spot = spot;

    // If we also have a challenge, get that too
    if (challengeId && result.contentType === "challenge") {
      try {
        const challenge = await services.challengesService.getSpotChallenge(
          spot,
          challengeId
        );
        result.challenge = challenge;

        // Set challenge meta tags
        services.metaTagService.setChallengeMetaTags(challenge);
      } catch (error) {
        console.warn("Could not load challenge, showing spot instead:", error);
        // Fall back to spot meta tags
        services.metaTagService.setSpotMetaTags(spot);
      }
    } else if (result.contentType === "spotEditHistory") {
      services.metaTagService.setSpotMetaTags(spot);
    } else {
      // Set spot meta tags
      services.metaTagService.setSpotMetaTags(spot);
    }

    return result;
  } catch (error) {
    console.error("Error resolving spot content:", error);
    services.metaTagService.setDefaultMapMetaTags();
    return result;
  }
}

async function resolveEventContent(
  route: ActivatedRouteSnapshot,
  result: RouteContentData,
  metaTagService: MetaTagService
): Promise<RouteContentData> {
  // TODO: Implement event loading
  // For now, just set default event meta tags
  const eventId = route.paramMap.get("eventId") || route.paramMap.get("slug");

  if (eventId === "swissjam25") {
    // Hardcoded for SwissJam event
    metaTagService.setStaticPageMetaTags(
      "SwissJam 2025",
      "Join us for the biggest parkour event in Switzerland! SwissJam 2025 brings together athletes from around the world.",
      "https://pkspot.app/assets/swissjam.jpg"
    );
  } else {
    metaTagService.setStaticPageMetaTags(
      "Events",
      "Discover upcoming parkour and freerunning events near you."
    );
  }

  return result;
}

async function resolveUserContent(
  route: ActivatedRouteSnapshot,
  result: RouteContentData,
  metaTagService: MetaTagService
): Promise<RouteContentData> {
  const userId = route.paramMap.get("userID");

  if (userId) {
    try {
      // TODO: Load user data from Firestore
      // const user = await userService.getUserById(userId);
      // result.user = user;

      // TODO: When social card generation is implemented, use:
      // const socialCardUrl = `https://storage.googleapis.com/pkspot-social-cards/social-cards/profiles/${userId}.png`;
      const socialCardUrl = "/assets/banner_1200x630.png"; // Fallback for now

      metaTagService.setStaticPageMetaTags(
        `${userId}'s Profile | PK Spot`,
        "Check out this user's profile and achievements on PK Spot.",
        socialCardUrl
      );
    } catch (error) {
      console.error("Error loading user profile:", error);
      metaTagService.setStaticPageMetaTags(
        "User Profile",
        "Check out this user's profile and achievements on PK Spot.",
        "/assets/banner_1200x630.png"
      );
    }
  } else {
    metaTagService.setStaticPageMetaTags(
      "User Profile",
      "Check out this user's profile and achievements on PK Spot.",
      "/assets/banner_1200x630.png"
    );
  }

  return result;
}

/**
 * Helper function to get a parameter from anywhere in the route tree
 */

async function resolvePostContent(
  route: ActivatedRouteSnapshot,
  result: RouteContentData,
  metaTagService: MetaTagService
): Promise<RouteContentData> {
  // TODO: Implement post loading
  // For now, just set default post meta tags
  const postId = route.paramMap.get("postId");

  metaTagService.setStaticPageMetaTags(
    "Post",
    "Check out this post on PK Spot."
  );

  return result;
}

function resolveStaticContent(
  route: ActivatedRouteSnapshot,
  result: RouteContentData,
  metaTagService: MetaTagService
): RouteContentData {
  // Get the route path to determine which static page
  const pathSegments: string[] = [];
  let currentRoute: ActivatedRouteSnapshot | null = route;

  while (currentRoute) {
    if (currentRoute.routeConfig?.path) {
      pathSegments.unshift(currentRoute.routeConfig.path);
    }
    currentRoute = currentRoute.parent;
  }

  const fullPath = pathSegments.join("/");

  // Set meta tags based on static page
  if (fullPath.includes("about")) {
    metaTagService.setStaticPageMetaTags(
      "About",
      "Learn more about PK Spot and our mission to connect the parkour and freerunning community."
    );
  } else if (fullPath.includes("privacy-policy")) {
    metaTagService.setStaticPageMetaTags(
      "Privacy Policy",
      "Read our privacy policy to understand how we protect and handle your data."
    );
  } else if (fullPath.includes("terms-of-service")) {
    metaTagService.setStaticPageMetaTags(
      "Terms of Service",
      "Read our terms of service to understand the rules and guidelines for using PK Spot."
    );
  } else if (fullPath.includes("impressum")) {
    metaTagService.setStaticPageMetaTags(
      "Impressum",
      "Legal information and contact details for PK Spot."
    );
  } else {
    metaTagService.setHomeMetaTags();
  }

  return result;
}

/**
 * Helper function to get a parameter from anywhere in the route tree
 */
function getParamFromRouteTree(
  route: ActivatedRouteSnapshot,
  paramName: string
): string | null {
  // Check current route
  if (route.paramMap.has(paramName)) {
    return route.paramMap.get(paramName);
  }

  // Check parent routes
  let parent = route.parent;
  while (parent) {
    if (parent.paramMap.has(paramName)) {
      return parent.paramMap.get(paramName);
    }
    parent = parent.parent;
  }

  // Check child routes
  function checkChildren(routeNode: ActivatedRouteSnapshot): string | null {
    if (routeNode.paramMap.has(paramName)) {
      return routeNode.paramMap.get(paramName);
    }

    for (const child of routeNode.children) {
      const result = checkChildren(child);
      if (result) return result;
    }

    return null;
  }

  return checkChildren(route);
}
