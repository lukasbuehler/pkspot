/**
 * Lossless removal of private image metadata, shared by the app (before upload)
 * and Cloud Functions (before publishing). Photo locations must never reach a
 * public file, so this drops every metadata block that can carry GPS, camera or
 * editing details: EXIF, XMP, IPTC, comments, text chunks and data appended
 * after the image. Pixels are copied byte for byte, so quality is unchanged.
 *
 * Only what is needed to render the image correctly is kept: the ICC colour
 * profile, Adobe colour-transform markers, and the JPEG orientation, which is
 * rewritten as a minimal EXIF block containing nothing else.
 *
 * Works on plain `Uint8Array`s with no DOM or Node APIs. Returns `null` for
 * unsupported or malformed input; callers must then refuse or re-encode the
 * image rather than pass the original through.
 */

export type StrippableImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const JPEG_ORIENTATION_TAG = 0x0112;

export function stripImageMetadata(bytes: Uint8Array): Uint8Array | null {
  try {
    switch (detectImageType(bytes)) {
      case "image/jpeg":
        return stripJpeg(bytes);
      case "image/png":
        return stripPng(bytes);
      case "image/webp":
        return stripWebp(bytes);
      case "image/gif":
        return stripGif(bytes);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * True when the image still contains metadata beyond what `stripImageMetadata`
 * keeps. Unsupported or malformed input counts as private, so a check never
 * passes by failing to parse.
 */
export function hasPrivateImageMetadata(bytes: Uint8Array): boolean {
  try {
    switch (detectImageType(bytes)) {
      case "image/jpeg":
        return jpegHasPrivateMetadata(bytes);
      case "image/png":
        return pngHasPrivateMetadata(bytes);
      case "image/webp":
        return webpHasPrivateMetadata(bytes);
      case "image/gif":
        return gifHasPrivateMetadata(bytes);
      default:
        return true;
    }
  } catch {
    return true;
  }
}

/**
 * Detect the format from the file signature, never from the declared type, so
 * a mislabelled upload cannot skip stripping. Bytes matching no signature are
 * unsupported.
 */
function detectImageType(bytes: Uint8Array): StrippableImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (startsWithAscii(bytes, 0, "\x89PNG\r\n\x1a\n")) return "image/png";
  if (startsWithAscii(bytes, 0, "RIFF") && startsWithAscii(bytes, 8, "WEBP")) {
    return "image/webp";
  }
  if (startsWithAscii(bytes, 0, "GIF87a") || startsWithAscii(bytes, 0, "GIF89a")) {
    return "image/gif";
  }
  return null;
}

// ---------------------------------------------------------------------------
// JPEG

interface JpegSegment {
  marker: number;
  start: number;
  end: number;
}

/** Walk JPEG segments up to EOI. Throws on malformed structure. */
function readJpegSegments(bytes: Uint8Array): { segments: JpegSegment[]; eoiEnd: number } {
  const segments: JpegSegment[] = [];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error("Expected JPEG marker");
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd9) {
      return { segments, eoiEnd: i + 2 };
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      segments.push({ marker, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (i + 4 > bytes.length) throw new Error("Truncated JPEG segment");
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) throw new Error("Invalid JPEG segment length");
    let end = i + 2 + length;
    if (end > bytes.length) throw new Error("Truncated JPEG segment");
    if (marker === 0xda) {
      // Start of scan: entropy-coded data runs until the next real marker.
      while (end < bytes.length) {
        if (bytes[end] !== 0xff) {
          end += 1;
          continue;
        }
        const next = bytes[end + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          end += 2;
          continue;
        }
        if (next === 0xff) {
          end += 1;
          continue;
        }
        break;
      }
    }
    segments.push({ marker, start: i, end });
    i = end;
  }
  throw new Error("JPEG has no end-of-image marker");
}

function jpegPayloadStartsWith(bytes: Uint8Array, segment: JpegSegment, text: string): boolean {
  return startsWithAscii(bytes, segment.start + 4, text);
}

function isKeptJpegSegment(bytes: Uint8Array, segment: JpegSegment): boolean {
  const { marker } = segment;
  if (marker === 0xe0) return true; // APP0 JFIF/JFXX
  if (marker === 0xe2) return jpegPayloadStartsWith(bytes, segment, "ICC_PROFILE\0");
  if (marker === 0xee) return true; // APP14 Adobe colour transform
  if (marker >= 0xe1 && marker <= 0xef) return false; // EXIF, XMP, MPF, IPTC, …
  if (marker === 0xfe) return false; // comment
  return true;
}

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const { segments } = readJpegSegments(bytes);
  let orientation: number | null = null;
  const kept: JpegSegment[] = [];
  for (const segment of segments) {
    if (segment.marker === 0xe1 && jpegPayloadStartsWith(bytes, segment, "Exif\0\0")) {
      orientation ??= readExifOrientation(bytes.subarray(segment.start + 10, segment.end));
    }
    if (isKeptJpegSegment(bytes, segment)) kept.push(segment);
  }

  const parts: Uint8Array[] = [Uint8Array.of(0xff, 0xd8)];
  let insertedExif = false;
  const orientationExif =
    orientation && orientation !== 1 ? makeOrientationExif(orientation) : null;
  for (const [index, segment] of kept.entries()) {
    // EXIF belongs after APP0 when present, otherwise directly after SOI.
    if (orientationExif && !insertedExif && !(index === 0 && segment.marker === 0xe0)) {
      parts.push(orientationExif);
      insertedExif = true;
    }
    parts.push(bytes.subarray(segment.start, segment.end));
  }
  if (orientationExif && !insertedExif) parts.push(orientationExif);
  parts.push(Uint8Array.of(0xff, 0xd9)); // data after EOI (MPF images, trailers) is dropped
  return concat(parts);
}

function jpegHasPrivateMetadata(bytes: Uint8Array): boolean {
  const { segments, eoiEnd } = readJpegSegments(bytes);
  if (eoiEnd < bytes.length) return true;
  return segments.some((segment) => {
    if (segment.marker === 0xe1 && jpegPayloadStartsWith(bytes, segment, "Exif\0\0")) {
      return !isOrientationOnlyExif(bytes.subarray(segment.start + 10, segment.end));
    }
    return !isKeptJpegSegment(bytes, segment);
  });
}

interface TiffReader {
  u16(offset: number): number;
  u32(offset: number): number;
  length: number;
}

function tiffReader(tiff: Uint8Array): TiffReader | null {
  if (tiff.length < 8) return null;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!little && !big) return null;
  const check = (offset: number, size: number) => {
    if (offset < 0 || offset + size > tiff.length) throw new Error("EXIF out of range");
  };
  return {
    length: tiff.length,
    u16(offset) {
      check(offset, 2);
      return little
        ? tiff[offset] | (tiff[offset + 1] << 8)
        : (tiff[offset] << 8) | tiff[offset + 1];
    },
    u32(offset) {
      check(offset, 4);
      return little
        ? (tiff[offset] | (tiff[offset + 1] << 8) | (tiff[offset + 2] << 16)) +
            tiff[offset + 3] * 0x1000000
        : tiff[offset] * 0x1000000 +
            ((tiff[offset + 1] << 16) | (tiff[offset + 2] << 8) | tiff[offset + 3]);
    },
  };
}

