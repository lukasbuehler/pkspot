import { LocationStrategy } from "@angular/common";
import { Pipe, PipeTransform, inject } from "@angular/core";
import { isKnownUiLocalePrefix } from "../config/ui-locales";

/**
 * Turns an app path such as `/map/spots/rwi` into the crawlable href that
 * `routerLink` would render, e.g. `/en/map/spots/rwi` in the English build.
 *
 * Use it for hand-built `href` bindings on links whose clicks are handled in
 * code. Root-absolute paths ignore `<base href>`, so without the locale prefix
 * every such link costs crawlers and users a server redirect.
 */
@Pipe({ name: "appHref" })
export class AppHrefPipe implements PipeTransform {
  private readonly locationStrategy = inject(LocationStrategy);

  transform(path: string | null | undefined): string | null {
    if (!path) return null;
    if (!path.startsWith("/") || path.startsWith("//")) return path;
    // Paths that already carry a locale must not get a second prefix.
    if (isKnownUiLocalePrefix(path.split(/[/?#]/u)[1])) return path;
    return this.locationStrategy.prepareExternalUrl(path);
  }
}
