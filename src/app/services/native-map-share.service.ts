import {Injectable, inject, signal} from "@angular/core";
import {App} from "@capacitor/app";
import {Router} from "@angular/router";
import {MatSnackBar} from "@angular/material/snack-bar";
import {Capacitor, registerPlugin, type PluginListenerHandle} from "@capacitor/core";
import {MapLinkResolverService, type MapLinkResolution} from "./map-link-resolver.service";

export interface SharedMapDraft {
  id: string;
  text: string;
  location?: {lat: number; lng: number};
  name?: string;
  spotId?: string;
  createdAt?: number;
}
export interface SharedMapSelection extends MapLinkResolution {
  spotId?: string;
  draftName?: string;
  create?: boolean;
}

const MapShare = registerPlugin<{
  pending(): Promise<{links: SharedMapDraft[]}>;
  acknowledge(input: {id: string}): Promise<void>;
  addListener(event: "mapShared", listener: (event: {text: string}) => void): Promise<PluginListenerHandle>;
}>("MapShare");

@Injectable({providedIn: "root"})
export class NativeMapShareService {
  private readonly resolver = inject(MapLinkResolverService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly selection = signal<SharedMapSelection | null>(null);
  readonly pending = this.selection.asReadonly();
  private initialized = false;
  private requestId = 0;
  private readonly draftState = signal<SharedMapDraft[]>([]);
  readonly drafts = this.draftState.asReadonly();
  private checkingPending = false;

  async initialize(): Promise<void> {
    if (this.initialized || !Capacitor.isNativePlatform()) return;
    this.initialized = true;
    try {
      if (Capacitor.getPlatform() === "android") {
        await MapShare.addListener("mapShared", ({text}) => void this.receive(text));
      } else if (Capacitor.getPlatform() === "ios") {
        await App.addListener("appStateChange", ({isActive}) => {
          if (isActive) void this.reviewPending();
        });
        await this.reviewPending();
      }
    } catch (error) {
      this.initialized = false;
      console.warn("Could not initialize Maps sharing", error);
    }
  }

  private async reviewPending(): Promise<void> {
    if (this.checkingPending || this.selection()) return;
    this.checkingPending = true;
    try {
      const {links} = await MapShare.pending();
      this.draftState.set(links);
    } catch {
      console.warn("Could not read pending Maps shares");
    } finally { this.checkingPending = false; }
  }

  async receive(text: string): Promise<boolean> {
    const requestId = ++this.requestId;
    this.selection.set(null);
    try {
      const result = await this.resolver.resolve(text);
      if (requestId !== this.requestId) return false;
      await this.router.navigate(["/map"]);
      if (requestId !== this.requestId) return false;
      this.selection.set(result);
      return true;
    } catch {
      if (requestId !== this.requestId) return false;
      this.snackbar.open(
        $localize`Couldn't open that Maps link. Try pasting a full Google Maps or Apple Maps link.`,
        $localize`Dismiss`, {duration: 6000},
      );
      return false;
    }
  }

  async reviewDraft(draft: SharedMapDraft, create = false): Promise<void> {
    // Reading a draft never deletes it. Cancellation or failed publication must
    // leave it available; removal is an explicit action in the draft list.
    if (!draft.location && !draft.spotId) {
      await this.receive(draft.text);
      return;
    }
    await this.router.navigate(["/map"]);
    this.selection.set({
      provider: draft.text.includes("maps.apple.com") ? "apple" : "google",
      format: "direct", location: draft.location,
      spotId: draft.spotId, draftName: draft.name, create,
    });
  }

  async removeDraft(id: string): Promise<void> {
    try {
      await MapShare.acknowledge({id});
      this.draftState.update(drafts => drafts.filter(draft => draft.id !== id));
    } catch {
      this.snackbar.open($localize`Could not remove the draft. Please try again.`, $localize`Dismiss`, {duration: 6000});
    }
  }

  consume(): void {
    this.selection.set(null);

  }
}
