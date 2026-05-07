const LOCALE_PREFIX_PATTERN = "[a-z]{2}(?:-[A-Z]{2})?";
const RESERVED_MAP_NAMESPACES = [
  "spots",
  "events",
  "event",
  "communities",
  "community",
];

export function getLegacySsrRedirectTarget(originalUrl: string): string | null {
  const parsed = new URL(originalUrl || "/", "https://pkspot.app");
  const pathname = parsed.pathname;
  const search = parsed.search;

  const communityMatch = pathname.match(
    new RegExp(`^(\\/${LOCALE_PREFIX_PATTERN})?\\/map\\/community\\/([^/]+)$`, "u")
  );
  if (communityMatch) {
    const localePrefix = communityMatch[1] ?? "";
    const slug = communityMatch[2] ?? "";
    return `${localePrefix}/map/communities/${slug}${search}`;
  }

  const spotMatch = pathname.match(
    new RegExp(
      `^(\\/${LOCALE_PREFIX_PATTERN})?\\/map\\/([^/]+)(?:\\/(edits|c)(?:\\/([^/]+))?)?$`,
      "u"
    )
  );
  if (!spotMatch) {
    return null;
  }

  const namespaceOrSpot = spotMatch[2] ?? "";
  if (RESERVED_MAP_NAMESPACES.includes(namespaceOrSpot)) {
    return null;
  }

  const localePrefix = spotMatch[1] ?? "";
  const action = spotMatch[3] ? `/${spotMatch[3]}` : "";
  const child = spotMatch[4] ? `/${spotMatch[4]}` : "";
  return `${localePrefix}/map/spots/${namespaceOrSpot}${action}${child}${search}`;
}
