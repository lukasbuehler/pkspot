import {
  SUPPORTED_UI_LOCALES,
  LEGACY_UI_LOCALE_REDIRECTS,
} from "./app/config/ui-locales";
import { getLegacySsrRedirectTarget } from "./server-redirects";

export interface CloudflareAssets {
  fetch(request: Request): Promise<Response>;
}

type RenderRequest = (
  request: Request,
) => Promise<Response | null> | Response | null;
const locales = new Set<string>(SUPPORTED_UI_LOCALES);

export function createCloudflareRequestHandler(render: RenderRequest) {
  return async (
    request: Request,
    environment: { ASSETS: CloudflareAssets },
  ): Promise<Response> => {
    const url = new URL(request.url);
    const response = await routeRequest(
      request,
      url,
      environment.ASSETS,
      render,
    );
    const headers = new Headers(response.headers);
    if (
      url.hostname === "test.pkspot.app" ||
      url.hostname.endsWith(".test.pkspot.app") ||
      url.hostname.endsWith(".workers.dev")
    ) {
      headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    }
    return new Response(request.method === "HEAD" ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

async function routeRequest(
  request: Request,
  url: URL,
  assets: CloudflareAssets,
  render: RenderRequest,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }
  const [, first] = url.pathname.split("/");
  const retired = Object.hasOwn(LEGACY_UI_LOCALE_REDIRECTS, first)
    ? LEGACY_UI_LOCALE_REDIRECTS[
        first as keyof typeof LEGACY_UI_LOCALE_REDIRECTS
      ]
    : undefined;
  if (retired)
    return redirect(
      `/${retired}${url.pathname.slice(first.length + 1)}${url.search}`,
      301,
    );
  if (url.pathname.endsWith("/index.html")) {
    return redirect(`${url.pathname.slice(0, -11) || "/"}${url.search}`, 301);
  }
  const legacy = getLegacySsrRedirectTarget(url.pathname + url.search);
  if (legacy) return redirect(legacy, 301);
  if (
    /^(?:\/(?:en|de|fr|it|es|nl))?\/(?:assets\/)?sitemap\.xml$/u.test(
      url.pathname,
    )
  ) {
    return redirect(
      "https://storage.googleapis.com/parkour-base-project.appspot.com/sitemap.xml",
      301,
    );
  }

  const localized = locales.has(first);
  if (
    url.pathname.includes("/assets/") ||
    url.pathname.startsWith("/.well-known/") ||
    /\/[^/]+\.[^/]+$/u.test(url.pathname)
  ) {
    const assetUrl = new URL(url);
    if (!localized) {
      assetUrl.pathname = `/en${url.pathname.startsWith("/.well-known/") ? "/assets" : ""}${url.pathname}`;
    }
    const response = await assets.fetch(new Request(assetUrl, request));
    const headers = new Headers(response.headers);
    if (response.status === 404) headers.set("Cache-Control", "no-store");
    if (url.pathname === "/firebase-messaging-sw.js") {
      headers.set("Service-Worker-Allowed", "/");
      headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    }
    if (url.pathname.endsWith("/apple-app-site-association"))
      headers.set("Content-Type", "application/json");
    return new Response(response.body, { status: response.status, headers });
  }
  if (!localized) {
    const locale = preferredLocale(
      request.headers.get("Accept-Language") ?? "",
    );
    const response = redirect(
      `/${locale}${url.pathname === "/" ? "" : url.pathname}${url.search}`,
      302,
    );
    response.headers.set("Vary", "Accept-Language");
    return response;
  }
  // Express renders the map at the locale root without an extra redirect.
  if (url.pathname === `/${first}` || url.pathname === `/${first}/`)
    url.pathname = `/${first}/map`;
  const response =
    (await render(new Request(url, request))) ??
    new Response("Not Found", { status: 404 });
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-cache");
  return new Response(response.body, { status: response.status, headers });
}

function redirect(location: string, status: number): Response {
  return new Response(null, {
    status,
    headers: { Location: location, "Cache-Control": "no-cache" },
  });
}

function preferredLocale(header: string): string {
  const preferences = header.split(",").map((entry) => {
    const [language, ...parameters] = entry.trim().toLowerCase().split(";");
    const quality = parameters.find((value) => value.trim().startsWith("q="));
    return {
      locale: language.split("-")[0],
      weight: quality ? Number(quality.trim().slice(2)) : 1,
    };
  });
  return (
    preferences
      .filter(({ weight }) => weight > 0 && weight <= 1)
      .sort((a, b) => b.weight - a.weight)
      .find(({ locale }) => locales.has(locale))?.locale ?? "en"
  );
}
