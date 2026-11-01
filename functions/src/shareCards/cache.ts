import {createHash} from "node:crypto";
import {localizedCountryName} from "../../../src/scripts/CommunityPlaceNames";
import {singleLocality} from "../../../src/scripts/EntityPlaceNames";
import type {CardSource, EntityKind} from "./source";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === "string" ? value : "";
const name = (value: unknown): string => {
  if (typeof value === "string") return value;
  const names = record(value), best = names.en ?? Object.values(names)[0];
  return text(best) || text(record(best).text);
};
const seconds = (data: Record<string, unknown>) => record(data.start).seconds ?? data.start_seconds ?? null;
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const fields = record(value);
    return `{${Object.keys(fields).sort().filter((key) => fields[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson(fields[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
};

/** Frozen availability contract. Keep renderer versions, wording, formatting,
 * crops and photo selection out of this hash. New presentation fields must not
 * silently redefine version 1 and invalidate already-generated cards. */
export function contentFingerprint(kind: EntityKind, data: Record<string, unknown>, version: 1 | 2 = 1): string {
  const address = record(data.address), country = record(address.country), geography = record(data.geography);
  const fields = kind === "spot"
    ? {name: name(data.name), locality: text(data.locality_string), addressLocality: text(address.locality), country: text(country.name), rating: data.rating ?? null}
    : kind === "event"
      ? {name: name(data.name), start: seconds(data), timeZone: text(data.time_zone), venue: text(data.venue_string),
        locality: text(data.locality_string), country: text(data.country_code), placeKey: text(data.place_key), placeNames: data.place_names ?? null}
      : kind === "community"
        ? {name: text(data.displayName), scope: text(data.scope), totalSpots: Number(record(data.counts).totalSpots) || 0,
          countryCode: text(geography.countryCode), countryName: text(geography.countryName), countryLocalName: text(geography.countryLocalName)}
        : {name: text(data.display_name)};
  return createHash("sha256").update(stableJson({kind, ...fields, ...(version === 2 && kind === "event"
    ? {end: record(data.end).seconds ?? data.end_seconds ?? null, timing: data.timing ?? null} : {})})).digest("hex").slice(0, 24);
}

/** Read compatibility for the deployed pre-snapshot cache and the two later
 * renderer formats. These projections intentionally stay frozen when the live
 * renderer changes. GET uses them without rewriting any legacy cache records. */
export function legacyRevisions(kind: EntityKind, data: Record<string, unknown>, source: CardSource): string[] {
  const address = record(data.address), geography = record(data.geography);
  let date = "";
  const start = seconds(data);
  if (typeof start === "number" && Number.isFinite(start)) {
    try { date = new Intl.DateTimeFormat("en", {day: "numeric", month: "short", year: "numeric", timeZone: text(data.time_zone) || "UTC"}).format(new Date(start * 1000)); }
    catch { /* Same empty-date fallback as the legacy renderer. */ }
  }
  const title = kind === "community" ? text(data.displayName) : kind === "profile" ? text(data.display_name) : name(data.name);
  const subtitle = kind === "spot" ? text(data.locality_string) || [text(address.locality), text(record(address.country).name)].filter(Boolean).join(", ")
    : kind === "event" ? [date, text(data.venue_string) || text(data.locality_string)].filter(Boolean).join(" · ")
    : kind === "community" ? `${Number(record(data.counts).totalSpots) || 0} Spots` : "Part of the parkour community";
  const media = kind === "spot" && Array.isArray(data.media) ? data.media.map(record)
    .filter((item) => item.type === "image" && item.isReported !== true && item.origin !== "streetview" && !item.attribution && !item.attribution_text)
    .map((item) => text(item.src)).filter(Boolean).slice(0, 3)
    : kind === "event" && text(data.banner_src) ? [text(data.banner_src)] : [];
  const rating = kind === "spot" && typeof data.rating === "number" && Number.isFinite(data.rating) && data.rating >= 0 && data.rating <= 5 ? data.rating : undefined;
  const input = {kind, audience: "public", title: title.slice(0, 240), subtitle: subtitle.slice(0, 240),
    detail: kind === "event" ? "Discover the event on PK Spot" : kind === "spot" ? "Explore on PK Spot" : "Find your community on PK Spot",
    ...(rating === undefined ? {} : {rating})};
  const legacy = {input, media};
  const collage = {...legacy, media: kind === "community" ? source.media : media,
    ...(kind === "community" ? {relatedSpotIds: source.relatedSpotIds} : {})};
  const place = record(data.place_names);
  const names = data.place_key && data.place_key !== place.key ? {} : record(place.locality);
  const location = kind === "event" ? text(names.en) || singleLocality(text(data.locality_string), text(data.country_code)) || text(data.locality_string)
    : kind === "community" && data.scope === "locality" ? localizedCountryName(text(geography.countryCode), "en", text(geography.countryName) || text(geography.countryLocalName)) : "";
  const withPlace = {...collage, input: {kind, audience: "public", title: input.title,
    subtitle: kind === "event" ? [date, text(data.venue_string)].filter(Boolean).join(" · ").slice(0, 240) : input.subtitle,
    ...(location ? {locationLabel: location.slice(0, 240)} : {}), detail: input.detail,
    ...(rating === undefined ? {} : {rating})}};
  return [["prototype-10", legacy], ["prototype-11", collage], ["prototype-12", withPlace]]
    .map(([version, projection]) => createHash("sha256").update(version as string).update(JSON.stringify(projection)).digest("hex").slice(0, 24));
}

export function cachedContentMatches(card: Record<string, unknown>, current: {contentFingerprint: string; contentFingerprintV1?: string; legacyRevisions: string[]}): boolean {
  return card.content_version === 2
    ? card.content_fingerprint === current.contentFingerprint
    : card.content_version === 1
    ? card.content_fingerprint === (current.contentFingerprintV1 ?? current.contentFingerprint)
    : card.content_version === undefined && current.legacyRevisions.includes(text(card.revision));
}

export interface CachedMediaReference {path: string; generation: string}

/** Validate the photos actually present in the saved image, independently of
 * which eligible photos a newer renderer would choose for its next collage. */
export function cachedMediaReferences(media: unknown, eligiblePaths: ReadonlySet<string>): CachedMediaReference[] | null {
  if (!Array.isArray(media) || media.length > 16) return null;
  const result: CachedMediaReference[] = [];
  for (const item of media) {
    if (item === null) continue; // No photo was rendered for this missing asset.
    const value = record(item);
    if (typeof value.path !== "string" || typeof value.generation !== "string" || !value.generation || !eligiblePaths.has(value.path)) return null;
    result.push({path: value.path, generation: value.generation});
  }
  return result;
}
