const EMBED_CTA_UTM_PARAMETERS: Record<string, string> = {
  utm_source: "pkspot_embed",
  utm_medium: "embed_cta",
  utm_campaign: "open_on_pkspot",
  utm_content: "bottom_banner",
};

interface BuildUnembeddedUrlOptions {
  includeEmbedCtaUtm?: boolean;
}

export function buildUnembeddedUrlFromHref(
  href: string,
  options: BuildUnembeddedUrlOptions = {},
): string {
  const url = new URL(href, "https://pkspot.app");
  const includeEmbedCtaUtm = options.includeEmbedCtaUtm ?? true;

  url.pathname = url.pathname.replace(/\/embedded(?=\/|$)/, "") || "/";

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase() === "showheader") {
      url.searchParams.delete(key);
    }
  }

  if (includeEmbedCtaUtm) {
    for (const [key, value] of Object.entries(EMBED_CTA_UTM_PARAMETERS)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}
