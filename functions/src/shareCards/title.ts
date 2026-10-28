import { createRequire } from "node:module";
const sharp = createRequire(__filename)("sharp") as typeof import("sharp").default;

export const TITLE_MAX_SIZE = 76;
export const TITLE_MIN_SIZE = 48;
export const escapeText = (value: string): string => value.replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);

/** Layout before rasterization: never shrink a finished title bitmap below the
 * minimum. Explicit line breaks also avoid Pango inserting mid-word hyphens. */
export async function renderTitle(title: string, width: number, height: number, fontFile: string) {
  // Multiline glyph bearings can extend a couple of pixels beyond a single
  // line's measured ink bounds. Reserve that space before choosing a size.
  const lineWidth = width - 4;
  const widths = new Map<string, number>();
  const raster = (text: string, size: number) => sharp({ text: {
    text: `<span foreground="#f4f3ff">${escapeText(text)}</span>`,
    font: `Roboto Bold ${size}`, fontfile: fontFile, rgba: true, wrap: "none",
  } });
  const measure = async (text: string, size: number): Promise<number> => {
    if (!text) return 0;
    const key = `${size}:${text}`;
    if (!widths.has(key)) widths.set(key, (await raster(text, size).metadata()).width ?? 0);
    return widths.get(key)!;
  };
  const words = title.trim().split(/(\n)/u).flatMap((part) => part === "\n" ? [part] : part.split(/\s+/u).filter(Boolean));
  const widest = Math.max(...await Promise.all(words.filter((word) => word !== "\n").map((word) => measure(word, TITLE_MAX_SIZE))));
  let upper = Math.max(TITLE_MIN_SIZE, Math.min(TITLE_MAX_SIZE, Math.floor(TITLE_MAX_SIZE * lineWidth / Math.max(1, widest))));
  while (upper > TITLE_MIN_SIZE && Math.max(...await Promise.all(words.filter((word) => word !== "\n").map((word) => measure(word, upper)))) > lineWidth) upper--;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const layout = async (size: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (word === "\n") { lines.push(line || " "); line = ""; continue; }
      const joined = line ? `${line} ${word}` : word;
      if (await measure(joined, size) <= lineWidth) { line = joined; continue; }
      if (line) { lines.push(line); line = ""; }
      // Only words that cannot fit even at the minimum may split.
      for (const { segment } of segmenter.segment(word)) {
        if (line && await measure(line + segment, size) > lineWidth) {
          lines.push(line); line = "";
        }
        line += segment;
      }
    }
    if (line) lines.push(line);
    const rendered = await raster(lines.join("\n"), size).png().toBuffer({ resolveWithObject: true });
    return { ...rendered, lines, fontSize: size, truncated: false };
  };
  let result = await layout(upper);
  if ((result.info.height > height || result.info.width > width) && upper > TITLE_MIN_SIZE) {
    let low = TITLE_MIN_SIZE, high = upper - 1;
    result = await layout(low);
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = await layout(middle);
      if (candidate.info.height <= height && candidate.info.width <= width) { result = candidate; low = middle + 1; }
      else high = middle - 1;
    }
  }
  if (result.info.height > height || result.info.width > width) {
    const lines = [...result.lines];
    while (lines.length > 1 && (await raster(lines.join("\n"), TITLE_MIN_SIZE).metadata()).height! > height) lines.pop();
    let last = lines.pop() ?? "";
    while (last && await measure(`${last}…`, TITLE_MIN_SIZE) > lineWidth) {
      last = [...segmenter.segment(last)].slice(0, -1).map((part) => part.segment).join("");
    }
    lines.push(`${last}…`);
    result = { ...await raster(lines.join("\n"), TITLE_MIN_SIZE).png().toBuffer({ resolveWithObject: true }),
      lines, fontSize: TITLE_MIN_SIZE, truncated: true };
  }
  return result;
}
