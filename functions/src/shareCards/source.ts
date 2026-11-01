import { createHash } from "node:crypto";
import { isEventPubliclyDiscoverable } from "../../../src/db/schemas/EventDiscoverySchema";
import { isDateKey } from "../../../src/db/utils/event-timing";
import { EventSchema } from "../../../src/db/schemas/EventSchema";
import { buildPublicUserProfile } from "../userProfileProjection";
import { localizedCountryName } from "../../../src/scripts/CommunityPlaceNames";
import { singleLocality } from "../../../src/scripts/EntityPlaceNames";
import { MAX_COMMUNITY_PHOTOS } from "./collage";
import { ShareCardInput, SHARE_CARD_VERSION } from "./render";

export type EntityKind = "spot" | "event" | "community" | "profile";
export const collections: Record<EntityKind, string> = {
  spot: "spots", event: "events", community: "community_pages", profile: "users",
};
export interface CardSource { input: ShareCardInput; media: string[]; relatedSpotIds?: string[]; eligibleMedia?: string[] }
const MAX_COMMUNITY_CANDIDATES = 32;

/** Generated rankings supply candidates, never publication permission. Resolve
 * the current Spot documents before using their photos in a community card. */
export function communityCardSpotIds(data: Record<string, unknown>): string[] {
  const sections = Array.isArray(data.communityPicks) ? data.communityPicks.map(record) : [];
  const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
  const candidates = [
    ...sections.filter((section) => section.category === "standout").flatMap((section) => list(section.spots)),
    ...list(data.topRatedSpots),
    ...sections.flatMap((section) => list(section.spots)),
    ...list(data.spots),
  ];
  return [...new Set(candidates.map((spot) => text(record(spot).id))
    .filter((id) => /^[\w:.-]{1,200}$/.test(id) && id !== "." && id !== ".."))].slice(0, MAX_COMMUNITY_CANDIDATES);
}

export async function resolveCardSource(
  kind: EntityKind,
  data: Record<string, unknown> | undefined,
  readSpots: (ids: string[]) => Promise<(Record<string, unknown> | undefined)[]>,
  bucket: string,
  locale = "en",
): Promise<CardSource | null> {
  const source = projectCard(kind, data, locale);
  if (!source || kind !== "community") return source;
  const paths = new Set<string>();
  // Availability checks need all eligible candidates, even after the collage is
  // full. A later photo selection must not revoke a still-approved old photo.
  const spots = source.relatedSpotIds!.length ? await readSpots(source.relatedSpotIds!) : [];
  source.eligibleMedia = [];
  for (const spot of spots) {
    if (spot?.isReported === true) continue;
    const candidate = projectCard("spot", spot, locale);
    if (!candidate) continue;
    source.eligibleMedia.push(...candidate.eligibleMedia!);
    if (source.media.length === MAX_COMMUNITY_PHOTOS) continue;
    const photo = candidate.media.find((src) => {
      const path = storageMediaPath(src, bucket);
      return path && !paths.has(path);
    });
    if (photo) { paths.add(storageMediaPath(photo, bucket)!); source.media.push(photo); }
  }
  source.eligibleMedia = [...new Set(source.eligibleMedia)];
  return source;
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown): string => typeof v === "string" ? v : "";
const localized = (v: unknown): string => {
  if (typeof v === "string") return v;
  const map = record(v), value = map.en ?? Object.values(map)[0];
  return text(value) || text(record(value).text);
};

/** Public presentation fields only. Never include profile history or attendance. */
const eventDate = (data: Record<string, unknown>, locale: string): string => {
  const timing = record(data.timing);
  // Civil dates are authoritative. Compatibility timestamps can represent
  // invented boundaries for date-only or open-ended schedules.
  const civil = isDateKey(timing.start_date);
  const startSeconds = record(data.start).seconds ?? data.start_seconds;
  const endSeconds = record(data.end).seconds ?? data.end_seconds;
  const start = civil ? new Date(`${timing.start_date}T00:00:00Z`)
    : typeof startSeconds === "number" && Number.isFinite(startSeconds) ? new Date(startSeconds * 1000) : null;
  if (!start || !Number.isFinite(start.getTime())) return "";
  const end = civil ? new Date(`${isDateKey(timing.end_date) ? timing.end_date : timing.start_date}T00:00:00Z`)
    : typeof endSeconds === "number" && Number.isFinite(endSeconds) ? new Date(endSeconds * 1000) : start;
  try {
    const formatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric",
      timeZone: civil ? "UTC" : text(data.time_zone) || "UTC" });
    return Number.isFinite(end.getTime()) && end > start && formatter.format(start) !== formatter.format(end)
      ? formatter.formatRange(start, end) : formatter.format(start);
  } catch { return ""; }
};
/** Resolve only materialized place names; rendering never calls a geocoder.
 * An explicit place key mismatch means the stored translation is stale. */
