import { Blob as NodeBlob } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareSpotPhoto, readSpotPhotoCoordinate } from "./spot-photo-preparation";

// The DOM test environment omits Blob.arrayBuffer; use Node's implementation.
function testBlob(parts: Array<string | Uint8Array<ArrayBuffer>>, options: BlobPropertyBag): Blob {
  const blob = new Blob(parts, options);
  const binary = new NodeBlob(parts, options);
  Object.defineProperty(blob, "arrayBuffer", { value: () => binary.arrayBuffer() });
  return blob;
}

/** A small real EXIF GPS segment: 47 N, 8 E, little-endian TIFF. */
function gpsPhoto(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(148);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0xffd8);
  view.setUint16(2, 0xffe1);
  view.setUint16(4, 144);
  bytes.set([69, 120, 105, 102, 0, 0], 6);
  const tiff = 12;
  const short = (offset: number, value: number) => view.setUint16(tiff + offset, value, true);
  const long = (offset: number, value: number) => view.setUint32(tiff + offset, value, true);
  short(0, 0x4949); short(2, 42); long(4, 8);
  short(8, 1); short(10, 0x8825); short(12, 4); long(14, 1); long(18, 26);
  short(26, 4);
  short(28, 1); short(30, 2); long(32, 2); bytes[tiff + 36] = 78;
  short(40, 2); short(42, 5); long(44, 3); long(48, 80);
  short(52, 3); short(54, 2); long(56, 2); bytes[tiff + 60] = 69;
  short(64, 4); short(66, 5); long(68, 3); long(72, 104);
  for (const offset of [80, 88, 96, 104, 112, 120]) long(offset + 4, 1);
  long(80, 47); long(104, 8);
  return bytes;
}

describe("photo preparation", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("reads shared JPEG GPS locally", async () => {
    expect(await readSpotPhotoCoordinate(testBlob([gpsPhoto()], { type: "image/jpeg" })))
      .toEqual({ lat: 47, lng: 8 });
  });

  it("ignores truncated, malformed, and invalid GPS metadata", async () => {
    const malformed = gpsPhoto();
    new DataView(malformed.buffer).setUint32(12 + 48, 0xffffffff, true);
    const invalid = gpsPhoto();
    new DataView(invalid.buffer).setUint32(12 + 80, 120, true);
    for (const bytes of [gpsPhoto().slice(0, 50), malformed, invalid]) {
      expect(await readSpotPhotoCoordinate(testBlob([bytes], { type: "image/jpeg" })))
        .toBeUndefined();
    }
  });

  it("rejects videos before decoding", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    expect(await prepareSpotPhoto(testBlob(["clip"], { type: "video/mp4" })))
      .toEqual({ ready: false, reason: "unsupported-type" });
    expect(decode).not.toHaveBeenCalled();
  });

  it("does not return original image bytes when decoding fails", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode")));
    expect(await prepareSpotPhoto(testBlob(["photo"], { type: "image/heic" })))
      .toEqual({ ready: false, reason: "decode-failed" });
  });

  it("re-encodes pixels and closes the bitmap, returning only the new JPEG", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const sanitized = testBlob(["sanitized pixels"], { type: "image/jpeg" });
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }),
      toBlob: (callback: BlobCallback) => callback(sanitized) };
    vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLCanvasElement);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4000, height: 2000, close }));
    const original = testBlob([gpsPhoto()], { type: "image/jpeg" });
    const result = await prepareSpotPhoto(original);
    expect(result).toEqual({ ready: true, blob: sanitized, coordinate: { lat: 47, lng: 8 } });
    expect(canvas.width).toBe(2560);
    expect(canvas.height).toBe(1280);
    expect(close).toHaveBeenCalledOnce();
  });
});
