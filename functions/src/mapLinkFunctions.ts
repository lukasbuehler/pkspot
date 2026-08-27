import { HttpsError, onCall } from "firebase-functions/v2/https";

const MAX_URL_LENGTH = 2_048;
const MAX_REDIRECTS = 5;
const REDIRECT_DEADLINE_MS = 8_000;
const GOOGLE_HOST_PATTERN = /^(?:(?:www|maps)\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/u;
const GOOGLE_SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);

type RedirectResponse = Pick<Response, "headers" | "status"> & {
  body?: Pick<ReadableStream, "cancel"> | null;
};
type RedirectFetch = (
  input: string,
  init: RequestInit,
) => Promise<RedirectResponse>;

const isGoogleMapsPath = (url: URL): boolean =>
  url.pathname === "/maps" || url.pathname.startsWith("/maps/");

const isGoogleShortLink = (url: URL): boolean => {
  const host = url.hostname.toLowerCase();
  return (
    host === "maps.app.goo.gl" ||
    (host === "goo.gl" && isGoogleMapsPath(url))
  );
};

export const isAllowedMapLinkUrl = (url: URL): boolean => {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "maps.apple.com" ||
    (GOOGLE_SHORT_HOSTS.has(host) && isGoogleShortLink(url)) ||
    (GOOGLE_HOST_PATTERN.test(host) && isGoogleMapsPath(url))
  );
};

export async function resolveMapRedirectChain(
  value: string,
  request: RedirectFetch = fetch,
  now: () => number = Date.now,
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
  if (!isGoogleShortLink(current)) {
    throw new HttpsError("invalid-argument", "Only supported map short links can be expanded.");
  }

  const visited = new Set<string>();
  const deadline = now() + REDIRECT_DEADLINE_MS;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (
      !isAllowedMapLinkUrl(current) ||
      current.toString().length > MAX_URL_LENGTH
    ) {
      throw new HttpsError("permission-denied", "The map link left the supported hosts.");
    }
    if (visited.has(current.toString())) {
      throw new HttpsError("failed-precondition", "The map link contains a redirect loop.");
    }
    visited.add(current.toString());

    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      throw new HttpsError("deadline-exceeded", "The map link took too long to resolve.");
    }
    let response: RedirectResponse;
    try {
      response = await request(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(remainingMs),
        headers: { "User-Agent": "PKSpot/1.1 map-link-resolver" },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new HttpsError(
          "deadline-exceeded",
          "The map link took too long to resolve.",
        );
      }
      throw error;
    }
    await response.body?.cancel().catch(() => undefined);
    if (response.status < 300 || response.status >= 400) {
      return current.toString();
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new HttpsError("failed-precondition", "The map link redirect is incomplete.");
    }
    try {
      current = new URL(location, current);
    } catch {
      throw new HttpsError("failed-precondition", "The map link redirect is invalid.");
    }
    if (
      !isAllowedMapLinkUrl(current) ||
      current.toString().length > MAX_URL_LENGTH
    ) {
      throw new HttpsError("permission-denied", "The map link left the supported hosts.");
    }
    if (!isGoogleShortLink(current)) {
      return current.toString();
    }
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
