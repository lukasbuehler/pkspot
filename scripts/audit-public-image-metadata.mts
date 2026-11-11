/**
 * Find public images that still carry location or other private metadata
 * (EXIF/GPS, XMP, IPTC, comments, appended data), and optionally rewrite them
 * with that metadata removed.
 *
 * Read-only by default. Reports object paths and counts only; no coordinates
 * or image contents are printed or saved.
 *
 *   node scripts/audit-public-image-metadata.mts [--output report.json]
 *   node scripts/audit-public-image-metadata.mts --apply      # rewrite in place
 *   node scripts/audit-public-image-metadata.mts --local <dir> # test on files
 *   node scripts/audit-public-image-metadata.mts --apply --only <path> # one object
 *
 * Production runs use GOOGLE_APPLICATION_CREDENTIALS or
 * scripts/serviceAccountKey.json, like scripts/audit-media-references.cjs.
 * Resized derivatives (`name_400x400.jpg`) are written by sharp without
 * metadata and are skipped unless `--include-derivatives` is passed.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import {
  hasPrivateImageMetadata,
  stripImageMetadata,
} from "../src/db/utils/image-metadata.ts";

const require = createRequire(import.meta.url);

export const PUBLIC_IMAGE_PREFIXES = [
  "spot_pictures/",
  "profile_pictures/",
  "post_media/",
  "challenges/",
  "event_media/",
  "organization_media/",
] as const;

const DERIVATIVE_RE = /_\d+x\d+(?=\.[^/.]+$|$)/;

/** Image content type from the file signature, for objects saved without one. */
export function sniffImageContentType(bytes: Uint8Array): string | undefined {
  const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return "image/webp";
  }
  return undefined;
}

export type ImageFinding = "clean" | "private-metadata" | "unparsable";

export function classifyImage(bytes: Uint8Array): ImageFinding {
  if (!hasPrivateImageMetadata(bytes)) return "clean";
  return stripImageMetadata(bytes) ? "private-metadata" : "unparsable";
}

/** Clean bytes for a file, or null when it cannot be cleaned without risk. */
export async function cleanedImage(bytes: Uint8Array): Promise<Uint8Array | null> {
  const stripped = stripImageMetadata(bytes);
  if (stripped && !hasPrivateImageMetadata(stripped)) return stripped;
  const sharp = require("sharp");
  const reencoded: Uint8Array = await sharp(bytes, { animated: true })
    .rotate()
    .keepIccProfile()
    .toBuffer();
  const reencodedStripped = stripImageMetadata(reencoded);
  return reencodedStripped && !hasPrivateImageMetadata(reencodedStripped)
    ? reencodedStripped
    : null;
}

interface Report {
  scanned: number;
  skippedDerivatives: number;
  skippedNonImages: number;
  byPrefix: Record<string, Record<ImageFinding, number>>;
  privateMetadata: string[];
  unparsable: string[];
  rewritten: string[];
  rewriteFailed: string[];
}

function emptyReport(): Report {
  return {
    scanned: 0,
    skippedDerivatives: 0,
    skippedNonImages: 0,
    byPrefix: {},
    privateMetadata: [],
    unparsable: [],
    rewritten: [],
    rewriteFailed: [],
  };
}

interface ScannedObject {
  path: string;
  contentType: string | undefined;
  download(): Promise<Uint8Array>;
  rewrite(bytes: Uint8Array): Promise<void>;
}

async function scan(
  objects: AsyncIterable<ScannedObject>,
  options: { apply: boolean; includeDerivatives: boolean; only?: string },
): Promise<Report> {
  const report = emptyReport();
  for await (const object of objects) {
    if (options.only && object.path !== options.only) continue;
    const prefix = PUBLIC_IMAGE_PREFIXES.find((candidate) => object.path.startsWith(candidate));
    if (!prefix) continue;
    if (object.contentType && !object.contentType.startsWith("image/")) {
      report.skippedNonImages++;
      continue;
    }
    if (!options.includeDerivatives && DERIVATIVE_RE.test(object.path)) {
      report.skippedDerivatives++;
      continue;
    }
    const bytes = await object.download();
    const finding = classifyImage(bytes);
    report.scanned++;
    report.byPrefix[prefix] ??= { clean: 0, "private-metadata": 0, unparsable: 0 };
    report.byPrefix[prefix][finding]++;
    if (finding === "clean") continue;
    (finding === "private-metadata" ? report.privateMetadata : report.unparsable).push(object.path);
    if (!options.apply) continue;
    try {
      const cleaned = await cleanedImage(bytes);
      if (!cleaned) throw new Error("could not be cleaned");
      await object.rewrite(cleaned);
      report.rewritten.push(object.path);
    } catch {
      report.rewriteFailed.push(object.path);
    }
  }
  return report;
}

async function* localObjects(root: string): AsyncIterable<ScannedObject> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath, entry.name);
    const path = absolute.slice(resolve(root).length + 1);
    yield {
      path,
      contentType: undefined,
      download: async () => new Uint8Array(await readFile(absolute)),
      rewrite: (bytes) => writeFile(absolute, bytes),
    };
  }
}

async function* storageObjects(only?: string): AsyncIterable<ScannedObject> {
  const admin = require("firebase-admin");
  const keyPath = process.env["GOOGLE_APPLICATION_CREDENTIALS"] || "scripts/serviceAccountKey.json";
  const key = JSON.parse(await readFile(resolve(keyPath), "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
  const bucket = admin.storage().bucket(`${key.project_id}.appspot.com`);
  for (const prefix of PUBLIC_IMAGE_PREFIXES) {
    if (only && !only.startsWith(prefix)) continue;
    const [files] = await bucket.getFiles({ prefix: only ?? prefix });
    for (const file of files) {
      const metadata = file.metadata;
      yield {
        path: file.name,
        contentType: metadata.contentType,
        download: async () => new Uint8Array((await file.download())[0]),
        rewrite: (bytes) =>
          file.save(Buffer.from(bytes), {
            resumable: false,
            metadata: {
              // Saving without a type would default to application/octet-stream.
              contentType: metadata.contentType ?? sniffImageContentType(bytes),
              cacheControl: metadata.cacheControl,
              metadata: metadata.metadata,
            },
          }),
      };
    }
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const includeDerivatives = process.argv.includes("--include-derivatives");
  const local = argument("--local");
  const output = argument("--output");
  const only = argument("--only");
  const report = await scan(local ? localObjects(local) : storageObjects(only), {
    apply,
    includeDerivatives,
    only,
  });
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "read-only",
        scanned: report.scanned,
        skippedDerivatives: report.skippedDerivatives,
        skippedNonImages: report.skippedNonImages,
        byPrefix: report.byPrefix,
        privateMetadata: report.privateMetadata.length,
        unparsable: report.unparsable.length,
        rewritten: report.rewritten.length,
        rewriteFailed: report.rewriteFailed.length,
        ...(only ? { rewrittenPaths: report.rewritten, failedPaths: report.rewriteFailed } : {}),
      },
      null,
      2,
    ),
  );
  if (output) {
    await writeFile(output, JSON.stringify(report, null, 2));
    console.log(`Wrote object paths to ${output}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
