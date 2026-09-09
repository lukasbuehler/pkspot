import type { SpotMediaCoordinate } from "./spot-media-geo";

export const MAX_SPOT_PHOTO_BYTES = 50 * 1024 * 1024;
const MAX_PREVIEW_EDGE = 2560;

export type PreparedSpotPhoto =
  | { ready: true; blob: Blob; coordinate?: SpotMediaCoordinate }
  | { ready: false; reason: "unsupported-type" | "too-large" | "decoder-unavailable" | "decode-failed" };

/** Read only metadata actually shared with us. Malformed EXIF is not fatal. */
export async function readSpotPhotoCoordinate(file: Blob): Promise<SpotMediaCoordinate | undefined> {
  if (file.size > MAX_SPOT_PHOTO_BYTES) return undefined;
  try {
    return await readJpegGpsUnchecked(file);
  } catch {
    return undefined;
  }
}

/**
 * Photos-only preparation foundation; not yet connected to gallery entry points.
 * Re-encoding drops original EXIF. Failure never returns an uploadable original.
 * Native HEIC decoding and capture-time extraction are separate release work.
 */
export async function prepareSpotPhoto(file: Blob): Promise<PreparedSpotPhoto> {
  if (!file.type.startsWith("image/")) return { ready: false, reason: "unsupported-type" };
  if (file.size > MAX_SPOT_PHOTO_BYTES) return { ready: false, reason: "too-large" };
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return { ready: false, reason: "decoder-unavailable" };
  }
  const coordinate = await readSpotPhotoCoordinate(file);
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (bitmap.width <= 0 || bitmap.height <= 0) throw new Error("empty-image");
    const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas-unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob || blob.type !== "image/jpeg") throw new Error("image-encode-failed");
    return { ready: true, blob, ...(coordinate ? { coordinate } : {}) };
  } catch {
    return { ready: false, reason: "decode-failed" };
  } finally {
    bitmap?.close();
  }
}

async function readJpegGpsUnchecked(file: Blob): Promise<SpotMediaCoordinate | undefined> {
  if (!file.type.includes("jpeg") && !file.type.includes("jpg")) return undefined;
  const bytes = new DataView(await file.arrayBuffer());
  if (bytes.byteLength < 4 || bytes.getUint16(0) !== 0xffd8) return undefined;
  let offset = 2;
  while (offset + 4 < bytes.byteLength) {
    if (bytes.getUint8(offset) !== 0xff || bytes.getUint8(offset + 1) === 0xda) break;
    const marker = bytes.getUint8(offset + 1);
    const length = bytes.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.byteLength) return undefined;
    if (marker === 0xe1 && length >= 8 && bytes.getUint32(offset + 4) === 0x45786966) {
      return readExifGps(bytes, offset + 10, length - 8);
    }
    offset += 2 + length;
  }
  return undefined;
}

function readExifGps(
  view: DataView,
  start: number,
  length: number,
): SpotMediaCoordinate | undefined {
  if (start + 8 > view.byteLength || length < 8) return undefined;
  if (length > view.byteLength - start) return undefined;
  // Limit every TIFF pointer to this EXIF segment, not the rest of the JPEG.
  view = new DataView(view.buffer, view.byteOffset + start, length);
  start = 0;
  const byteOrder = view.getUint16(0);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return undefined;
  const little = byteOrder === 0x4949;
  const read16 = (offset: number) => view.getUint16(offset, little);
  const read32 = (offset: number) => view.getUint32(offset, little);
  const tiff = start;
  if (read16(tiff + 2) !== 42) return undefined;
  const ifdOffset = tiff + read32(tiff + 4);
  if (ifdOffset + 2 > view.byteLength) return undefined;
  const entries = read16(ifdOffset);
  let gpsOffset: number | undefined;
  for (let index = 0; index < entries; index++) {
    const entry = ifdOffset + 2 + index * 12;
    if (entry + 12 > view.byteLength) return undefined;
    if (read16(entry) === 0x8825) gpsOffset = tiff + read32(entry + 8);
  }
  if (gpsOffset === undefined || gpsOffset + 2 > view.byteLength) return undefined;
  const gpsEntries = read16(gpsOffset);
  let latitude: number[] | undefined;
  let longitude: number[] | undefined;
  let latitudeRef: string | undefined;
  let longitudeRef: string | undefined;
  for (let index = 0; index < gpsEntries; index++) {
    const entry = gpsOffset + 2 + index * 12;
    const tag = read16(entry);
    const type = read16(entry + 2);
    const count = read32(entry + 4);
    const value = tiff + read32(entry + 8);
    if (tag === 1) latitudeRef = String.fromCharCode(view.getUint8(entry + 8));
    if (tag === 3) longitudeRef = String.fromCharCode(view.getUint8(entry + 8));
    if ((tag === 2 || tag === 4) && type === 5 && count >= 3) {
      const values = [0, 1, 2].map((part) => {
        const numerator = read32(value + part * 8);
        const denominator = read32(value + part * 8 + 4);
        return denominator === 0 ? Number.NaN : numerator / denominator;
      });
      if (tag === 2) latitude = values;
      else longitude = values;
    }
  }
  if (!latitude || !longitude || !["N", "S"].includes(latitudeRef ?? "") ||
      !["E", "W"].includes(longitudeRef ?? "")) return undefined;
  if ([latitude, longitude].some((parts) => parts[1] >= 60 || parts[2] >= 60)) return undefined;
  const toDecimal = (parts: number[], ref: string) => {
    const value = parts[0] + parts[1] / 60 + parts[2] / 3600;
    return ref === "S" || ref === "W" ? -value : value;
  };
  const coordinate = { lat: toDecimal(latitude, latitudeRef!), lng: toDecimal(longitude, longitudeRef!) };
  return Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lng) &&
    Math.abs(coordinate.lat) <= 90 && Math.abs(coordinate.lng) <= 180
    ? coordinate
    : undefined;
}