const eventLocality = (data: Record<string, unknown>, locale: string): string => {
  const place = record(data.place_names);
  const names = data.place_key && data.place_key !== place.key ? {} : record(place.locality);
  return text(names[locale]) || text(names[locale.split("-")[0]]) ||
    singleLocality(text(data.locality_string), text(data.country_code)) || text(data.locality_string);
};
export function projectCard(kind: EntityKind, data: Record<string, unknown> | undefined, locale = "en"): CardSource | null {
  if (!data) return null;
  if (kind === "event" && (!isEventPubliclyDiscoverable(data as Partial<EventSchema>) || data.viewer_policy !== undefined)) return null;
  if (kind === "community" && (data.published !== true || data.redirect_to_community_key)) return null;
  if (kind === "profile" && buildPublicUserProfile(data)?.public_search !== true) return null;
  if (data.deleted === true || data.visibility === "private") return null;
  const title = kind === "community" ? text(data.displayName) : kind === "profile" ? text(data.display_name) : localized(data.name);
  if (!title) return null;
  const address = record(data.address);
  const geography = record(data.geography);
  const locationLabel = kind === "event" ? eventLocality(data, locale)
    : kind === "community" && data.scope === "locality"
      ? localizedCountryName(text(geography.countryCode), locale, text(geography.countryName) || text(geography.countryLocalName))
      : "";
  const subtitle = kind === "spot" ? text(data.locality_string) || [text(address.locality), text(record(address.country).name)].filter(Boolean).join(", ")
    : kind === "event" ? [eventDate(data, locale), text(data.venue_string)].filter(Boolean).join(" · ")
    : kind === "community" ? `${Number(record(data.counts).totalSpots) || 0} Spots` : "Part of the parkour community";
  const eligibleMedia = kind === "spot" && Array.isArray(data.media) ? data.media.map(record)
    .filter(m => m.type === "image" && m.isReported !== true && m.origin !== "streetview" && !m.attribution && !m.attribution_text)
    .map(m => text(m.src)).filter(Boolean)
    : kind === "event" && text(data.banner_src) ? [text(data.banner_src)] : [];
  const media = eligibleMedia.slice(0, kind === "community" ? MAX_COMMUNITY_PHOTOS : 3);
  const rating = kind === "spot" && typeof data.rating === "number" && Number.isFinite(data.rating) && data.rating >= 0 && data.rating <= 5 ? data.rating : undefined;
  return { input: { kind, audience: "public", title: title.slice(0, 240), subtitle: subtitle.slice(0, 240),
    ...(locationLabel ? { locationLabel: locationLabel.slice(0, 240) } : {}),
    detail: kind === "event" ? "Discover the event on PK Spot" : kind === "spot" ? "Explore on PK Spot" : "Find your community on PK Spot",
    ...(rating === undefined ? {} : { rating }) }, media,
    ...(kind === "community" ? { relatedSpotIds: communityCardSpotIds(data) } : {}), eligibleMedia };
}
/** Desired render identity for explicit Share refreshes, never cache availability. */
export function sourceFingerprint(source: CardSource): string {
  // Eligible-but-unused media participates in safety checks, not render identity.
  const {eligibleMedia: _eligibleMedia, ...renderSource} = source;
  return createHash("sha256").update(SHARE_CARD_VERSION).update(JSON.stringify(renderSource)).digest("hex").slice(0, 24);
}
/** Only published media in our bucket. Never fetch user-controlled remote URLs. */
export function storageMediaPath(value: string, bucket: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com") return null;
    const prefix = `/v0/b/${bucket}/o/`;
    if (!url.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    return /^(spot_pictures|event_media)\/[\w./-]+$/.test(path) && !path.includes("..") ? path : null;
  } catch { return /^(spot_pictures|event_media)\/[\w.-]+$/.test(value) ? value : null; }
}

/** Legacy uploads may have no extension and retain only resized derivatives. */
export function shareCardMediaCandidates(path: string): string[] {
  const resized = path.replace(/(?:_\d+x\d+)?(\.[^./]+)?$/, "_800x800$1");
  return [...new Set([resized, path])];
}
