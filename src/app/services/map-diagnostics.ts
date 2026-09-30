import type { MapProfilePayload } from './map-performance-profiler.service';

/** Read layout and camera state without touching Google's WebGL context. */
export function mapDiagnosticsSnapshot(map: google.maps.Map): MapProfilePayload {
  const div = map.getDiv();
  const rect = div.getBoundingClientRect();
  const bounds = map.getBounds()?.toJSON();
  const viewport = window.visualViewport;
  return {
    camera: {
      zoom: map.getZoom(),
      heading: map.getHeading(),
      tilt: map.getTilt(),
      center: map.getCenter()?.toJSON(),
      bounds,
    },
    renderingType: map.getRenderingType?.(),
    mapType: map.getMapTypeId(),
    online: navigator.onLine,
    visibility: document.visibilityState,
    viewport: { width: window.innerWidth, height: window.innerHeight,
      scale: viewport?.scale, visualWidth: viewport?.width, visualHeight: viewport?.height,
      devicePixelRatio: window.devicePixelRatio },
    container: { width: rect.width, height: rect.height, x: rect.x, y: rect.y },
    canvases: Array.from(div.querySelectorAll('canvas')).slice(0, 8).map(canvas => {
      const box = canvas.getBoundingClientRect();
      return { width: canvas.width, height: canvas.height,
        cssWidth: box.width, cssHeight: box.height, x: box.x, y: box.y };
    }),
    markerCount: div.querySelectorAll('gmp-advanced-marker').length,
  };
}

/** Passive boundary events only: never intercept or change map gesture ownership. */
export function observeMapGestures(
  div: HTMLElement,
  record: (type: string, payload: MapProfilePayload) => void,
): () => void {
  const listener = (event: TouchEvent) => record(event.type, {
    touches: event.touches.length,
    changedTouches: event.changedTouches.length,
    cancelable: event.cancelable,
    defaultPrevented: event.defaultPrevented,
  });
  const types = ['touchstart', 'touchend', 'touchcancel'] as const;
  types.forEach(type => div.addEventListener(type, listener, { passive: true, capture: true }));
  return () => types.forEach(type => div.removeEventListener(type, listener, true));
}
