export interface StreetViewPanorama {
  pano_id: string;
  location: { lat: number; lng: number };
}

/** Frame about 30 m (a 20 m Spot plus context), without extreme distortion
 * nearby or excessive zoom on distant, potentially imprecise coordinates. */
export function streetViewCamera(
  panorama: StreetViewPanorama,
  target: { lat: number; lng: number },
): { fov: number; heading?: number; pitch: number } {
  const rad = Math.PI / 180;
  const a = panorama.location.lat * rad, b = target.lat * rad;
  const dlng = (target.lng - panorama.location.lng) * rad;
  const hav = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(dlng / 2) ** 2;
  const distance = 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, hav))));
  const fov = Math.max(40, Math.min(110, 2 * Math.atan2(15, distance) / rad));
  // At effectively the same location there is no useful target bearing.
  const heading = distance < 1 ? undefined : (Math.atan2(
    Math.sin(dlng) * Math.cos(b),
    Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(dlng),
  ) / rad + 360) % 360;
  return { fov, heading, pitch: 0 };
}

export function readStreetViewPanorama(value: unknown): StreetViewPanorama | undefined {
  const data = value as Partial<StreetViewPanorama> | null;
  const location = data?.location;
  if (typeof data?.pano_id !== 'string' || !data.pano_id ||
    typeof location?.lat !== 'number' || !Number.isFinite(location.lat) || Math.abs(location.lat) > 90 ||
    typeof location.lng !== 'number' || !Number.isFinite(location.lng) || Math.abs(location.lng) > 180) return undefined;
  return { pano_id: data.pano_id, location: { lat: location.lat, lng: location.lng } };
}
