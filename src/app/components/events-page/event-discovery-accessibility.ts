import type { EventDiscoveryItem } from "../../services/search.service";

export function eventDiscoveryAccessibleLabel(
  event: EventDiscoveryItem,
  localDate: string,
): string {
  const location = [event.venueString, event.localityString]
    .filter(Boolean)
    .join(", ");
  const going = $localize`:@@events.rsvp_going:${event.rsvpCounts.going}:count: going`;
  const interested = $localize`:@@events.rsvp_interested:${event.rsvpCounts.interested}:count: interested`;
  return $localize`:@@events.discovery_card_aria:${event.name}:eventName:, ${localDate}:localDate:, ${location}:location:, ${going}:goingSummary:, ${interested}:interestedSummary:`;
}
