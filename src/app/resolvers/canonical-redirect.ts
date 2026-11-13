import { Params, RedirectCommand, Router, UrlTree } from "@angular/router";

/**
 * Builds a permanent redirect from an alternate URL to the entity's canonical
 * page during server rendering.
 *
 * Angular SSR turns a navigation that ends on a different URL into an HTTP
 * redirect whose status comes from `RESPONSE_INIT`, so this sets 301 there.
 * Crawlers then consolidate the alternate onto the canonical URL instead of
 * reporting "Alternate page with proper canonical tag".
 *
 * `canonicalPath` is an app path without the locale prefix (for example
 * `/map/communities/melbourne`); the localized base href is added by the
 * router, so the redirect keeps the requested locale. Query parameters are
 * preserved.
 */
export function permanentCanonicalRedirect(
  router: Router,
  response: ResponseInit | null,
  canonicalPath: string,
  queryParams: Params | null | undefined,
): RedirectCommand {
  if (response) response.status = 301;
  const target = router.parseUrl(canonicalPath);
  return new RedirectCommand(
    new UrlTree(target.root, { ...(queryParams ?? {}) }, target.fragment),
  );
}
