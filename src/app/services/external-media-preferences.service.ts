import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, inject, signal } from "@angular/core";

export interface ExternalMediaPreference {
  allowAll: boolean;
  allowedDomains: string[];
  temporaryAllowedDomains?: Record<string, number>;
}
const EXTERNAL_KEY = "pkspot.showExternalMedia.v1";
const YOUTUBE_KEY = "pkspot.youtubeEmbeds.v1";

@Injectable({ providedIn: "root" })
export class ExternalMediaPreferencesService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly externalState = signal(this.readExternal());
  private readonly youtubeState = signal(this.read(YOUTUBE_KEY) === "true");
  private readonly revocationState = signal(0);
  readonly external = this.externalState.asReadonly();
  readonly youtubeAllowed = this.youtubeState.asReadonly();
  readonly revocationVersion = this.revocationState.asReadonly();

  setExternal(preference: ExternalMediaPreference): void {
    const normalized = { ...preference, temporaryAllowedDomains: preference.temporaryAllowedDomains ?? {} };
    this.externalState.set(normalized);
    this.write(EXTERNAL_KEY, JSON.stringify(normalized));
  }
  setYoutubeAllowed(allowed: boolean): void {
    this.youtubeState.set(allowed);
    this.write(YOUTUBE_KEY, String(allowed));
    if (!allowed) this.revocationState.update((version) => version + 1);
  }
  setOtherAllowed(allowed: boolean): void {
    this.setExternal({ allowAll: allowed, allowedDomains: [] });
  }
  reset(): void {
    this.setYoutubeAllowed(false);
    this.setOtherAllowed(false);
  }
  private read(key: string): string | null {
    if (!this.isBrowser) return null;
    try { return localStorage.getItem(key); } catch { return null; }
  }
  private write(key: string, value: string): void {
    if (!this.isBrowser) return;
    // Private browsing can disable storage. The session choice still works.
    try { localStorage.setItem(key, value); } catch { /* Retain the in-memory choice. */ }
  }
  private readExternal(): ExternalMediaPreference {
    const fallback = { allowAll: false, allowedDomains: [] };
    const raw = this.read(EXTERNAL_KEY);
    if (raw === "true") return { ...fallback, allowAll: true };
    try {
      const parsed: unknown = JSON.parse(raw ?? "null");
      if (!parsed || typeof parsed !== "object") return fallback;
      const data = parsed as Record<string, unknown>;
      const temporary = data["temporaryAllowedDomains"];
      return {
        allowAll: data["allowAll"] === true,
        allowedDomains: Array.isArray(data["allowedDomains"])
          ? data["allowedDomains"].filter((domain): domain is string => typeof domain === "string" && domain.length > 0) : [],
        temporaryAllowedDomains: temporary && typeof temporary === "object"
          ? Object.fromEntries(Object.entries(temporary).filter(([, expiry]) => typeof expiry === "number" && expiry > Date.now())) : {},
      };
    } catch { return fallback; }
  }
}
