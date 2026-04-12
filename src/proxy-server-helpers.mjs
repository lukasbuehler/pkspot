export const CLIENT_REGION_HEADER = "x-pkspot-client-region";

export function normalizeClientRegionHeader(value) {
  if (Array.isArray(value)) {
    return normalizeClientRegionHeader(value[0]);
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(normalizedValue) ? normalizedValue : null;
}

export function getTrustedClientRegionFromHeaders(headers) {
  return normalizeClientRegionHeader(headers?.[CLIENT_REGION_HEADER]);
}

export function applyTrustedClientRegionHeader(headers) {
  const normalizedRegion = getTrustedClientRegionFromHeaders(headers);

  if (normalizedRegion) {
    headers[CLIENT_REGION_HEADER] = normalizedRegion;
    return normalizedRegion;
  }

  delete headers[CLIENT_REGION_HEADER];
  return null;
}
