import { inject } from "@angular/core";
import { ResolveFn, ActivatedRouteSnapshot } from "@angular/router";
import { LOCALE_ID } from "@angular/core";
import { SpotsService } from "../services/firebase/firestore/spots.service";
import { SlugsService } from "../services/firebase/firestore/slugs.service";
import { ConsentService } from "../services/consent.service";
import { Spot } from "../../db/models/Spot";
import { SpotId } from "../../db/schemas/SpotSchema";

export const spotResolver: ResolveFn<Spot | null> = async (
  route: ActivatedRouteSnapshot
) => {
  const spotsService = inject(SpotsService);
  const slugsService = inject(SlugsService);
  const consentService = inject(ConsentService);
  const locale = inject(LOCALE_ID);

  const spotIdOrSlug = route.paramMap.get("spot");

  if (!spotIdOrSlug) {
    return null;
  }

  // Check for consent before making any Firestore requests
  if (!consentService.hasConsent()) {
    console.warn('Spot resolver: User consent required for Firestore access');
    return null;
  }

  try {
    // First try to get spot ID from slug
    const spotId = await slugsService
      .getSpotIdFromSpotSlugHttp(spotIdOrSlug)
      .catch(() => spotIdOrSlug as SpotId); // If it fails, assume it's already an ID

    // Then fetch the spot
    const spot = await spotsService.getSpotByIdHttp(spotId, locale);
    return spot;
  } catch (error) {
    console.error("Error resolving spot:", error);
    return null;
  }
};
