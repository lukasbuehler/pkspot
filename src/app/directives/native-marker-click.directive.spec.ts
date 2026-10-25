import { EventEmitter } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MapAdvancedMarker } from "@angular/google-maps";
import { NativeMarkerClickDirective } from "./native-marker-click.directive";

it("forwards native clicks and releases listeners on replacement and destruction", () => {
  const first = new EventTarget();
  const second = new EventTarget();
  const markerInitialized = new EventEmitter<google.maps.marker.AdvancedMarkerElement>();
  TestBed.configureTestingModule({ providers: [{ provide: MapAdvancedMarker, useValue: { advancedMarker: first, markerInitialized } }] });
  const directive = TestBed.runInInjectionContext(() => new NativeMarkerClickDirective());
  const listener = vi.fn();
  directive.appNativeMarkerClick.subscribe(listener);
  first.dispatchEvent(new Event("gmp-click"));
  expect(listener).toHaveBeenCalledTimes(1);
  markerInitialized.emit(second as google.maps.marker.AdvancedMarkerElement);
  first.dispatchEvent(new Event("gmp-click"));
  second.dispatchEvent(new Event("gmp-click"));
  expect(listener).toHaveBeenCalledTimes(2);
  TestBed.resetTestingModule();
  second.dispatchEvent(new Event("gmp-click"));
  expect(listener).toHaveBeenCalledTimes(2);
});
