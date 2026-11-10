// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  hasPrivateImageMetadata,
  stripImageMetadata,
} from "./image-metadata";

const XMP_WITH_LOCATION =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="47,22.614N" exif:GPSLongitude="8,32.502E"/>' +
  "</rdf:RDF></x:xmpmeta>";

/** EXIF a phone camera would write, including the shooting location. */
const PHONE_EXIF = {
  IFD0: { Make: "PhoneMaker", Model: "Phone 17", Software: "Camera 1.0" },
  IFD2: { DateTimeOriginal: "2026:11:10 12:00:00", BodySerialNumber: "SN-12345" },
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "47/1 22/1 3684/100",
    GPSLongitudeRef: "E",
    GPSLongitude: "8/1 32/1 3012/100",
  },
};

const ORIGINAL_STRINGS = ["PhoneMaker", "SN-12345", "GPSLatitude", "47,22.614N"];

async function photo(format: "jpeg" | "png" | "webp", orientation = 6): Promise<Uint8Array> {
  const image = sharp({
    create: { width: 24, height: 16, channels: 3, background: { r: 200, g: 40, b: 90 } },
  })
    .withExif(PHONE_EXIF)
    .withXmp(XMP_WITH_LOCATION)
    .withIccProfile("p3")
    .withMetadata({ orientation });
  return new Uint8Array(await image.toFormat(format).toBuffer());
}

function containsText(bytes: Uint8Array, text: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(text, "latin1"));
}

async function rawPixels(bytes: Uint8Array): Promise<Buffer> {
  // No auto-rotation: the stored pixels must be identical byte for byte.
  return sharp(bytes).raw().toBuffer();
}

describe("stripImageMetadata", () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    describe(format, () => {
      it("starts from a fixture that really carries GPS, camera and XMP data", async () => {
        const original = await photo(format);
        const metadata = await sharp(original).metadata();

        expect(metadata.exif).toBeDefined();
        expect(metadata.xmp).toBeDefined();
        // The GPS IFD pointer (tag 0x8825) is present in the EXIF block.
        expect(
          Buffer.from(metadata.exif!).includes(Buffer.from([0x88, 0x25])) ||
            Buffer.from(metadata.exif!).includes(Buffer.from([0x25, 0x88])),
        ).toBe(true);
        // PNG stores EXIF compressed, so look in the decoded metadata.
        const decoded = new Uint8Array(Buffer.concat([metadata.exif!, metadata.xmp!]));
        for (const text of ORIGINAL_STRINGS) {
          expect(containsText(decoded, text)).toBe(true);
        }
        expect(hasPrivateImageMetadata(original)).toBe(true);
      });

      it("removes the location and all other private metadata", async () => {
        const stripped = stripImageMetadata(await photo(format));

        expect(stripped).not.toBeNull();
        expect(hasPrivateImageMetadata(stripped!)).toBe(false);
        const metadata = await sharp(stripped!).metadata();
        expect(metadata.xmp).toBeUndefined();
        expect(metadata.iptc).toBeUndefined();
        const decodedExif = metadata.exif ? new Uint8Array(metadata.exif) : new Uint8Array();
        for (const text of ORIGINAL_STRINGS) {
          expect(containsText(stripped!, text)).toBe(false);
          expect(containsText(decodedExif, text)).toBe(false);
        }
      });

      it("keeps the pixels and colour profile unchanged", async () => {
        const original = await photo(format);
        const stripped = stripImageMetadata(original)!;

        expect((await rawPixels(stripped)).equals(await rawPixels(original))).toBe(true);
        expect((await sharp(stripped).metadata()).icc).toBeDefined();
      });

      it("is idempotent", async () => {
        const once = stripImageMetadata(await photo(format))!;
        expect(stripImageMetadata(once)).toEqual(once);
      });
    });
  }

  it("keeps the JPEG orientation as the only EXIF value", async () => {
    const stripped = stripImageMetadata(await photo("jpeg", 6))!;
    const metadata = await sharp(stripped).metadata();

    expect(metadata.orientation).toBe(6);
    expect(metadata.exif).toBeDefined();
    expect(containsText(metadata.exif!, "PhoneMaker")).toBe(false);
  });

  it("writes no EXIF at all for an upright JPEG", async () => {
    const stripped = stripImageMetadata(await photo("jpeg", 1))!;
    expect((await sharp(stripped).metadata()).exif).toBeUndefined();
  });

  it("drops data appended after a JPEG, such as multi-picture images with their own EXIF", async () => {
    const original = await photo("jpeg");
    const trailer = await photo("jpeg");
    const withTrailer = new Uint8Array([...original, ...trailer]);

    expect(hasPrivateImageMetadata(withTrailer)).toBe(true);
    const stripped = stripImageMetadata(withTrailer)!;
    expect(stripped.length).toBeLessThan(original.length);
    expect(hasPrivateImageMetadata(stripped)).toBe(false);
  });

  it("removes comments and XMP from a GIF but keeps animation looping", async () => {
    const gif = new Uint8Array(
      await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#123456" },
      })
        .gif({ loop: 0 })
        .toBuffer(),
    );
    const trailerIndex = gif.lastIndexOf(0x3b);
    const comment = [0x21, 0xfe, 9, ...Buffer.from("SN-12345 "), 0];
    const xmpId = Buffer.from("XMP DataXMP");
    const xmpBody = Buffer.from("47,22.614N");
    const xmp = [0x21, 0xff, 11, ...xmpId, xmpBody.length, ...xmpBody, 0];
    const withMetadata = new Uint8Array([
      ...gif.subarray(0, trailerIndex),
      ...comment,
      ...xmp,
      0x3b,
    ]);

    expect(hasPrivateImageMetadata(withMetadata)).toBe(true);
    const stripped = stripImageMetadata(withMetadata)!;
    expect(hasPrivateImageMetadata(stripped)).toBe(false);
    expect(containsText(stripped, "SN-12345")).toBe(false);
    expect(containsText(stripped, "47,22.614N")).toBe(false);
    expect((await sharp(stripped).metadata()).loop).toBe(0);
  });

  it("refuses unsupported or malformed images instead of passing them through", async () => {
    const jpeg = await photo("jpeg");

    expect(stripImageMetadata(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(stripImageMetadata(jpeg.subarray(0, jpeg.length - 40))).toBeNull();
    expect(hasPrivateImageMetadata(new Uint8Array([1, 2, 3, 4]))).toBe(true);
  });

  it("detects the format from the bytes, not the declared type", async () => {
    const png = await photo("png");
    // A PNG uploaded as image/jpeg is still parsed and stripped as a PNG.
    const stripped = stripImageMetadata(png)!;
    expect((await sharp(stripped).metadata()).format).toBe("png");
    expect(hasPrivateImageMetadata(stripped)).toBe(false);
  });
});
