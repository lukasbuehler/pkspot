import { LOCALE_ID, Pipe, PipeTransform, inject } from "@angular/core";
import { localizedPlaceLabel } from "../../scripts/LocalizedPlaceLabels";

/**
 * Shows a town in the app language when the server copied its translations
 * onto a search result, e.g. `hit.document.address?.locality | localizedPlace:
 * hit.document.place_names?.locality`. Falls back to the original text.
 */
@Pipe({ name: "localizedPlace" })
export class LocalizedPlacePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(original: string | null | undefined, names?: Record<string, string> | null): string {
    return localizedPlaceLabel(original ?? undefined, names ?? undefined, this.locale);
  }
}
