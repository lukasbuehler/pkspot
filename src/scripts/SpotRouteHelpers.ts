export const SPOT_ROUTE_PREFIX = "/map/spots";

export function buildSpotCanonicalPath(
  slugOrId: string | null | undefined
): string {
  return `${SPOT_ROUTE_PREFIX}/${encodeURIComponent(String(slugOrId ?? ""))}`;
}

export function buildSpotChallengeCanonicalPath(
  slugOrId: string | null | undefined,
  challengeId?: string | null
): string {
  const base = `${buildSpotCanonicalPath(slugOrId)}/c`;
  return challengeId ? `${base}/${encodeURIComponent(challengeId)}` : base;
}

export function buildSpotEditHistoryCanonicalPath(
  slugOrId: string | null | undefined
): string {
  return `${buildSpotCanonicalPath(slugOrId)}/edits`;
}

export function normalizeLegacySpotMapPath(path: string): string {
  const cleanPath = path || "/";
  const queryIndex = cleanPath.search(/[?#]/u);
  const pathname =
    queryIndex >= 0 ? cleanPath.slice(0, queryIndex) : cleanPath;
  const suffix = queryIndex >= 0 ? cleanPath.slice(queryIndex) : "";
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "map") {
    return cleanPath;
  }

  if (
    !segments[1] ||
    ["spots", "events", "event", "communities", "community"].includes(
      segments[1]
    )
  ) {
    return cleanPath;
  }

  return `/${["map", "spots", ...segments.slice(1)].join("/")}${suffix}`;
}
