import { Injectable, inject } from "@angular/core";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";

@Injectable({ providedIn: "root" })
export class EventTimeZoneService {
  private readonly functions = inject(FunctionsAdapterService);

  async resolve(location: { lat: number; lng: number }): Promise<string> {
    const result = await this.functions.call<
      { lat: number; lng: number },
      { timeZone: string }
    >("resolveEventTimeZone", location);
    return result.timeZone;
  }
}
