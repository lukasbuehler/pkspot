import {createHash, timingSafeEqual} from "node:crypto";

/**
 * Checks the app allow-list and shared Worker credential.
 * @param {string|undefined} authorizationHeader Authorization request header.
 * @param {string} expectedSecret Configured broker secret.
 * @param {unknown} requestedAppId App ID supplied by the Worker.
 * @param {string} expectedAppId Allow-listed Cloudflare SSR app ID.
 * @return {boolean} Whether the request is authorized.
 */
export function isAuthorizedCloudflareSsrTokenRequest(
  authorizationHeader: string | undefined,
  expectedSecret: string,
  requestedAppId: unknown,
  expectedAppId: string,
): boolean {
  if (!expectedSecret || !expectedAppId || typeof requestedAppId !== "string") {
    return false;
  }
  const prefix = "Bearer ";
  if (!authorizationHeader?.startsWith(prefix)) return false;

  const suppliedSecret = authorizationHeader.slice(prefix.length);
  return (
    requestedAppId === expectedAppId &&
    timingSafeEqual(digest(suppliedSecret), digest(expectedSecret))
  );
}

/**
 * Produces a fixed-length value for timing-safe comparisons.
 * @param {string} value Value to hash.
 * @return {Buffer} SHA-256 digest.
 */
function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
