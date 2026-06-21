export const CLIENT_REGION_HEADER = "x-pkspot-client-region";
export const LONG_LIVED_ASSET_CACHE_CONTROL =
  "public, max-age=31536000, immutable";
export const MISSING_ASSET_CACHE_CONTROL = "no-store";
export const QR_STICKER_CAMPAIGNS = {
  nice: {
    campaign: "nice-spot-v1",
    medium: "qr",
    source: "sticker",
    targetPath: "/map",
  },
};

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

export function getQrStickerCampaign(slug) {
  if (typeof slug !== "string") {
    return null;
  }

  return QR_STICKER_CAMPAIGNS[slug] ?? null;
}

export function getQrStickerRedirectTarget(originalUrl, slug = "nice") {
  const campaign = getQrStickerCampaign(slug);
  if (!campaign) {
    return null;
  }

  const sourceUrl = new URL(originalUrl || `/qr/${slug}`, "https://pkspot.app");
  const targetUrl = new URL(campaign.targetPath, "https://pkspot.app");

  sourceUrl.searchParams.forEach((value, key) => {
    if (!key.toLowerCase().startsWith("utm_")) {
      targetUrl.searchParams.append(key, value);
    }
  });

  targetUrl.searchParams.set("utm_source", campaign.source);
  targetUrl.searchParams.set("utm_medium", campaign.medium);
  targetUrl.searchParams.set("utm_campaign", campaign.campaign);

  return `${targetUrl.pathname}${targetUrl.search}`;
}

export function handleQrStickerRequest(req, res, next) {
  const slug = req?.params?.slug;
  const target = getQrStickerRedirectTarget(req?.originalUrl, slug);
  if (!target) {
    return next();
  }

  res.setHeader("Cache-Control", "no-store");
  return res.redirect(302, target);
}

export function sendMissingAssetResponse(res, requestPath) {
  if (res.headersSent) {
    return;
  }

  res.setHeader("Cache-Control", MISSING_ASSET_CACHE_CONTROL);
  res.status(404).type("text/plain").send(`Asset not found: ${requestPath}`);
}
