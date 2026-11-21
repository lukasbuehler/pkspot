import type { Event as PkEvent } from "../../../db/models/Event";
import type { EventSearchPreview } from "../../services/search.service";

/**
 * Maps a loaded Event model back to the search preview shape that the shared
 * Event cards read, so lists holding models (the map panel) can show the same
 * card as the Events page.
 */
export function eventSearchPreviewFromEvent(
  event: PkEvent,
): EventSearchPreview {
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    description: event.description,
    venueString: event.venueString,
    localityString: event.localityString,
    bannerSrc: event.bannerSrc,
    bannerFit: event.bannerFit,
    bannerAccentColor: event.bannerAccentColor,
    logoSrc: event.logoSrc,
    logoFit: event.logoFit,
    logoBackgroundColor: event.logoBackgroundColor,
    sponsorName: event.sponsor?.name,
    sponsorLogoSrc: event.sponsor?.logo_src,
    sponsorLogoFit: event.sponsor?.logo_fit,
    sponsorLogoBackgroundColor: event.sponsor?.logo_background_color,
    isSponsored: event.isSponsored,
    hasOrganization: event.hasOrganization,
    hasVenueSpot: event.hasVenueSpot,
    venueSpotCount: event.venueSpotCount,
    startSeconds: Math.floor(event.start.getTime() / 1000),
    endSeconds: Math.floor(event.end.getTime() / 1000),
    activeUntilSeconds: event.activeUntil
      ? Math.floor(event.activeUntil.getTime() / 1000)
      : undefined,
    timing: event.timing,
    timeZone: event.timeZone,
    lifecycleStatus: event.lifecycleStatus,
    location: event.location
      ? [event.location.lat, event.location.lng]
      : undefined,
    externalProvider: event.externalSource?.provider,
    externalSourceUrl: event.externalSource?.url,
    url: event.url,
    eventLinks: event.eventLinks,
    livestreamLive: event.livestreamLive,
    ticketOptions: event.ticketOptions,
    spotIds: event.spotIds,
    communityKeys: event.communityKeys,
    seriesIds: event.seriesIds,
    eventCategories: event.eventCategories,
    listingTier: event.listingTier,
    countryCode: event.countryCode,
    regionKeys: event.regionKeys,
    communityBroadcast: event.communityBroadcast,
    kind: event.kind,
    rsvpCounts: event.rsvpCounts,
    seriesRoles: [],
    qualifiesToKeys: [],
    requiredQualifierKeys: [],
  };
}
