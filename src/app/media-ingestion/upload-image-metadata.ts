import { stripImageMetadata } from "../../db/utils/image-metadata";

/**
 * Remove location and other private metadata from an image before it leaves
 * the device. Pixels are untouched (see `stripImageMetadata`).
 *
 * Formats the stripper cannot parse (for example HEIC) are returned unchanged:
 * the media publication function strips or re-encodes every image before it
 * becomes public, and refuses to publish one it cannot clean.
 */
export async function removeImageMetadataBeforeUpload(
  blob: Blob,
  contentType: string,
): Promise<Blob> {
  if (!contentType.startsWith("image/")) return blob;
  const bytes = new Uint8Array(await readBlob(blob));
  const stripped = stripImageMetadata(bytes);
  if (!stripped) return blob;
  return new Blob([stripped as Uint8Array<ArrayBuffer>], { type: blob.type || contentType });
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  // Older WebViews (and jsdom) lack Blob.arrayBuffer().
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
