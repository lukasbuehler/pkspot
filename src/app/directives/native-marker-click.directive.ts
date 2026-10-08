import { DestroyRef, Directive, inject, output } from "@angular/core";
import { MapAdvancedMarker } from "@angular/google-maps";

/** Angular Maps currently routes gmpClick through addListener. Bridge the native
 * event until its wrapper supports addEventListener for this output. */
@Directive({ selector: "map-advanced-marker[appNativeMarkerClick]" })
export class NativeMarkerClickDirective {
  readonly appNativeMarkerClick = output<Event>();

  constructor() {
    const marker = inject(MapAdvancedMarker);
    const destroyRef = inject(DestroyRef);
    let current: google.maps.marker.AdvancedMarkerElement | undefined;
    const click = (event: Event) => this.appNativeMarkerClick.emit(event);
    const attach = (target: google.maps.marker.AdvancedMarkerElement) => {
      current?.removeEventListener("gmp-click", click);
      current = target;
      current.addEventListener("gmp-click", click);
    };
    if (marker.advancedMarker) attach(marker.advancedMarker);
    const subscription = marker.markerInitialized.subscribe(attach);
    destroyRef.onDestroy(() => {
      subscription.unsubscribe();
      current?.removeEventListener("gmp-click", click);
    });
  }
}
