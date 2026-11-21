import {
  type EventCalendarFilters,
  eventCalendarFilterParams,
} from "./event-calendar-filters";

/** Same path as `EVENT_CALENDAR_FEED_PATH` in the server-side feed. */
const FEED_PATH = "/calendar/events.ics";

export interface EventCalendarSubscribeLinks {
  /** HTTPS feed URL for copying into any calendar app. */
  feedUrl: string;
  /** `webcal:` URL that Apple Calendar and most desktop apps subscribe to. */
  webcalUrl: string;
  googleUrl: string;
  outlookUrl: string;
}

export function eventCalendarFeedUrl(
  baseUrl: string,
  filters: EventCalendarFilters,
  language?: string,
): string {
  const url = new URL(FEED_PATH, baseUrl);
  for (const [key, value] of Object.entries(eventCalendarFilterParams(filters))) {
    url.searchParams.set(key, value);
  }
  if (language && language !== "en") url.searchParams.set("lang", language);
  // Keep commas readable in the copied URL; they are valid query characters.
  return url.toString().replace(/%2C/giu, ",");
}

export function eventCalendarSubscribeLinks(
  baseUrl: string,
  filters: EventCalendarFilters,
  calendarName: string,
  language?: string,
): EventCalendarSubscribeLinks {
  const feedUrl = eventCalendarFeedUrl(baseUrl, filters, language);
  const webcalUrl = feedUrl.replace(/^https?:/u, "webcal:");
  return {
    feedUrl,
    webcalUrl,
    // Google Calendar only subscribes to `webcal:` URLs through `cid`.
    googleUrl: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`,
    outlookUrl: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(calendarName)}`,
  };
}
