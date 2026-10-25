import { inject, Injectable } from "@angular/core";
import type { LocaleCode } from "../../db/models/Interfaces";
import type { Spot } from "../../db/models/Spot";
import type { SpotId } from "../../db/schemas/SpotSchema";
import { SpotsService } from "./firebase/firestore/spots.service";

/** Shares Spot lookups across picker instances and evicts failed requests. */
@Injectable({ providedIn: "root" })
export class SpotSelectionDataService {
  private readonly spotsService = inject(SpotsService);
  private readonly cache = new Map<string, Promise<Spot>>();


  /** Resolve older session visits without changing their private stored history. */
  async resolveVisitNames(
    visits: readonly { spot_id: string; spot_name?: string }[],
    locale: LocaleCode,
  ): Promise<ReadonlyMap<string, string>> {
    const names = new Map(visits.filter(visit => visit.spot_name).map(visit => [visit.spot_id, visit.spot_name!]));
    const missing = [...new Set(visits.map(visit => visit.spot_id))].filter(id => !names.has(id));
    // Old training archives can contain many unique Spots. Bound concurrent reads.
    for (let offset = 0; offset < missing.length; offset += 6) {
      await Promise.all(missing.slice(offset, offset + 6).map(async id => {
        try { names.set(id, (await this.resolve(id, locale)).name() || $localize`:@@training.spotUnavailable:Unavailable Spot`); }
        catch { names.set(id, $localize`:@@training.spotUnavailable:Unavailable Spot`); }
      }));
    }
    return names;
  }

  resolve(id: string, locale: LocaleCode): Promise<Spot> {
    const key = `${locale}:${id}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const request = this.spotsService
      .getSpotById(id as SpotId, locale)
      .catch((error: unknown) => {
        this.cache.delete(key);
        throw error;
      });
    this.cache.set(key, request);
    return request;
  }
}
