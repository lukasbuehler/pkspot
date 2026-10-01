import { z } from "zod";
import { getSpotPriority } from "../../src/db/schemas/SpotPriority";
import { isPublic, number, project, record, type DataSource, type Document, type Kind } from "./data";
import { ServiceError } from "./runtime";

const id = z.string().regex(/^[\w:.-]{1,160}$/);
const query = z.string().trim().min(2).max(120).refine((q) => /[\p{L}\p{N}]/u.test(q), "Use a meaningful search phrase.");
const locale = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/).default("en");
const limit = z.number().int().min(1).max(10).default(5);
const community = id.optional().describe("Public community ID returned by search_communities. Use it as a place reference, not a user's address.");
const date = z.string().datetime({ offset: true });
export const schemas = {
  search_spots: z.object({ query: query.optional(), community_id: community, limit, locale,
    sort: z.enum(["recommended", "rating", "nearest"]).default("recommended"),
    radius_km: z.number().min(0.5).max(50).default(10),
    access: z.enum(["public", "commercial"]).optional(),
    amenity: z.enum(["indoor", "outdoor", "covered", "lighting", "drinking_water", "wc"]).optional(),
  }).strict(),
  search_events: z.object({ query: query.optional(), community_id: community, limit, locale,
    starts_before: date.optional(), ends_after: date.optional(),
  }).strict(),
  search_communities: z.object({ query, limit, locale }).strict(),
  get_spot: z.object({ id, locale }).strict(),
  get_event: z.object({ id, locale }).strict(),
  get_community: z.object({ id, locale }).strict(),
};
export type ToolName = keyof typeof schemas;
export const toolNames = Object.keys(schemas) as ToolName[];
export const descriptions: Record<ToolName, string> = {
  search_spots: "Find up to ten public parkour Spots by phrase, referenced community, or coarse host location. For a named city, resolve search_communities and pass community_id; omit radius_km to use 10 km without asking. For near me, use host location or resolve a city already supplied in the conversation. Ask for a city only if no usable location is available. Recommended ranks a limited rating-selected candidate set, not every Spot. Distances are straight-line from the search center, not travel times. No pagination or export.",
  search_events: "Find upcoming public parkour events by phrase or referenced community. Supply explicit ISO date-time bounds with offsets for weekend/date queries. Canceled events remain labeled. No pagination or export.",
  search_communities: "Find public parkour communities by name or topic. Returns community references usable for Spot and event discovery. Do not send private user addresses.",
  get_spot: "Read current public information about one Spot. Access and unknown amenities are not guarantees of safety, permission, or opening hours.",
  get_event: "Read one currently published, globally discoverable parkour event. Private and unlisted events are unavailable.",
  get_community: "Read one published community and its public local knowledge cards. Hidden content and sign-in-only links are excluded.",
};

function center(doc: Document): [number, number] | undefined {
  const bounds = doc.bounds_center;
  if (Array.isArray(bounds) && bounds.length === 2 && bounds.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return Math.abs(bounds[0]) <= 90 && Math.abs(bounds[1]) <= 180 ? bounds as [number, number] : undefined;
  }
  const point = record(bounds);
  const lat = number(point.latitude), lng = number(point.longitude);
  return lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : undefined;
}
function hostCenter(meta: Document): [number, number] | undefined {
  const location = record(meta["openai/userLocation"]);
  const lat = number(location.latitude), lng = number(location.longitude);
  // Optional host hint affects search only. Never authorization, quotas or logs.
  return lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : undefined;
}
function distance(point: [number, number], doc: Document): number | undefined {
  const location = record(doc.location_raw);
  const geo = record(doc.location);
  const lat = number(location.lat) ?? number(geo.latitude), lng = number(location.lng) ?? number(geo.longitude);
  if (lat === undefined || lng === undefined) return undefined;
  const rad = Math.PI / 180;
  const a = Math.sin((lat - point[0]) * rad / 2) ** 2 + Math.cos(lat * rad) * Math.cos(point[0] * rad) * Math.sin((lng - point[1]) * rad / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))));
}

export class Discovery {
  constructor(private readonly source: DataSource, private readonly now = () => Date.now()) {}

