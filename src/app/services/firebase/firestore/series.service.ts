import { Injectable, inject } from "@angular/core";
import { SeriesSchema } from "../../../../db/schemas/SeriesSchema";
import { AssetUrlService } from "../../asset-url.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";

export type SeriesDocument = SeriesSchema & { id: string };

@Injectable({ providedIn: "root" })
export class SeriesService {
  private readonly _firestoreAdapter = inject(FirestoreAdapterService);
  private readonly _assetUrls = inject(AssetUrlService);
  private readonly _cache = new Map<string, Promise<SeriesDocument | null>>();

  async getSeriesById(seriesId: string): Promise<SeriesDocument | null> {
    const id = seriesId.trim();
    if (!id) return null;

    const cached = this._cache.get(id);
    if (cached) return cached;

    const request = this._loadSeriesById(id);
    this._cache.set(id, request);
    return request;
  }

  async getSeriesByIds(
    seriesIds: readonly string[],
  ): Promise<Record<string, SeriesDocument>> {
    const ids = [
      ...new Set(seriesIds.map((id) => id.trim()).filter(Boolean)),
    ].sort();
    const results = await Promise.all(ids.map((id) => this.getSeriesById(id)));
    return Object.fromEntries(
      results
        .filter((series): series is SeriesDocument => series !== null)
        .map((series) => [series.id, series]),
    );
  }

  private async _loadSeriesById(id: string): Promise<SeriesDocument | null> {
    const document = await this._firestoreAdapter.getDocument<
      SeriesSchema & { id?: string }
    >(`series/${id}`);
    if (!document) return null;

    return {
      ...document,
      id: document.id ?? id,
      logo_src: this._assetUrls.resolveBundledAssetUrl(document.logo_src),
    };
  }
}