/** IFD0 tags of an EXIF TIFF block, as `[tag, entryOffset]` pairs. */
function readIfd0Tags(tiff: Uint8Array): { reader: TiffReader; tags: [number, number][]; next: number } | null {
  const reader = tiffReader(tiff);
  if (!reader) return null;
  const ifd = reader.u32(4);
  const count = reader.u16(ifd);
  const tags: [number, number][] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    tags.push([reader.u16(entry), entry]);
  }
  return { reader, tags, next: reader.u32(ifd + 2 + count * 12) };
}

function readExifOrientation(tiff: Uint8Array): number | null {
  try {
    const ifd = readIfd0Tags(tiff);
    const entry = ifd?.tags.find(([tag]) => tag === JPEG_ORIENTATION_TAG);
    if (!ifd || !entry) return null;
    const value = ifd.reader.u16(entry[1] + 8);
    return value >= 1 && value <= 8 ? value : null;
  } catch {
    return null;
  }
}

function isOrientationOnlyExif(tiff: Uint8Array): boolean {
  try {
    const ifd = readIfd0Tags(tiff);
    return (
      !!ifd &&
      ifd.next === 0 &&
      ifd.tags.every(([tag]) => tag === JPEG_ORIENTATION_TAG)
    );
  } catch {
    return false;
  }
}

/** APP1 segment holding a big-endian EXIF block with only the orientation. */
function makeOrientationExif(orientation: number): Uint8Array {
  return Uint8Array.of(
    0xff, 0xe1, 0x00, 0x22, // APP1, length 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM", 42, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, // Orientation, SHORT, 1
    0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // no next IFD
  );
}

// ---------------------------------------------------------------------------
// PNG

const PNG_PRIVATE_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);

function readPngChunks(bytes: Uint8Array): { type: string; start: number; end: number }[] {
  const chunks: { type: string; start: number; end: number }[] = [];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const length = readU32BE(bytes, i);
    const end = i + 12 + length;
    if (end > bytes.length) throw new Error("Truncated PNG chunk");
    const type = ascii(bytes, i + 4, 4);
    chunks.push({ type, start: i, end });
    i = end;
    if (type === "IEND") return chunks;
  }
  throw new Error("PNG has no IEND chunk");
}

function stripPng(bytes: Uint8Array): Uint8Array {
  const chunks = readPngChunks(bytes).filter((chunk) => !PNG_PRIVATE_CHUNKS.has(chunk.type));
  return concat([
    bytes.subarray(0, 8),
    ...chunks.map((chunk) => bytes.subarray(chunk.start, chunk.end)),
  ]);
}

function pngHasPrivateMetadata(bytes: Uint8Array): boolean {
  const chunks = readPngChunks(bytes);
  return (
    chunks[chunks.length - 1].end < bytes.length ||
    chunks.some((chunk) => PNG_PRIVATE_CHUNKS.has(chunk.type))
  );
}

