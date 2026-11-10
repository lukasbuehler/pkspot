// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { removePrivateImageMetadata } from "../functions/src/publishedImageMetadata";
import { hasPrivateImageMetadata } from "./db/utils/image-metadata";

const GPS_EXIF = {
  IFD0: { Make: "PhoneMaker" },
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "47/1 22/1 3684/100",
    GPSLongitudeRef: "E",
    GPSLongitude: "8/1 32/1 3012/100",
  },
};

async function jpegWithLocation(): Promise<Buffer> {
  return sharp({
    create: { width: 12, height: 8, channels: 3, background: "#4060a0" },
  })
    .withExif(GPS_EXIF)
    .withMetadata({ orientation: 3 })
    .jpeg()
    .toBuffer();
}

/** Mirrors the re-encoder the moderation function passes in. */
const sharpReencoder = (bytes: Buffer) =>
  sharp(bytes, { animated: true }).rotate().keepIccProfile().toBuffer();

describe("removePrivateImageMetadata (media publication)", () => {
  it("publishes an uploaded photo without its location, losslessly", async () => {
    const original = await jpegWithLocation();
    const reencode = vi.fn(sharpReencoder);

    const published = await removePrivateImageMetadata(original, reencode);

    expect(hasPrivateImageMetadata(original)).toBe(true);
    expect(hasPrivateImageMetadata(published)).toBe(false);
    expect((await sharp(published).metadata()).orientation).toBe(3);
    expect(reencode).not.toHaveBeenCalled();
  });

  it("re-encodes when lossless stripping cannot parse the file", async () => {
    const original = await jpegWithLocation();
    // Corrupt one segment length so the lossless parser rejects the file.
    const unparsable = Buffer.from(original);
    unparsable[4] = 0x00;
    unparsable[5] = 0x01;
    const reencode = vi.fn(async () => sharpReencoder(await jpegWithLocation()));

    const published = await removePrivateImageMetadata(unparsable, reencode);

    expect(reencode).toHaveBeenCalledOnce();
    expect(hasPrivateImageMetadata(published)).toBe(false);
  });

  it("refuses to publish when no metadata-free version can be produced", async () => {
    const reencode = vi.fn(async () => Buffer.from("not an image"));

    await expect(
      removePrivateImageMetadata(Buffer.from("also not an image"), reencode)
    ).rejects.toThrow(/refusing to publish/);
  });
});

describe("media publication wiring", () => {
  it("never saves raw intake bytes to a public destination", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("functions/src/mediaModerationFunctions.ts", "utf8");

    const saves = source.match(/approvedFile\.save\(([^,]+),/g) ?? [];
    expect(saves.length).toBeGreaterThan(0);
    for (const save of saves) {
      expect(save).toContain("publishableBytes(");
    }
  });
});
