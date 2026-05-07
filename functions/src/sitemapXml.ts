const BASE_URL = "https://pkspot.app";

// Supported languages - must match the Angular i18n setup
const SUPPORTED_LOCALES = ["en", "de", "de-CH", "fr", "it", "es", "nl"];
const DEFAULT_LOCALE = "en";

// Static pages from app.routes.ts (excluding redirects, auth-required, and embedded pages)
const STATIC_PAGES = [
  { path: "/map", priority: "1.0", changefreq: "daily" },
  { path: "/events", priority: "0.8", changefreq: "weekly" },
  { path: "/events/swissjam25", priority: "0.7", changefreq: "weekly" },
  { path: "/about", priority: "0.7", changefreq: "monthly" },
  { path: "/support", priority: "0.5", changefreq: "monthly" },
  { path: "/sign-in", priority: "0.5", changefreq: "monthly" },
  { path: "/sign-up", priority: "0.5", changefreq: "monthly" },
  { path: "/forgot-password", priority: "0.3", changefreq: "monthly" },
  { path: "/terms-of-service", priority: "0.3", changefreq: "yearly" },
  { path: "/privacy-policy", priority: "0.3", changefreq: "yearly" },
  { path: "/impressum", priority: "0.3", changefreq: "yearly" },
  { path: "/embed", priority: "0.4", changefreq: "monthly" },
] as const;

export interface UserSitemapData {
  display_name?: string;
}

export interface SpotSitemapData {
  slug?: string;
  time_updated?: { seconds: number; nanoseconds: number };
}

export interface CommunitySitemapData {
  canonicalPath?: string;
  preferredSlug?: string;
  published?: boolean;
  scope?: "country" | "region" | "locality";
  generatedAt?: { seconds: number; nanoseconds: number };
  sourceMaxUpdatedAt?: { seconds: number; nanoseconds: number };
}

export interface EventSitemapData {
  slug?: string;
  canonicalPath?: string;
  published?: boolean;
  status?: string;
  time_updated?: { seconds: number; nanoseconds: number };
  updatedAt?: { seconds: number; nanoseconds: number };
  startDate?: { seconds: number; nanoseconds: number } | string;
}

export interface SitemapRecord<TData> {
  id: string;
  data: TData;
}

export interface SitemapGenerationStats {
  spotCount: number;
  userCount: number;
  communityCount: number;
  eventCount: number;
  slugCount: number;
  staticPageCount: number;
  totalUrls: number;
}

export interface ResolvedSitemapEntry {
  path: string;
  lastmod: string;
  changefreq: string;
  priority: string;
}

export interface SitemapBuildResult {
  xml: string;
  stats: SitemapGenerationStats;
}

function buildSitemapHeader(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
`;
}

/**
 * Generates a URL entry with hreflang annotations for all supported locales.
 */
function generateUrlWithHreflang(
  path: string,
  lastmod: string,
  changefreq: string,
  priority: string
): string {
  let xml = "";

  for (const locale of SUPPORTED_LOCALES) {
    const fullUrl = `${BASE_URL}/${locale}${path}`;

    xml += `  <url>
    <loc>${fullUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
`;

    for (const altLocale of SUPPORTED_LOCALES) {
      const altUrl = `${BASE_URL}/${altLocale}${path}`;
      const hreflangCode = getHreflangCode(altLocale);
      xml += `    <xhtml:link rel="alternate" hreflang="${hreflangCode}" href="${altUrl}"/>
`;
    }

    xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE_URL}/${DEFAULT_LOCALE}${path}"/>
`;

    xml += `  </url>
`;
  }

  return xml;
}

/**
 * Converts locale code to hreflang format.
 * e.g., "de-CH" stays "de-CH", "en" stays "en"
 */
function getHreflangCode(locale: string): string {
  return locale;
}

function getNowDateString(): string {
  return new Date().toISOString().split("T")[0];
}

