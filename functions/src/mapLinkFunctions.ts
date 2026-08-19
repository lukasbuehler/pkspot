import { HttpsError, onCall } from "firebase-functions/v2/https";

const MAX_URL_LENGTH = 2_048;
const MAX_REDIRECTS = 5;
const REDIRECT_TIMEOUT_MS = 5_000;
const GOOGLE_HOST_PATTERN = /^(?:(?:www|maps)\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/u;
const GOOGLE_SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);

type RedirectFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "headers" | "status">>;

export const isAllowedMapLinkUrl = (url: URL): boolean => {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "maps.apple.com" ||
    GOOGLE_SHORT_HOSTS.has(host) ||
    GOOGLE_HOST_PATTERN.test(host)
  );
};

export async function resolveMapRedirectChain(
  value: string,
  request: RedirectFetch = fetch,
): Promise<string> {
  if (!value || value.length > MAX_URL_LENGTH) {
    throw new HttpsError("invalid-argument", "A valid map URL is required.");
  }

  let current: URL;
  try {
    current = new URL(value);
  } catch {
    throw new HttpsError("invalid-argument", "A valid map URL is required.");
  }
  if (!GOOGLE_SHORT_HOSTS.has(current.hostname.toLowerCase())) {
    throw new HttpsError("invalid-argument", "Only supported map short links can be expanded.");
  }

  const visited = new Set<string>();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isAllowedMapLinkUrl(current) || current.toString().length > MAX_URL_LENGTH) {
      throw new HttpsError("permission-denied", "The map link left the supported hosts.");
    }
    if (visited.has(current.toString())) {
      throw new HttpsError("failed-precondition", "The map link contains a redirect loop.");
    }
    visited.add(current.toString());

    const response = await request(current.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(REDIRECT_TIMEOUT_MS),
      headers: { "User-Agent": "PKSpot/1.1 map-link-resolver" },
    });
    if (response.status < 300 || response.status >= 400) {
      return current.toString();
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new HttpsError("failed-precondition", "The map link redirect is incomplete.");
    }
    current = new URL(location, current);
  }

  throw new HttpsError("resource-exhausted", "The map link has too many redirects.");
}

export const resolveMapShortLink = onCall(
  { enforceAppCheck: true, timeoutSeconds: 10 },
  async (request): Promise<{ finalUrl: string }> => {
    const value =
      typeof request.data === "object" &&
      request.data !== null &&
      typeof request.data.url === "string"
        ? request.data.url.trim()
        : "";
    return { finalUrl: await resolveMapRedirectChain(value) };
  },
);
