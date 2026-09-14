import type { CommunityPageSchema, CommunityPickCategory } from "../../db/schemas/CommunityPageSchema";
import { currentPlaceLocalization, communityLocationPhrase, localizedCountryName, localizedPlaceName } from "../../scripts/CommunityPlaceNames";

/** Pure presentation shared by browser and SSR; no lookups or writes. */
export function communityCopy(page: CommunityPageSchema, locale: string) {
  const country = localizedCountryName(page.geography.countryCode, locale, page.geography.countryName || page.displayName);
  const name = localizedPlaceName(
    currentPlaceLocalization(page), page.place_name_overrides, locale,
    page.scope === "country" ? country : page.geography.localityLocalName || page.displayName,
  );
  const phrase = communityLocationPhrase(name, page.scope, page.geography.countryCode, locale, page.place_phrase_overrides);
  const heading = $localize`:@@community.seo.heading:Parkour ${phrase}:LOCATION:`;
  const qualified = page.scope === "locality" ? `${heading}, ${country}` : heading;
  const title = $localize`:@@community.seo.title:${qualified}:HEADING: | PK Spot Community`;
  const description = $localize`:@@community.seo.description:Discover parkour Spots ${phrase}:LOCATION:. Explore the map, find places to train, and connect with the local community on PK Spot.`;
  const communityDirectoryHeading = $localize`:@@community.directory.communities:Communities ${phrase}:LOCATION:`;
  const spotDirectoryHeading = $localize`:@@community.directory.spots:Parkour Spots ${phrase}:LOCATION:`;
  return { country, name, heading, title, description, communityDirectoryHeading, spotDirectoryHeading };
}

export function communityPickTitle(category: CommunityPickCategory): string {
  switch (category) {
    case "standout": return $localize`:@@community.picks.standout:Standout Spots`;
    case "parkour": return $localize`:@@community.picks.parkour:Parkour parks`;
    case "dry": return $localize`:@@community.picks.dry:Dry training Spots`;
    case "night": return $localize`:@@community.picks.night:Spots for evening training`;
    case "summer": return $localize`:@@community.picks.summer:Spots for summer training`;
    case "fallback": return $localize`:@@community.picks.fallback:Explore Spots`;
  }
}
