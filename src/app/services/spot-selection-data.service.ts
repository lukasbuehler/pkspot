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
