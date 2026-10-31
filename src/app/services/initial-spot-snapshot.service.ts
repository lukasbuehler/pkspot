import { isPlatformBrowser, isPlatformServer } from "@angular/common";
import { Injectable, PLATFORM_ID, TransferState, inject, makeStateKey } from "@angular/core";
import { Router } from "@angular/router";
import { GeoPoint, Timestamp } from "firebase/firestore";
import { Spot } from "../../db/models/Spot";
import type { LocaleCode } from "../../db/models/Interfaces";
import type { SpotId, SpotSchema } from "../../db/schemas/SpotSchema";
import type { EntityPlaceNames } from "../../scripts/EntityPlaceNames";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
interface Snapshot {
  id: SpotId;
  schema: JsonValue;
  placeNames: EntityPlaceNames | null;
}

/** Only the public Spot already rendered by this request crosses hydration. */
@Injectable({ providedIn: "root" })
export class InitialSpotSnapshotService {
  private readonly state = inject(TransferState);
  private readonly platform = inject(PLATFORM_ID);
  private readonly router = inject(Router, { optional: true });
  private readonly restored = new Map<string, Spot>();

  capture(route: string, locale: LocaleCode, spot: Spot, schema: SpotSchema): void {
    if (!isPlatformServer(this.platform)) return;
    try {
      this.state.set(this.key(route, locale), {
        id: spot.id,
        schema: encode(schema),
        placeNames: spot.placeNames() ?? null,
      });
    } catch {
      // Unknown SDK objects must never serialize credentials or application state.
      // Keep the normal fetch path when a future schema needs another value type.
    }
  }

  read(route: string, locale: LocaleCode): Spot | null {
    if (!isPlatformBrowser(this.platform) || this.router?.navigated) return null;
    const key = this.key(route, locale);
    const existing = this.restored.get(key);
    if (existing) return existing;
    const snapshot = this.state.get<Snapshot | null>(key, null);
    this.state.remove(key);
    if (!snapshot) return null;
    try {
      const schema = JSON.parse(JSON.stringify(snapshot.schema), (_key, value: unknown) => {
        if (value && typeof value === "object" && "type" in value) {
          const typed = value as Record<string, unknown>;
          if (typed["type"] === "firestore/geopoint/1.0") {
            return new GeoPoint(Number(typed["latitude"]), Number(typed["longitude"]));
          }
          if (typed["type"] === "firestore/timestamp/1.0") {
            return new Timestamp(Number(typed["seconds"]), Number(typed["nanoseconds"]));
          }
        }
        return value;
      }) as SpotSchema;
      const spot = new Spot(snapshot.id, schema, locale);
      spot.placeNames.set(snapshot.placeNames ?? undefined);
      this.restored.set(key, spot);
      return spot;
    } catch {
      return null;
    }
  }

  private key(route: string, locale: LocaleCode) {
    return makeStateKey<Snapshot | null>(`initial-spot:v1:${locale}:${route}`);
  }
}

function encode(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof GeoPoint || value instanceof Timestamp) return encode(value.toJSON());
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, encode(item)]));
  }
  throw new Error("Unsupported public Spot snapshot value");
}
