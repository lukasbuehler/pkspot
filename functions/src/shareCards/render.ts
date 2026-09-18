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
  /** A caller must authorize publication before supplying public data here. */
  audience: "public" | "restricted";
  photos?: Buffer[];
}
export interface ShareCardAssets { fontFile: string; logo?: Buffer }
export const SHARE_CARD_VERSION = "prototype-1";
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
  const photos = (input.photos ?? []).slice(0, 3);
  const layers: OverlayOptions[] = [];
  const svg = (body: string): Buffer => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">${body}</svg>`);
  layers.push({ input: svg(`<rect width="1200" height="630" fill="#18191f"/>
    <g fill="none" stroke="#b9bdff" stroke-width="3" opacity=".22">
      <path d="M710 630V335L890 235V530L1080 420V145L1200 75"/>
      <path d="M620 630V465L800 360V565L1000 450V235L1200 120"/>
      <path d="M890 235L1000 295M1080 145L1200 215"/>
    </g><circle cx="995" cy="215" r="62" fill="#b9bdff" opacity=".1"/>`) });
  // One hero photo; optional supporting crops. Failed media degrades to artwork.
  for (const [index, photo] of photos.entries()) {
    const collage = photos.length > 1;
    const box = !collage ? { left: 550, top: 0, width: 650, height: 630 }
      : index === 0 ? { left: 620, top: 0, width: 580, height: 410 }
      : { left: index === 1 ? 620 : 912, top: 416, width: photos.length === 2 ? 580 : 288, height: 214 };
    try {
      const image = await sharp(photo, { limitInputPixels: 40_000_000 }).rotate()
        .resize(box.width, box.height, { fit: "cover", position: "attention" }).png().toBuffer();
      layers.push({ input: image, left: box.left, top: box.top });
    } catch { /* Keep a valid, intentionally designed fallback for broken photos. */ }
  }
  layers.push({ input: svg(`<defs><linearGradient id="shade"><stop offset="0" stop-color="#18191f"/><stop offset=".43" stop-color="#18191f"/><stop offset=".8" stop-color="#18191f" stop-opacity=".22"/><stop offset="1" stop-color="#18191f" stop-opacity=".12"/></linearGradient></defs><rect width="1200" height="630" fill="url(#shade)"/><rect x="56" y="62" width="5" height="28" rx="2" fill="#b9bdff"/>`) });
  const addText = async (text: string, left: number, top: number, width: number, height: number, size: number, color: string, bold = false) => {
    if (!text) return;
    const png = await sharp({ text: {
      text: `<span foreground="${color}">${escapeText(text)}</span>`,
      font: `Roboto ${bold ? "Bold " : ""}${size}`, fontfile: assets.fontFile,
      width, rgba: true, wrap: "word-char", align: "left",
    } }).resize({ width, height, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    layers.push({ input: png, left, top });
  };
  await addText((input.label ?? input.kind).slice(0, 40).toUpperCase(), 78, 65, 700, 30, 24, "#b9bdff", true);
  await addText(input.title, 56, 155, photos.length ? 630 : 930, 246, 76, "#f4f3ff", true);
  await addText(input.subtitle, 58, 429, 900, 65, 31, "#e2e0eb");
  await addText(input.detail ?? "", 58, 510, 780, 38, 24, "#b9bdff");
  if (assets.logo) {
    const logo = await sharp(assets.logo).resize({ width: 140, height: 58, fit: "inside" }).png().toBuffer();
    layers.push({ input: logo, left: 1000, top: 540 });
  } else await addText("PK SPOT", 980, 550, 170, 40, 27, "#f4f3ff", true);
  await addText("pkspot.app", 58, 575, 250, 25, 19, "#aaa8b8");
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
