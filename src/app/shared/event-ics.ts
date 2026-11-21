/**
 * iCalendar (RFC 5545) serialization for PK Spot events.
 *
 * Used by the single-event "Add to calendar" download and by the subscribable
 * `/calendar/events.ics` feed. It has no Angular or Firebase imports so the
 * Cloudflare Worker can use it directly.
 */

export interface IcsEvent {
  /** Stable event document id. Calendar apps match updates by the derived UID. */
  id: string;
  name: string;
  description?: string;
  venue?: string;
  locality?: string;
  startSeconds: number;
  endSeconds: number;
  /** Date-only events become all-day entries without invented times. */
  dateOnly?: { startDate: string; endDate: string };
  cancelled?: boolean;
  /** Public event page. */
  url?: string;
  /**
   * Marks the entry as free time. Subscribed discovery feeds use this so that
   * listed events do not block the subscriber's availability.
   */
  transparent?: boolean;
}

export interface IcsCalendarOptions {
  name?: string;
  description?: string;
  /** Suggested refresh interval for subscribed calendars, in hours. */
  refreshHours?: number;
  /** DTSTAMP for every entry. Defaults to now. */
  now?: Date;
}

const MAX_DESCRIPTION_LENGTH = 1500;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/\r\n|\r|\n/gu, "\\n")
    .replace(/,/gu, "\\,")
    .replace(/;/gu, "\\;");
}

export function icsUtcTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
}

function icsDate(dateKey: string): string | null {
  return DATE_KEY_PATTERN.test(dateKey) ? dateKey.replace(/-/gu, "") : null;
}

/** All-day DTEND is exclusive, so the entry ends the day after `endDate`. */
function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/**
 * Folds a content line at 75 octets, as RFC 5545 section 3.1 requires.
 * Continuation lines start with a space. Code points are never split, so
 * multi-byte characters such as emoji stay intact.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // The first line holds 75 octets; continuation lines hold 74 after the space.
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function truncate(value: string, maxLength: number): string {
  const characters = [...value.trim()];
  return characters.length <= maxLength
    ? characters.join("")
    : `${characters.slice(0, maxLength - 1).join("").trimEnd()}…`;
}

export function buildIcsEventLines(event: IcsEvent, now: Date): string[] {
  const location = [event.venue, event.locality]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(", ");
  const description = [
    event.description ? truncate(event.description, MAX_DESCRIPTION_LENGTH) : "",
    event.url ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const lines = [
    "BEGIN:VEVENT",
    `UID:event-${event.id}@pkspot.app`,
    `DTSTAMP:${icsUtcTimestamp(now)}`,
  ];
  const startDate = event.dateOnly ? icsDate(event.dateOnly.startDate) : null;
  const endDate = event.dateOnly ? icsDate(nextDateKey(event.dateOnly.endDate)) : null;
  if (startDate && endDate) {
    lines.push(`DTSTART;VALUE=DATE:${startDate}`, `DTEND;VALUE=DATE:${endDate}`);
  } else {
    const start = new Date(event.startSeconds * 1000);
    // Calendar apps reject an end before the start; keep at least one hour.
    const end = new Date(
      Math.max(event.endSeconds, event.startSeconds + 3600) * 1000,
    );
    lines.push(`DTSTART:${icsUtcTimestamp(start)}`, `DTEND:${icsUtcTimestamp(end)}`);
  }
  lines.push(`SUMMARY:${escapeIcsText(event.name)}`);
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push(
    `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    `TRANSP:${event.transparent ? "TRANSPARENT" : "OPAQUE"}`,
    "END:VEVENT",
  );
  return lines;
}

export function buildIcsCalendar(
  events: readonly IcsEvent[],
  options: IcsCalendarOptions = {},
): string {
  const now = options.now ?? new Date();
  const refresh = options.refreshHours
    ? [
        `REFRESH-INTERVAL;VALUE=DURATION:PT${options.refreshHours}H`,
        `X-PUBLISHED-TTL:PT${options.refreshHours}H`,
      ]
    : [];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PK Spot//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(options.name ? [`X-WR-CALNAME:${escapeIcsText(options.name)}`, `NAME:${escapeIcsText(options.name)}`] : []),
    ...(options.description ? [`X-WR-CALDESC:${escapeIcsText(options.description)}`] : []),
    ...refresh,
    ...events.flatMap((event) => buildIcsEventLines(event, now)),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