// ---------------------------------------------------------------------------
// WebP

const WEBP_PRIVATE_CHUNKS = new Set(["EXIF", "XMP "]);
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

function readWebpChunks(bytes: Uint8Array): { type: string; start: number; end: number }[] {
  const riffEnd = 8 + readU32LE(bytes, 4);
  if (riffEnd > bytes.length) throw new Error("Truncated WebP");
  const chunks: { type: string; start: number; end: number }[] = [];
  let i = 12;
  while (i < riffEnd) {
    if (i + 8 > riffEnd) throw new Error("Truncated WebP chunk");
    const size = readU32LE(bytes, i + 4);
    const end = i + 8 + size + (size % 2);
    if (end > riffEnd) throw new Error("Truncated WebP chunk");
    chunks.push({ type: ascii(bytes, i, 4), start: i, end });
    i = end;
  }
  return chunks;
}

function stripWebp(bytes: Uint8Array): Uint8Array {
  const chunks = readWebpChunks(bytes).filter((chunk) => !WEBP_PRIVATE_CHUNKS.has(chunk.type));
  const body = concat(
    chunks.map((chunk) => {
      const copy = bytes.slice(chunk.start, chunk.end);
      if (chunk.type === "VP8X") copy[8] &= ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG);
      return copy;
    }),
  );
  const header = bytes.slice(0, 12);
  writeU32LE(header, 4, body.length + 4);
  return concat([header, body]);
}

function webpHasPrivateMetadata(bytes: Uint8Array): boolean {
  const riffEnd = 8 + readU32LE(bytes, 4);
  const chunks = readWebpChunks(bytes);
  return (
    riffEnd < bytes.length ||
    chunks.some(
      (chunk) =>
        WEBP_PRIVATE_CHUNKS.has(chunk.type) ||
        (chunk.type === "VP8X" && (bytes[chunk.start + 8] & (VP8X_EXIF_FLAG | VP8X_XMP_FLAG)) !== 0),
    )
  );
}

// ---------------------------------------------------------------------------
// GIF

/** Application extensions that only control playback. */
const GIF_KEPT_APPLICATIONS = new Set(["NETSCAPE2.0", "ANIMEXTS1.0"]);

interface GifBlock {
  start: number;
  end: number;
  private: boolean;
}

function skipGifSubBlocks(bytes: Uint8Array, i: number): number {
  while (true) {
    if (i >= bytes.length) throw new Error("Truncated GIF sub-block");
    const size = bytes[i];
    i += 1;
    if (size === 0) return i;
    i += size;
  }
}

function readGifBlocks(bytes: Uint8Array): { headerEnd: number; blocks: GifBlock[]; trailerEnd: number } {
  let i = 13;
  const flags = bytes[10];
  if (flags & 0x80) i += 3 * 2 ** ((flags & 0x07) + 1);
  const headerEnd = i;
  const blocks: GifBlock[] = [];
  while (i < bytes.length) {
    const start = i;
    const introducer = bytes[i];
    if (introducer === 0x3b) {
      return { headerEnd, blocks, trailerEnd: i + 1 };
    }
    if (introducer === 0x21) {
      const label = bytes[i + 1];
      let isPrivate = label === 0xfe; // comment
      if (label === 0xff) {
        const identifier = ascii(bytes, i + 3, 11);
        isPrivate = !GIF_KEPT_APPLICATIONS.has(identifier);
      }
      i = skipGifSubBlocks(bytes, i + 2);
      blocks.push({ start, end: i, private: isPrivate });
      continue;
    }
    if (introducer === 0x2c) {
      const localFlags = bytes[i + 9];
      i += 10;
      if (localFlags & 0x80) i += 3 * 2 ** ((localFlags & 0x07) + 1);
      i = skipGifSubBlocks(bytes, i + 1); // LZW minimum code size, then data
      blocks.push({ start, end: i, private: false });
      continue;
    }
    throw new Error("Unknown GIF block");
  }
  throw new Error("GIF has no trailer");
}

function stripGif(bytes: Uint8Array): Uint8Array {
  const { headerEnd, blocks } = readGifBlocks(bytes);
  return concat([
    bytes.subarray(0, headerEnd),
    ...blocks.filter((block) => !block.private).map((block) => bytes.subarray(block.start, block.end)),
    Uint8Array.of(0x3b),
  ]);
}

function gifHasPrivateMetadata(bytes: Uint8Array): boolean {
  const { blocks, trailerEnd } = readGifBlocks(bytes);
  return trailerEnd < bytes.length || blocks.some((block) => block.private);
}

// ---------------------------------------------------------------------------
// Byte helpers

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset + length > bytes.length) throw new Error("Out of range");
  let text = "";
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(bytes[offset + index]);
  }
  return text;
}

function startsWithAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) throw new Error("Out of range");
  return bytes[offset] * 0x1000000 + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) throw new Error("Out of range");
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)) + bytes[offset + 3] * 0x1000000;
}

function writeU32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
