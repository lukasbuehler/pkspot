import {
  hasPrivateImageMetadata,
  stripImageMetadata,
} from "../../src/db/utils/image-metadata";

/** Re-encodes an image without any metadata (used when lossless stripping fails). */
export type MetadataFreeReencoder = (bytes: Buffer) => Promise<Buffer>;

/**
 * Return the bytes to publish for an uploaded image: never the original if it
 * carries location or other private metadata.
 *
 * Lossless stripping runs first so photos keep their exact quality. If the
 * format cannot be parsed, the image is re-encoded instead. The result is
 * checked again, and publishing fails rather than releasing a file that still
 * contains private metadata.
 */
export async function removePrivateImageMetadata(
  bytes: Buffer,
  reencode: MetadataFreeReencoder
): Promise<Buffer> {
  const stripped = stripImageMetadata(bytes);
  if (stripped && !hasPrivateImageMetadata(stripped)) {
    return Buffer.from(stripped.buffer, stripped.byteOffset, stripped.byteLength);
  }

  const reencoded = await reencode(bytes);
  const reencodedStripped = stripImageMetadata(reencoded);
  if (reencodedStripped && !hasPrivateImageMetadata(reencodedStripped)) {
    return Buffer.from(
      reencodedStripped.buffer,
      reencodedStripped.byteOffset,
      reencodedStripped.byteLength
    );
  }
  throw new Error("Image metadata could not be removed; refusing to publish it.");
}
