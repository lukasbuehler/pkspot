import { createHash } from "node:crypto";
import { isEventPubliclyDiscoverable } from "../../../src/db/schemas/EventDiscoverySchema";
import { EventSchema } from "../../../src/db/schemas/EventSchema";
import { buildPublicUserProfile } from "../userProfileProjection";
import { MAX_COMMUNITY_PHOTOS } from "./collage";
import { ShareCardInput, SHARE_CARD_VERSION } from "./render";

export type EntityKind = "spot" | "event" | "community" | "profile";
export const collections: Record<EntityKind, string> = {
  spot: "spots", event: "events", community: "community_pages", profile: "users",
};
export interface CardSource { input: ShareCardInput; media: string[]; relatedSpotIds?: string[] }
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
): Promise<CardSource | null> {
  const source = projectCard(kind, data);
  if (!source || kind !== "community") return source;
  const paths = new Set<string>();
  for (let offset = 0; offset < source.relatedSpotIds!.length && source.media.length < MAX_COMMUNITY_PHOTOS; offset += MAX_COMMUNITY_PHOTOS) {
    const spots = await readSpots(source.relatedSpotIds!.slice(offset, offset + MAX_COMMUNITY_PHOTOS));
    for (const spot of spots) {
      if (spot?.isReported === true) continue;
      const photo = projectCard("spot", spot)?.media.find((src) => {
        const path = storageMediaPath(src, bucket);
        return path && !paths.has(path);
      });
      if (photo) { paths.add(storageMediaPath(photo, bucket)!); source.media.push(photo); }
      if (source.media.length === MAX_COMMUNITY_PHOTOS) break;
    }
  }
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
const eventDate = (data: Record<string, unknown>): string => {
  const seconds = record(data.start).seconds ?? data.start_seconds;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "";
  try {
    return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: text(data.time_zone) || "UTC" }).format(new Date(seconds * 1000));
  } catch { return ""; }
};
export function projectCard(kind: EntityKind, data: Record<string, unknown> | undefined): CardSource | null {
  if (!data) return null;
  if (kind === "event" && (!isEventPubliclyDiscoverable(data as Partial<EventSchema>) || data.viewer_policy !== undefined)) return null;
  if (kind === "community" && (data.published !== true || data.redirect_to_community_key)) return null;
  if (kind === "profile" && buildPublicUserProfile(data)?.public_search !== true) return null;
  if (data.deleted === true || data.visibility === "private") return null;
  const title = kind === "community" ? text(data.displayName) : kind === "profile" ? text(data.display_name) : localized(data.name);
  if (!title) return null;
  const address = record(data.address);
  const subtitle = kind === "spot" ? text(data.locality_string) || [text(address.locality), text(record(address.country).name)].filter(Boolean).join(", ")
    : kind === "event" ? [eventDate(data), text(data.venue_string) || text(data.locality_string)].filter(Boolean).join(" · ")
    : kind === "community" ? `${Number(record(data.counts).totalSpots) || 0} Spots` : "Part of the parkour community";
  const media = kind === "spot" && Array.isArray(data.media) ? data.media.map(record)
    .filter(m => m.type === "image" && m.isReported !== true && m.origin !== "streetview" && !m.attribution && !m.attribution_text)
    .map(m => text(m.src)).filter(Boolean).slice(0, 3)
    : kind === "event" && text(data.banner_src) ? [text(data.banner_src)] : [];
  const rating = kind === "spot" && typeof data.rating === "number" && Number.isFinite(data.rating) && data.rating >= 0 && data.rating <= 5 ? data.rating : undefined;
  return { input: { kind, audience: "public", title: title.slice(0, 240), subtitle: subtitle.slice(0, 240),
    detail: kind === "event" ? "Discover the event on PK Spot" : kind === "spot" ? "Explore on PK Spot" : "Find your community on PK Spot",
    ...(rating === undefined ? {} : { rating }) }, media,
    ...(kind === "community" ? { relatedSpotIds: communityCardSpotIds(data) } : {}) };
}
export function sourceFingerprint(source: CardSource): string {
  return createHash("sha256").update(SHARE_CARD_VERSION).update(JSON.stringify(source)).digest("hex").slice(0, 24);
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
