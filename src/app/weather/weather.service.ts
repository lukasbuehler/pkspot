import { Injectable, inject } from "@angular/core";
import { FunctionsAdapterService } from "../services/firebase/functions-adapter.service";
import type {
  CurrentWeatherRequest,
  WeatherLocation,
  WeatherResponse,
  WeatherTile,
} from "./weather.models";

@Injectable({
  providedIn: "root",
})
export class WeatherService {
  private static readonly MAX_CLIENT_CACHE_ENTRIES = 64;
  private readonly functions = inject(FunctionsAdapterService);
  private readonly pendingRequests = new Map<string, Promise<WeatherResponse>>();
  private readonly responseCache = new Map<string, WeatherResponse>();

  getCurrentAndNearFuture(
    location: WeatherLocation,
    nearFutureHours = 12,
  ): Promise<WeatherResponse> {
    const key = [
      location.lat.toFixed(3),
      location.lng.toFixed(3),
      nearFutureHours,
    ].join(":");
    return this.getCurrentAndNearFutureByKey(
      key,
      {
        mode: "current-and-near-future",
        location,
        nearFutureHours,
      },
    );
  }

  getCurrentAndNearFutureForTile(
    tile: WeatherTile,
    nearFutureHours = 12,
  ): Promise<WeatherResponse> {
    return this.getCurrentAndNearFutureByKey(
      `tile:${tile.key}:${nearFutureHours}`,
      {
        mode: "current-and-near-future",
        location: tile.center,
        nearFutureHours,
        spatialScope: {
          type: tile.type,
          zoom: tile.zoom,
          x: tile.x,
          y: tile.y,
        },
      },
    );
  }

  private getCurrentAndNearFutureByKey(
    key: string,
    requestData: CurrentWeatherRequest,
  ): Promise<WeatherResponse> {
    const cached = this.responseCache.get(key);
    if (cached) {
      if (Date.parse(cached.expiresAt) > Date.now()) {
        this.responseCache.delete(key);
        this.responseCache.set(key, cached);
        return Promise.resolve(cached);
      }
      this.responseCache.delete(key);
    }

    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending;
    }

    const request = this.functions.callPublic<
      CurrentWeatherRequest,
      WeatherResponse
    >("getWeather", requestData);
    this.pendingRequests.set(key, request);
    void request.then(
      (response) => {
        this.pendingRequests.delete(key);
        if (Date.parse(response.expiresAt) > Date.now()) {
          this.responseCache.set(key, response);
          while (
            this.responseCache.size >
            WeatherService.MAX_CLIENT_CACHE_ENTRIES
          ) {
            const oldestKey = this.responseCache.keys().next().value;
            if (oldestKey === undefined) break;
            this.responseCache.delete(oldestKey);
          }
        }
      },
      () => this.pendingRequests.delete(key),
    );
    return request;
  }
}
