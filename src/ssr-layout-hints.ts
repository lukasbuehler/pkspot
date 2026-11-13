/** The request headers that decide which layout the server renders. */
export interface SsrLayoutHints {
  mobile: boolean;
  tablet: boolean;
}

interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Guesses the layout for a server render from the request. The browser
 * replaces it with real breakpoints after hydration.
 *
 * The Cloudflare Worker keys cached HTML by this result, so the app and the
 * Worker must share this function. Any header read here changes the cache key.
 */
export function detectSsrLayoutHints(headers: HeaderReader | null | undefined): SsrLayoutHints {
  if (!headers) return { mobile: false, tablet: false };
  const userAgent = headers.get("user-agent") ?? "";
  const clientHint = headers.get("sec-ch-ua-mobile");
  return {
    mobile: clientHint === "?1" ? true : clientHint === "?0" ? false :
      /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent),
    tablet: /iPad|Android(?!.*Mobile)/i.test(userAgent),
  };
}
