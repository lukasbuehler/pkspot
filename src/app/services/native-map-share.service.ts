import {Injectable, inject, signal} from "@angular/core";
import {App} from "@capacitor/app";
import {Router} from "@angular/router";
import {MatSnackBar} from "@angular/material/snack-bar";
import {Capacitor, registerPlugin, type PluginListenerHandle} from "@capacitor/core";
import {MapLinkResolverService, type MapLinkResolution} from "./map-link-resolver.service";

const MapShare = registerPlugin<{
  pending(): Promise<{links: {id: string; text: string}[]}>;
  acknowledge(input: {id: string}): Promise<void>;
  addListener(event: "mapShared", listener: (event: {text: string}) => void): Promise<PluginListenerHandle>;
}>("MapShare");

@Injectable({providedIn: "root"})
export class NativeMapShareService {
  private readonly resolver = inject(MapLinkResolverService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly selection = signal<MapLinkResolution | null>(null);
  readonly pending = this.selection.asReadonly();
  private initialized = false;
  private requestId = 0;
  private pendingNativeId: string | null = null;
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
      const link = links[0];
      if (!link) return;
      this.pendingNativeId = link.id;
      if (!(await this.receive(link.text))) this.pendingNativeId = null;
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

  consume(): void {
    this.selection.set(null);
    const id = this.pendingNativeId;
    this.pendingNativeId = null;
    if (id) void MapShare.acknowledge({id}).catch(() => console.warn("Could not acknowledge Maps share"));
  }
}
