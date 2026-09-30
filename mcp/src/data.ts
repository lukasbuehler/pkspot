import { ServiceError, type Environment } from "./runtime";

export type Document = Record<string, unknown>;
export type Kind = "spot" | "event" | "community";
export const record = (value: unknown): Document =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Document : {};
export const text = (value: unknown, max = 600): string | undefined =>
  typeof value === "string" ? value.slice(0, max) : undefined;
export const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
export const localized = (value: unknown, locale: string): string | undefined => {
  if (typeof value === "string") return text(value);
  const map = record(value);
  const item = map[locale] ?? map[locale.split("-")[0]!] ?? map.en ?? Object.values(map)[0];
  return text(typeof item === "string" ? item : record(item).text);
};
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2000) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

// REST reads are anonymous and governed by Firestore rules. No Admin SDK or
// service-account bypass. Fail closed if App Check or rules deny the read.
function decode(value: unknown): unknown {
  const field = record(value);
  if ("stringValue" in field) return field.stringValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return field.doubleValue;
  if ("timestampValue" in field) return field.timestampValue;
  if ("geoPointValue" in field) return field.geoPointValue;
  if ("mapValue" in field) return decodeFields(record(field.mapValue).fields);
  if ("arrayValue" in field) {
    const values = record(field.arrayValue).values;
    return Array.isArray(values) ? values.map(decode) : [];
  }
  return null;
}
function decodeFields(value: unknown): Document {
  return Object.fromEntries(Object.entries(record(value)).map(([key, field]) => [key, decode(field)]));
}

export interface DataSource {
  read(kind: Kind, id: string): Promise<Document | null>;
  search(kind: Kind, parameters: Record<string, string>): Promise<string[]>;
}
export class PublicData implements DataSource {
  constructor(private readonly env: Environment, private readonly fetcher: typeof fetch = fetch) {}

  async read(kind: Kind, id: string): Promise<Document | null> {
    const collection = { spot: "spots", event: "events", community: "community_pages" }[kind];
    const url = `https://firestore.googleapis.com/v1/projects/${this.env.FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
    const response = await this.fetcher(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
    if (response.status === 404 || response.status === 403) return null;
    if (!response.ok) throw new ServiceError("unavailable");
    return decodeFields(record(await response.json()).fields);
  }

  async search(kind: Kind, parameters: Record<string, string>): Promise<string[]> {
    const collection = { spot: "spots_v2", event: "events_v1", community: "communities_v1" }[kind];
    const url = new URL(`/collections/${collection}/documents/search`, this.env.TYPESENSE_ORIGIN);
    // Return candidate IDs only. Current documents decide visibility and content.
    url.search = new URLSearchParams({ ...parameters, include_fields: "id", highlight_fields: "none",
      per_page: parameters.per_page ?? "10", page: "1" }).toString();
    const response = await this.fetcher(url, { headers: { "X-TYPESENSE-API-KEY": this.env.TYPESENSE_SEARCH_KEY },
      signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!response.ok) throw new ServiceError("unavailable");
    const hits = record(await response.json()).hits;
    if (!Array.isArray(hits)) throw new ServiceError("unavailable");
    return hits.slice(0, 10).map((hit) => record(record(hit).document).id)
      .filter((id): id is string => typeof id === "string" && /^[\w:.-]{1,160}$/.test(id));
  }
}

export function isPublic(kind: Kind, doc: Document): boolean {
  if (kind === "community") return doc.published === true;
  if (kind === "spot") return doc.deleted !== true;
  const published = doc.publication_state === undefined ? doc.published === true : doc.publication_state === "published";
  return published && (doc.visibility ?? "public") === "public" &&
    (record(doc.discoverability).audience ?? "global") === "global" && !doc.viewer_policy;
}

function communityPath(doc: Document, id: string): string {
  const path = text(doc.canonicalPath, 500);
  return path?.startsWith("/") && !path.startsWith("//") && !path.includes("\\") && !path.includes("?") && !path.includes("#")
    ? path : `/map/communities/${encodeURIComponent(text(doc.preferredSlug, 160) || id)}`;
}

export function project(kind: Kind, id: string, doc: Document, locale: string, detail: boolean): Document {
  const path = kind === "spot" ? `/map/${encodeURIComponent(id)}` : kind === "event"
    ? `/events/${encodeURIComponent(text(doc.slug, 160) || id)}` : communityPath(doc, id);
  const common = { id, name: localized(doc.name ?? doc.title ?? doc.displayName, locale),
    url: `https://pkspot.app${path}`, description: localized(doc.description, locale) };
  if (kind === "spot") {
    const amenities = record(doc.amenities);
    const provenance = record(doc.public_import_provenance);
    return { ...common, rating: number(doc.rating) || null, type: text(doc.type, 60),
      access: text(doc.access, 60), reported: doc.is_reported === true,
      recommendation_signals: [
        ...(number(doc.rating) ? ["Community rated"] : []),
        ...(doc.is_iconic === true ? ["Marked iconic on PK Spot"] : []),
        ...(Array.isArray(doc.media) && doc.media.length > 0 ? ["Photos or media available on PK Spot"] : []),
        ...(doc.is_reported === true ? ["Reported: check current conditions on PK Spot"] : []),
      ],
      amenities: Object.fromEntries(["indoor", "outdoor", "covered", "lighting", "entry_fee", "drinking_water", "wc"]
        .map((key) => [key, typeof amenities[key] === "boolean" ? amenities[key] : null])),
      locality: text(record(doc.address).locality, 100),
      ...(Object.keys(provenance).length ? { attribution: {
        source_name: text(provenance.source_name, 160), attribution_text: text(provenance.attribution_text, 1000),
        website_url: safeUrl(provenance.website_url), source_url: safeUrl(provenance.source_url),
        instagram_url: safeUrl(provenance.instagram_url), viewer_url: safeUrl(provenance.viewer_url),
      } } : {}),
    };
  }
  if (kind === "event") {
    return { ...common, venue: text(doc.venue_string, 200), locality: text(doc.locality_string, 100),
      timing: { mode: text(record(doc.timing).mode, 40), start_date: text(record(doc.timing).start_date, 10),
        end_date: text(record(doc.timing).end_date, 10), start_time: text(record(doc.timing).start_time, 8),
        end_time: text(record(doc.timing).end_time, 8) },
      start: text(doc.start, 40), end: text(doc.end, 40), time_zone: text(doc.time_zone, 60),
      status: text(doc.lifecycle_status, 40), organizer: text(doc.organizer_name, 160),
      sponsored: doc.is_sponsored === true, promoted: doc.is_promoted === true };
  }
  const cards = Array.isArray(doc.infoCards) ? doc.infoCards : [];
  return { ...common, community_key: text(doc.communityKey, 160) ?? id,
    ...(detail ? { knowledge: cards.filter((card) => [undefined, "public"].includes(record(card).visibility as string | undefined)).slice(0, 8).map((card) => {
      const item = record(card);
      const cta = record(item.cta);
      return { title: localized(item.title, locale), body: localized(item.body, locale),
        category: text(item.category, 40), disclosure: text(item.commercialDisclosure, 40),
        ...([undefined, "public"].includes(item.ctaVisibility as string | undefined) ? { link: safeUrl(cta.url) } : {}) };
    }) } : {}),
  };
}
