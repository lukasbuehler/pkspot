import {
  eventCalendarTypesenseFilters,
  type EventCalendarFilters,
  readEventCalendarFilters,
} from "./app/shared/event-calendar-filters";
import { eventCalendarFeedName } from "./app/shared/event-calendar-feed-name";
import { buildIcsCalendar, type IcsEvent } from "./app/shared/event-ics";

/**
 * Public iCalendar subscription feed for event discovery.
 *
 * `GET /calendar/events.ics?country=ch` returns the published events that the
 * Events page lists for the same filters. Calendar apps poll this URL, so it
 * reads Typesense directly with the public search-only key and never renders
 * Angular.
 */
export const EVENT_CALENDAR_FEED_PATH = "/calendar/events.ics";

const TYPESENSE_EVENTS_COLLECTION = "events_v1";
/** Keep recently finished events so subscribers do not see them vanish at once. */
const FEED_PAST_DAYS = 60;
const FEED_FUTURE_DAYS = 2 * 365;
const FEED_MAX_EVENTS = 250;
const FEED_TIMEOUT_MS = 8000;
const FEED_REFRESH_HOURS = 6;
const FEED_LOCALES = new Set(["en", "de", "fr", "it", "es", "nl"]);

export interface EventCalendarFeedConfig {
  typesense: { host: string; apiKey: string };
  fetch?: typeof fetch;
  now?: () => Date;
}

export function isEventCalendarFeedPath(pathname: string): boolean {
  return pathname === EVENT_CALENDAR_FEED_PATH;
}

interface TypesenseEventHit {
  document?: Record<string, unknown>;
}

export async function handleEventCalendarFeed(
  request: Request,
  config: EventCalendarFeedConfig,
): Promise<Response> {
  const url = new URL(request.url);
  const filters = readEventCalendarFilters((key) => url.searchParams.getAll(key));
  const language = url.searchParams.get("lang") ?? "";
  const locale = FEED_LOCALES.has(language) ? language : "en";
  const now = config.now?.() ?? new Date();
  const fetcher = config.fetch ?? fetch;

  if (!config.typesense.host || !config.typesense.apiKey) {
    return feedError(503, "Event search is not configured.");
  }

  let hits: TypesenseEventHit[];
  try {
    hits = await searchFeedEvents(fetcher, config.typesense, filters, now);
  } catch (error) {
    console.error("Event calendar feed search failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    // Calendar apps keep their last successful copy when a refresh fails.
    return feedError(502, "Events could not be loaded. Please try again later.");
  }

  const events = hits
    .map((hit) => icsEventFromDocument(hit.document, url.origin))
    .filter((event): event is IcsEvent => !!event);
  const body = buildIcsCalendar(events, {
    name: eventCalendarFeedName(filters, locale),
    description: "Parkour events from PK Spot",
    refreshHours: FEED_REFRESH_HOURS,
    now,
  });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="pkspot-events.ics"',
      "Cache-Control": "public, max-age=900",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function searchFeedEvents(
  fetcher: typeof fetch,
  typesense: EventCalendarFeedConfig["typesense"],
  filters: EventCalendarFilters,
  now: Date,
): Promise<TypesenseEventHit[]> {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const filterBy = [
    "published:=true",
    `end_seconds:>=${nowSeconds - FEED_PAST_DAYS * 86400}`,
    `start_seconds:<=${nowSeconds + FEED_FUTURE_DAYS * 86400}`,
    ...eventCalendarTypesenseFilters(filters),
  ]
    .filter(Boolean)
    .join(" && ");
  const params = new URLSearchParams({
    q: "*",
    filter_by: filterBy,
    sort_by: "start_seconds:asc",
    per_page: String(FEED_MAX_EVENTS),
    include_fields: [
      "id",
      "name",
      "slug",
      "description",
      "venue_string",
      "locality_string",
      "start_seconds",
      "end_seconds",
      "timing",
      "lifecycle_status",
    ].join(","),
  });
  const host = typesense.host.replace(/^https?:\/\//u, "").replace(/\/+$/u, "");
  const response = await fetcher(
    `https://${host}/collections/${TYPESENSE_EVENTS_COLLECTION}/documents/search?${params}`,
    {
      headers: { "X-TYPESENSE-API-KEY": typesense.apiKey },
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Typesense responded with ${response.status}`);
  }
  const result = (await response.json()) as { hits?: TypesenseEventHit[] };
  return result.hits ?? [];
}

export function icsEventFromDocument(
  document: Record<string, unknown> | undefined,
  origin: string,
): IcsEvent | null {
  if (!document) return null;
  const id = stringField(document["id"]);
  const name = stringField(document["name"]);
  const startSeconds = numberField(document["start_seconds"]);
  const endSeconds = numberField(document["end_seconds"]);
  if (!id || !name || startSeconds === undefined || endSeconds === undefined) {
    return null;
  }
  const timing =
    document["timing"] && typeof document["timing"] === "object"
      ? (document["timing"] as Record<string, unknown>)
      : undefined;
  const startDate = stringField(timing?.["start_date"]);
  const dateOnly =
    timing?.["mode"] === "date_only" && startDate
      ? { startDate, endDate: stringField(timing["end_date"]) ?? startDate }
      : undefined;
  const slug = stringField(document["slug"]);
  return {
    id,
    name,
    description: stringField(document["description"]),
    venue: stringField(document["venue_string"]),
    locality: stringField(document["locality_string"]),
    startSeconds,
    endSeconds,
    dateOnly,
    cancelled: document["lifecycle_status"] === "cancelled",
    url: `${origin}/events/${encodeURIComponent(slug ?? id)}`,
    transparent: true,
  };
}

function feedError(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