  async run(name: ToolName, input: unknown, meta: Document = {}): Promise<Document> {
    const args = schemas[name].parse(input);
    const kind: Kind = name.endsWith("communities") || name.endsWith("community") ? "community" : name.endsWith("spots") || name.endsWith("spot") ? "spot" : "event";
    if ("id" in args) {
      const doc = await this.source.read(kind, args.id);
      return { item: doc && isPublic(kind, doc) ? project(kind, args.id, doc, args.locale, true) : null };
    }
    const parameters: Record<string, string> = { q: args.query ?? "*", per_page: String(args.limit) };
    const filters: string[] = kind === "spot" ? ["access:=[public,commercial]"] : ["published:=true"];
    let point: [number, number] | undefined;
    if ("community_id" in args && args.community_id) {
      const area = await this.source.read("community", args.community_id);
      if (!area || !isPublic("community", area)) throw new ServiceError("invalid_area");
      point = center(area);
      if (kind === "event") filters.push(`community_keys:=[\`${args.community_id}\`]`);
    }
    if (name === "search_spots") {
      const options = schemas.search_spots.parse(args);
      point ??= options.community_id ? undefined : hostCenter(meta);
      if ((options.community_id || options.sort === "nearest") && !point) throw new ServiceError("invalid_area");
      if (!point && !options.query) throw new ServiceError("invalid_area");
      if (point) filters.push(`location:(${point[0]},${point[1]},${options.radius_km} km)`);
      if (options.access) filters.push(`access:=${options.access}`);
      if (options.amenity) filters.push(`amenities_true:=${options.amenity}`);
      parameters.query_by = "name_search,description_search,address.locality";
      parameters.sort_by = options.sort === "nearest" && point ? `location(${point[0]},${point[1]}):asc` : "rating:desc";
      // Bounded overfetch makes recommendations useful without enabling enumeration.
      parameters.per_page = "10";
    } else if (name === "search_events") {
      const options = schemas.search_events.parse(args);
      const after = options.ends_after ? Date.parse(options.ends_after) : this.now();
      const before = options.starts_before ? Date.parse(options.starts_before) : after + 90 * 86400000;
      if (before <= after || before - after > 366 * 86400000) throw new ServiceError("invalid_dates");
      filters.push(`end_seconds:>=${Math.floor(after / 1000)}`, `start_seconds:<=${Math.floor(before / 1000)}`);
      parameters.query_by = "name,description,locality_string,venue_string";
      parameters.sort_by = "start_seconds:asc";
    } else {
      parameters.query_by = "displayName,title,allSlugs,search_aliases";
      parameters.sort_by = "_text_match:desc,counts.totalSpots:desc";
    }
    parameters.filter_by = filters.join(" && ");
    const ids = [...new Set(await this.source.search(kind, parameters))].slice(0, 10);
    let candidates = (await Promise.all(ids.map(async (id) => ({ id, doc: await this.source.read(kind, id) }))))
      .filter((item): item is { id: string; doc: Document } => item.doc !== null && isPublic(kind, item.doc));
    if (name === "search_events") {
      const options = schemas.search_events.parse(args);
      const after = options.ends_after ? Date.parse(options.ends_after) : this.now();
      const before = options.starts_before ? Date.parse(options.starts_before) : after + 90 * 86400000;
      const timestamp = (value: unknown) => typeof value === "string" ? Date.parse(value) : NaN;
      candidates = candidates.filter(({ doc }) => timestamp(doc.start) <= before && timestamp(doc.end) >= after &&
        (!options.community_id || (Array.isArray(doc.community_keys) && doc.community_keys.includes(options.community_id))));
      candidates.sort((a, b) => timestamp(a.doc.start) - timestamp(b.doc.start));
    }
    if (name === "search_spots") {
      const options = schemas.search_spots.parse(args);
      candidates = candidates.filter(({ doc }) => {
        if (!["public", "commercial"].includes(String(doc.access))) return false;
        if (options.access && doc.access !== options.access) return false;
        if (options.amenity && record(doc.amenities)[options.amenity] !== true) return false;
        const meters = point ? distance(point, doc) : undefined;
        return !point || (meters !== undefined && meters <= options.radius_km * 1000);
      });
      const score = (doc: Document) => getSpotPriority({ rating: number(doc.rating), access: String(doc.access),
        isIconic: doc.is_iconic === true, isReported: doc.is_reported === true,
        hasMedia: Array.isArray(doc.media) && doc.media.length > 0,
        recent_activity_min_30d: number(doc.recent_activity_min_30d) });
      candidates.sort((a, b) => options.sort === "recommended" ? score(b.doc) - score(a.doc)
        : options.sort === "rating" ? (number(b.doc.rating) ?? 0) - (number(a.doc.rating) ?? 0)
        : (distance(point!, a.doc) ?? Infinity) - (distance(point!, b.doc) ?? Infinity));
    }
    return { items: candidates.slice(0, args.limit).map(({ id, doc }) => ({ ...project(kind, id, doc, args.locale, false),
      ...(kind === "spot" && point ? { distance_m: distance(point, doc) } : {}) })),
      scope: "A bounded selection from PK Spot; not an exhaustive directory. No more pages are available.",
      ...(name === "search_spots" ? { ranking: schemas.search_spots.parse(args).sort } : {}),
    };
  }
}
