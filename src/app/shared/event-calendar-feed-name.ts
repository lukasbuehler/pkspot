import { EVENT_REGION_LABELS } from "../../db/schemas/EventGeography";
import {
  type EventCalendarFilters,
  eventCountryName,
} from "./event-calendar-filters";

/**
 * Calendar name shown in calendar apps, for example
 * "PK Spot events · Switzerland". Country names follow `locale`; the rest
 * stays English because the Worker that serves the feed has no translations.
 */
export function eventCalendarFeedName(
  filters: EventCalendarFilters,
  locale: string,
): string {
  const places =
    filters.countries.length > 0
      ? filters.countries.map((code) => eventCountryName(code, locale))
      : filters.regions.map((region) => EVENT_REGION_LABELS[region]);
  return places.length > 0
    ? `PK Spot events · ${places.join(", ")}`
    : "PK Spot events";
}
