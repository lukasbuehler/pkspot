import { describe, expect, it } from 'vitest';
import { readStreetViewPanorama, streetViewCamera } from './StreetViewHelpers';

const panorama = { pano_id: 'pano', location: { lat: 0, lng: 0 } };
const north = (metres: number) => ({ lat: metres / 6371000 * 180 / Math.PI, lng: 0 });
describe('Street View camera framing', () => {
  it.each([[0, 110], [10, 110], [15, 90], [20, 73.74], [30, 53.13], [40, 41.11], [100, 40]])('frames a Spot %s m away at %s degrees', (distance, expected) => {
    const camera = streetViewCamera(panorama, north(distance));
    expect(camera.fov).toBeCloseTo(expected, 1);
    expect(camera.pitch).toBe(0);
  });
  it('aims from the panorama toward the Spot and avoids undefined coincident bearings', () => {
    expect(streetViewCamera(panorama, north(20)).heading).toBeCloseTo(0);
    expect(streetViewCamera(panorama, { lat: 0, lng: 0.001 }).heading).toBeCloseTo(90);
    expect(streetViewCamera(panorama, { lat: 0, lng: -0.001 }).heading).toBeCloseTo(270);
    expect(streetViewCamera(panorama, panorama.location).heading).toBeUndefined();
  });
  it('only accepts metadata with a usable panorama ID and coordinates', () => {
    expect(readStreetViewPanorama(panorama)).toEqual(panorama);
    for (const data of [null, {}, { location: panorama.location }, { ...panorama, location: {lat: NaN, lng: 0} }, { ...panorama, location: {lat: 0, lng: 181} }]) {
      expect(readStreetViewPanorama(data)).toBeUndefined();
    }
  });
});
