import { inject, Injectable } from "@angular/core";
import { FirestoreAdapterService } from "./firebase/firestore-adapter.service";
import { entityPlaceKey, placeNamesMatch, type EntityPlaceInput, type EntityPlaceNames } from "../../scripts/EntityPlaceNames";

@Injectable({ providedIn: "root" })
export class PlaceNamesService {
  private readonly firestore = inject(FirestoreAdapterService);
  private readonly cache = new Map<string, Promise<EntityPlaceNames | undefined>>();

  /** Read-only cache lookup. Never requests enrichment or calls an external provider. */
  get(input: EntityPlaceInput): Promise<EntityPlaceNames | undefined> {
    const key = entityPlaceKey(input);
    if (!key) return Promise.resolve(undefined);
    let pending = this.cache.get(key);
    if (!pending) {
      pending = Promise.resolve().then(() => this.firestore.getDocument<EntityPlaceNames>(`place_names/${key}`))
        .then((data) => data?.key === key && data.source === "geonames" && data.names ? data : undefined)
        .catch(() => { this.cache.delete(key); return undefined; });
      if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, pending);
    }
    return pending.then((names) => names && placeNamesMatch(names, input) ? names : undefined);
  }
}