function getLastModDate(
  timeUpdated:
    | SpotSitemapData["time_updated"]
    | CommunitySitemapData["generatedAt"]
    | CommunitySitemapData["sourceMaxUpdatedAt"]
    | EventSitemapData["time_updated"]
    | EventSitemapData["updatedAt"]
    | EventSitemapData["startDate"],
  fallbackDate: string
): string {
  if (typeof timeUpdated === "string") {
    const parsed = new Date(timeUpdated);
    return Number.isNaN(parsed.getTime())
      ? fallbackDate
      : parsed.toISOString().split("T")[0];
  }

  if (!timeUpdated?.seconds) {
    return fallbackDate;
  }

  return new Date(timeUpdated.seconds * 1000).toISOString().split("T")[0];
}

function getSpotPath(id: string, data: SpotSitemapData): string {
  const slug = data.slug?.trim();
  return slug ? `/map/${encodeURIComponent(slug)}` : `/map/${encodeURIComponent(id)}`;
}

function getCommunityPath(data: CommunitySitemapData): string {
  const canonicalPath = data.canonicalPath?.trim();
  if (canonicalPath) {
    return canonicalPath.replace(/^\/map\/community\//u, "/map/communities/");
  }

  const preferredSlug = data.preferredSlug?.trim();
  return preferredSlug
    ? `/map/communities/${encodeURIComponent(preferredSlug)}`
    : "";
}

function getEventPath(id: string, data: EventSitemapData): string {
  const canonicalPath = data.canonicalPath?.trim();
  if (canonicalPath) {
    return canonicalPath;
  }

  const slug = data.slug?.trim();
  return `/events/${encodeURIComponent(slug || id)}`;
}

function buildStaticPageEntries(now: string): string {
  return STATIC_PAGES.map((page) =>
    generateUrlWithHreflang(page.path, now, page.changefreq, page.priority)
  ).join("");
}

function buildStats(
  staticPageCount: number,
  spotCount: number,
  userCount: number,
  communityCount: number,
  eventCount: number,
  slugCount: number
): SitemapGenerationStats {
  return {
    spotCount,
    userCount,
    communityCount,
    eventCount,
    slugCount,
    staticPageCount,
    totalUrls:
      (staticPageCount + spotCount + userCount + communityCount + eventCount) *
      SUPPORTED_LOCALES.length,
  };
}

function buildSpotEntries(
  spots: SitemapRecord<SpotSitemapData>[],
  fallbackDate: string
): { xml: string; spotCount: number; slugCount: number } {
  let xml = "";
  let spotCount = 0;
  let slugCount = 0;

  for (const spot of spots) {
    const slug = spot.data.slug?.trim();
    const path = getSpotPath(spot.id, spot.data);

    if (slug) {
      slugCount += 1;
    }

    spotCount += 1;
    const lastmod = getLastModDate(spot.data.time_updated, fallbackDate);
    const priority = slug ? "0.9" : "0.8";
    xml += generateUrlWithHreflang(path, lastmod, "weekly", priority);
  }

  return { xml, spotCount, slugCount };
}

function buildUserEntries(
  users: SitemapRecord<UserSitemapData>[],
  fallbackDate: string
): { xml: string; userCount: number } {
  let xml = "";
  let userCount = 0;

  for (const user of users) {
    const displayName = user.data.display_name?.trim();
    if (!displayName) {
      continue;
    }

    userCount += 1;
    const path = `/u/${encodeURIComponent(user.id)}`;
    xml += generateUrlWithHreflang(path, fallbackDate, "weekly", "0.6");
  }

  return { xml, userCount };
}

function buildCommunityEntries(
  communities: SitemapRecord<CommunitySitemapData>[],
  fallbackDate: string
): { xml: string; communityCount: number } {
  let xml = "";
  let communityCount = 0;

  for (const community of communities) {
    if (community.data.published === false) {
      continue;
    }

    const path = getCommunityPath(community.data);
    if (!path) {
      continue;
    }

    communityCount += 1;
    const lastmod = getLastModDate(
      community.data.sourceMaxUpdatedAt ?? community.data.generatedAt,
      fallbackDate
    );
    const priority =
      community.data.scope === "country"
        ? "0.8"
        : community.data.scope === "region"
          ? "0.75"
          : "0.7";
    xml += generateUrlWithHreflang(path, lastmod, "weekly", priority);
  }

  return { xml, communityCount };
}

function buildEventEntries(
  events: SitemapRecord<EventSitemapData>[],
  fallbackDate: string,
  excludedPaths: Set<string> = new Set()
): { xml: string; eventCount: number } {
  let xml = "";
  let eventCount = 0;

  for (const event of events) {
    const entry = buildEventSitemapEntry(event.id, event.data, fallbackDate);
    if (!entry || excludedPaths.has(entry.path)) {
      continue;
    }

    eventCount += 1;
    xml += generateUrlWithHreflang(
      entry.path,
      entry.lastmod,
      entry.changefreq,
      entry.priority
    );
  }

  return { xml, eventCount };
}

export function buildSpotSitemapEntry(
  id: string,
  data: SpotSitemapData,
  fallbackDate: string
): ResolvedSitemapEntry {
  const slug = data.slug?.trim();

  return {
    path: getSpotPath(id, data),
    lastmod: getLastModDate(data.time_updated, fallbackDate),
    changefreq: "weekly",
    priority: slug ? "0.9" : "0.8",
  };
}

export function buildUserSitemapEntry(
  id: string,
  data: UserSitemapData,
  fallbackDate: string
): ResolvedSitemapEntry | null {
  const displayName = data.display_name?.trim();
  if (!displayName) {
    return null;
  }

  return {
    path: `/u/${encodeURIComponent(id)}`,
    lastmod: fallbackDate,
    changefreq: "weekly",
    priority: "0.6",
  };
}

export function buildCommunitySitemapEntry(
  data: CommunitySitemapData,
  fallbackDate: string
): ResolvedSitemapEntry | null {
  if (data.published === false) {
    return null;
  }

  const path = getCommunityPath(data);
  if (!path) {
    return null;
  }

  return {
    path,
    lastmod: getLastModDate(data.sourceMaxUpdatedAt ?? data.generatedAt, fallbackDate),
    changefreq: "weekly",
    priority:
      data.scope === "country" ? "0.8" : data.scope === "region" ? "0.75" : "0.7",
  };
}

export function buildEventSitemapEntry(
  id: string,
  data: EventSitemapData,
  fallbackDate: string
): ResolvedSitemapEntry | null {
  if (data.published === false || data.status === "draft") {
    return null;
  }

  const path = getEventPath(id, data);
  if (!path) {
    return null;
  }

  return {
    path,
    lastmod: getLastModDate(
      data.time_updated ?? data.updatedAt ?? data.startDate,
      fallbackDate
    ),
    changefreq: "weekly",
    priority: "0.7",
  };
}

export function buildSitemapXml(params: {
  now?: string;
  includeStaticPages?: boolean;
  spots?: SitemapRecord<SpotSitemapData>[];
  users?: SitemapRecord<UserSitemapData>[];
  communities?: SitemapRecord<CommunitySitemapData>[];
  events?: SitemapRecord<EventSitemapData>[];
}): SitemapBuildResult {
  const now = params.now ?? getNowDateString();
  const includeStaticPages = params.includeStaticPages ?? true;
  const spots = params.spots ?? [];
  const users = params.users ?? [];
  const communities = params.communities ?? [];
  const events = params.events ?? [];

  const staticPageXml = includeStaticPages ? buildStaticPageEntries(now) : "";
  const staticPageCount = includeStaticPages ? STATIC_PAGES.length : 0;
  const staticPaths = includeStaticPages
    ? new Set(STATIC_PAGES.map((page) => page.path))
    : new Set<string>();
  const { xml: spotXml, spotCount, slugCount } = buildSpotEntries(spots, now);
  const { xml: userXml, userCount } = buildUserEntries(users, now);
  const { xml: communityXml, communityCount } = buildCommunityEntries(
    communities,
    now
  );
  const { xml: eventXml, eventCount } = buildEventEntries(
    events,
    now,
    staticPaths
  );

  return {
    xml:
      buildSitemapHeader() +
      staticPageXml +
      spotXml +
      userXml +
      communityXml +
      eventXml +
      "</urlset>",
    stats: buildStats(
      staticPageCount,
      spotCount,
      userCount,
      communityCount,
      eventCount,
      slugCount
    ),
  };
}

export {
  BASE_URL,
  DEFAULT_LOCALE,
  STATIC_PAGES,
  SUPPORTED_LOCALES,
  buildSitemapHeader,
  buildEventEntries,
  generateUrlWithHreflang,
  getHreflangCode,
  getLastModDate,
  getNowDateString,
};
