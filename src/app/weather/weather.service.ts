import { Injectable, inject } from "@angular/core";
import { FunctionsAdapterService } from "../services/firebase/functions-adapter.service";
import type {
  CurrentWeatherRequest,
  WeatherLocation,
  WeatherResponse,
} from "./weather.models";

@Injectable({
  providedIn: "root",
})
export class WeatherService {
  private readonly functions = inject(FunctionsAdapterService);
  private readonly pendingRequests = new Map<string, Promise<WeatherResponse>>();

  getCurrentAndNearFuture(
    location: WeatherLocation,
    nearFutureHours = 12,
  ): Promise<WeatherResponse> {
    const key = [
      location.lat.toFixed(3),
      location.lng.toFixed(3),
      nearFutureHours,
    ].join(":");
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending;
    }

    const request = this.functions.callPublic<
      CurrentWeatherRequest,
      WeatherResponse
    >("getWeather", {
      mode: "current-and-near-future",
      location,
      nearFutureHours,
    });
    this.pendingRequests.set(key, request);
    void request.then(
      () => this.pendingRequests.delete(key),
      () => this.pendingRequests.delete(key),
    );
    return request;
  }
}
