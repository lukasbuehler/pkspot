import { createRequire } from "node:module";
import type { OverlayOptions } from "sharp";
const sharp = createRequire(__filename)("sharp") as typeof import("sharp").default;
import { createHash } from "node:crypto";

export type ShareCardKind = "spot" | "event" | "community" | "profile" | "page";
export interface ShareCardInput {
  kind: ShareCardKind;
  title: string;
  subtitle: string;
  detail?: string;
  label?: string;
  /** Average Spot rating out of five. Missing or zero means unrated. */
  rating?: number;
  /** A caller must authorize publication before supplying public data here. */
  audience: "public" | "restricted";
  photos?: Buffer[];
}
export interface ShareCardAssets { fontFile: string; logo?: Buffer }
export const SHARE_CARD_VERSION = "prototype-3";
export const SHARE_CARD_SIZE = { width: 1200, height: 630 };
const escapeText = (value: string): string => value.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** No network, Firebase, or filesystem writes. The local lab and future worker
 * call this exact renderer with resolved, publication-approved asset buffers.
 * Raster artwork has a fixed palette independent of the viewer's app theme. */
export async function renderShareCard(input: ShareCardInput, assets: ShareCardAssets): Promise<Buffer> {
  if (input.audience !== "public") throw new Error("Restricted content cannot produce a public share card");
  if (!input.title.trim() || input.title.length > 240 || input.subtitle.length > 240 || (input.detail?.length ?? 0) > 160) {
    throw new Error("Share card text is missing or too long");
  }
  if (input.rating !== undefined && (!Number.isFinite(input.rating) || input.rating < 0 || input.rating > 5)) {
    throw new Error("Spot rating must be between zero and five");
  }
  const photos = (input.photos ?? []).slice(0, 3);
  const layers: OverlayOptions[] = [];
  const svg = (body: string): Buffer => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">${body}</svg>`);
  layers.push({ input: svg(`<rect width="1200" height="630" fill="#18191f"/>
    <g fill="none" stroke="#b9bdff" stroke-width="3" opacity=".22">
      <path d="M710 630V335L890 235V530L1080 420V145L1200 75"/>
      <path d="M620 630V465L800 360V565L1000 450V235L1200 120"/>
      <path d="M890 235L1000 295M1080 145L1200 215"/>
    </g><circle cx="995" cy="215" r="62" fill="#b9bdff" opacity=".1"/>`) });
  // Start photos inside the fully opaque gradient so their left edge is hidden.
  // Optional supporting crops share that same edge; failed media uses artwork.
  for (const [index, photo] of photos.entries()) {
    const collage = photos.length > 1;
    const box = !collage ? { left: 300, top: 0, width: 900, height: 630 }
      : index === 0 ? { left: 300, top: 0, width: 900, height: 410 }
      : { left: index === 1 ? 300 : 753, top: 416, width: photos.length === 2 ? 900 : 447, height: 214 };
    try {
      const image = await sharp(photo, { limitInputPixels: 40_000_000 }).rotate()
        .resize(box.width, box.height, { fit: "cover", position: "attention" }).png().toBuffer();
      layers.push({ input: image, left: box.left, top: box.top });
    } catch { /* Keep a valid, intentionally designed fallback for broken photos. */ }
  }
  layers.push({ input: svg(`<defs><linearGradient id="shade"><stop offset="0" stop-color="#18191f"/><stop offset=".3" stop-color="#18191f"/><stop offset=".48" stop-color="#18191f" stop-opacity=".88"/><stop offset=".8" stop-color="#18191f" stop-opacity=".22"/><stop offset="1" stop-color="#18191f" stop-opacity=".12"/></linearGradient></defs><rect width="1200" height="630" fill="url(#shade)"/><rect x="56" y="62" width="5" height="28" rx="2" fill="#b9bdff"/>`) });
  const addText = async (text: string, left: number, top: number, width: number, height: number, size: number, color: string, bold = false) => {
    if (!text) return;
    const png = await sharp({ text: {
      text: `<span foreground="${color}">${escapeText(text)}</span>`,
      font: `Roboto ${bold ? "Bold " : ""}${size}`, fontfile: assets.fontFile,
      width, rgba: true, wrap: "word-char", align: "left",
    } }).resize({ width, height, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    layers.push({ input: png, left, top });
  };
  await addText((input.label ?? input.kind).slice(0, 40).toUpperCase(), 78, 63, 700, 36, 30, "#b9bdff", true);
  if (input.kind === "spot" && input.rating && input.rating > 0) {
    const rating = await sharp({ text: {
      text: `<span foreground="#f4f3ff">${input.rating.toFixed(1)}</span>`,
      font: "Roboto Bold 34", fontfile: assets.fontFile, rgba: true,
    } }).png().toBuffer({ resolveWithObject: true });
    // Size the pill from actual glyph bounds for balanced padding on both sides.
    const padding = 22, starSize = 34, gap = 12, height = 64;
    const width = padding * 2 + starSize + gap + rating.info.width;
    const left = SHARE_CARD_SIZE.width - 56 - width;
    layers.push({ input: svg(`<rect x="${left}" y="48" width="${width}" height="${height}" rx="${height / 2}" fill="#18191f" fill-opacity=".9"/><g transform="translate(${left + padding} 63)"><path d="m17 0 5 11 12 2-9 9 2 12-10-6-11 6 2-12-9-9 13-2z" fill="#b9bdff"/></g>`) });
    layers.push({ input: rating.data, left: left + padding + starSize + gap,
      top: 48 + Math.round((height - rating.info.height) / 2) });
  }
  await addText(input.title, 56, 155, photos.length ? 630 : 930, 246, 76, "#f4f3ff", true);
  await addText(input.subtitle, 58, 429, 1020, 72, 38, "#e2e0eb");
  await addText(input.detail ?? "", 58, 510, 1020, 42, 30, "#b9bdff");
  if (assets.logo) {
    const logo = await sharp(assets.logo).resize({ width: 220, height: 58, fit: "inside" }).png().toBuffer();
    layers.push({ input: logo, left: 924, top: 565 });
  } else await addText("PK SPOT", 924, 565, 220, 42, 36, "#f4f3ff", true);
  return sharp({ create: { ...SHARE_CARD_SIZE, channels: 4, background: "#18191f" } })
    .composite(layers).png().toBuffer();
}

/** Content-based keys let callers coalesce work and retain an old card until a
 * replacement succeeds. Callers must include the fonts/logo/template revision. */
export function shareCardFingerprint(input: ShareCardInput): string {
  const hash = createHash("sha256").update(SHARE_CARD_VERSION)
    .update(JSON.stringify({ ...input, photos: undefined }));
  for (const photo of (input.photos ?? []).slice(0, 3)) hash.update(photo);
  return hash.digest("hex").slice(0, 24);
}
