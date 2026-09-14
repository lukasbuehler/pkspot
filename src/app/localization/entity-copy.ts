import type { LocalSpot, Spot } from "../../db/models/Spot";
import type { Event } from "../../db/models/Event";
import { SpotAccess, SpotAccessNames, SpotTypes, SpotTypesNames } from "../../db/schemas/SpotTypeAndAccess";
import { getDisplayLocalityName } from "../../scripts/AddressHelpers";
import { singleLocality, countryForLocality } from "../../scripts/EntityPlaceNames";
import { communityLocationPhrase, localizedCountryName } from "../../scripts/CommunityPlaceNames";

export function geographicCopy(locality: string | undefined, countryCode: string | undefined, countryName: string | undefined, locale: string) {
  countryCode = countryForLocality(countryCode, locality);
  locality = singleLocality(locality, countryCode) || locality;
  const country = localizedCountryName(countryCode, locale, countryName ?? "");
  const name = locality?.trim() || country;
  const phrase = name ? communityLocationPhrase(name, locality?.trim() ? "locality" : "country", countryCode, locale) : "";
  return { locality: locality?.trim() || "", countryCode, country, phrase, label: [locality?.trim(), country].filter(Boolean).join(", ") };
}

/** Generated text describes only recorded facts; contributor prose stays separate. */
export function spotCopy(spot: Spot | LocalSpot, locale: string) {
  const address = spot.address();
  const place = geographicCopy(spot.placeNames()?.names[locale] || spot.placeNames()?.names[locale.split("-")[0]] || getDisplayLocalityName(address), address?.country?.code, address?.country?.name, locale);
  const name = spot.name();
  const heading = place.phrase
    ? $localize`:@@spot.copy.location:Parkour Spot ${place.phrase}:LOCATION:`
    : $localize`:@@spot.copy.no_location:Parkour Spot on PK Spot`;
  const title = $localize`:@@spot.copy.title:${name}:NAME:: ${heading}:HEADING: | PK Spot`;
  const details: string[] = [];
  if (spot.type() !== SpotTypes.Other) {
    const type = SpotTypesNames[spot.type()];
    details.push($localize`:@@spot.copy.type:Type: ${type}:TYPE:.`);
  }
  if (spot.access() !== SpotAccess.Other) {
    const access = SpotAccessNames[spot.access()];
    details.push($localize`:@@spot.copy.access:Access: ${access}:ACCESS:.`);
  }
  if (spot.rating && Number.isFinite(spot.rating)) {
    const rating = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(spot.rating);
    details.push($localize`:@@spot.copy.rating:Rated ${rating}:RATING: out of 5.`);
  }
  const explanation = $localize`:@@spot.copy.explanation:Explore photos, location details and training information on PK Spot.`;
  return { name, place, heading, title, description: [heading + ".", ...details, explanation].join(" ") };
}

export function eventPlaceCopy(event: Event, locale = event.locale || "en") {
  return geographicCopy(event.placeNames?.names[locale] || event.placeNames?.names[locale.split("-")[0]] || singleLocality(event.localityString, event.countryCode) || event.localityString, countryForLocality(event.countryCode, event.localityString), undefined, locale);
}

export function eventCopy(event: Event, locale: string, schedule = "") {
  const place = eventPlaceCopy(event, locale);
  const heading = place.phrase
    ? $localize`:@@event.copy.location:Parkour event ${place.phrase}:LOCATION:`
    : $localize`:@@event.copy.no_location:Parkour event on PK Spot`;
  const name = event.name;
  const title = $localize`:@@event.copy.title:${name}:NAME:: ${heading}:HEADING: | PK Spot`;
  const kind = eventKindLabel(event.kind);
  const kindSentence = $localize`:@@event.copy.type:Type: ${kind}:TYPE:.`;
  const status = event.lifecycleStatus === "cancelled"
    ? $localize`:@@event.copy.cancelled:This event has been cancelled.`
    : event.status() === "past"
      ? $localize`:@@event.copy.past:This event has ended.`
      : event.status() === "live"
        ? $localize`:@@event.copy.live:This event is happening now.`
        : $localize`:@@event.copy.upcoming:Find event details and planning information on PK Spot.`;
  const organizer = (event.organizer?.type === "organization" ? event.organizer.organization.name : undefined) || event.organizerName;
  const organizedBy = organizer ? $localize`:@@event.copy.organizer:Organized by ${organizer}:ORGANIZER:.` : "";
  return { place, heading, title, description: [heading + ".", kindSentence, schedule ? schedule + "." : "", status, organizedBy].filter(Boolean).join(" ") };
}

function eventKindLabel(kind: Event["kind"]): string {
  switch (kind) {
    case "session": return $localize`:@@event.copy.kind.session:Training session`;
    case "class": return $localize`:@@event.copy.kind.class:Class`;
    case "competition": return $localize`:@@event.copy.kind.competition:Competition`;
    case "workshop": return $localize`:@@event.copy.kind.workshop:Workshop`;
    case "festival": return $localize`:@@event.copy.kind.festival:Festival`;
    default: return $localize`:@@event.copy.label:Event`;
  }
}
