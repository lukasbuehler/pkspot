import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { basename, dirname, extname, posix } from "path";
import * as sharp from "sharp";
import { DEFAULT_STORAGE_BUCKET } from "./storageBucket";

const DEFAULT_IMAGE_SIZES = [200, 400, 800] as const;
const OPTIONAL_IMAGE_SIZES = [1600] as const;
const ALL_IMAGE_SIZES = [
  ...DEFAULT_IMAGE_SIZES,
  ...OPTIONAL_IMAGE_SIZES,
] as const;
const IMAGE_PREFIXES = [
  "spot_pictures/",
  "profile_pictures/",
  "post_media/",
  "event_media/",
] as const;
const RESIZED_IMAGE_SUFFIX_RE = /_\d+x\d+$/;
const ORIGINAL_ARCHIVE_PREFIX = "resized_originals";
const MAINTENANCE_COLLECTION = "maintenance";
const RUN_BACKFILL_STORAGE_IMAGE_SIZES_DOC = `${MAINTENANCE_COLLECTION}/run-backfill-storage-image-sizes`;

type ImageSize = (typeof ALL_IMAGE_SIZES)[number];

interface ProcessImageOptions {
  bucketName: string;
  filePath: string;
  sourceFilePath?: string;
  contentType?: string;
  customMetadata?: Record<string, string>;
  onlyMissing?: boolean;
  sizes?: readonly ImageSize[];
  archiveOriginalOnSuccess?: boolean;
}

interface ProcessImageResult {
  processed: boolean;
  created: string[];
  skippedReason?: string;
}

interface BackfillSummary {
  scanned: number;
  processed: number;
  created: number;
  skipped: number;
  failed: number;
}

interface BackfillRequest {
  include1600?: boolean;
  sizes?: unknown;
}

const isSupportedImageContentType = (contentType: string | undefined): boolean =>
  contentType === "image/jpeg" ||
  contentType === "image/png" ||
  contentType === "image/webp";

const isValidImageSize = (size: number): size is ImageSize =>
  (ALL_IMAGE_SIZES as readonly number[]).includes(size);

const getBackfillSizes = (request: BackfillRequest | undefined): ImageSize[] => {
  if (Array.isArray(request?.sizes)) {
    const sizes = request.sizes.filter(
      (size): size is ImageSize =>
        typeof size === "number" && isValidImageSize(size)
    );
    if (sizes.length > 0) {
      return Array.from(new Set(sizes));
    }
  }

  return request?.include1600
    ? [...DEFAULT_IMAGE_SIZES, 1600]
    : [...DEFAULT_IMAGE_SIZES];
};

const normalizeCustomMetadata = (
  metadata: Record<string, string | number | boolean | null> | undefined
): Record<string, string> | undefined => {
  if (!metadata) return undefined;

  const entries = Object.entries(metadata)
    .filter((entry): entry is [string, string | number | boolean] => {
      return entry[1] !== null && entry[1] !== undefined;
    })
    .map(([key, value]) => [key, String(value)]);

  return Object.fromEntries(entries);
};

const isEligibleImagePath = (filePath: string): boolean => {
  if (filePath.startsWith(`${ORIGINAL_ARCHIVE_PREFIX}/`)) return false;

  if (!IMAGE_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
    return false;
  }

  const fileName = basename(filePath);
  const dir = dirname(filePath);
  if (dir.includes("failed")) return false;
  if (fileName.startsWith("thumb_") || fileName.startsWith("comp_")) {
    return false;
  }

  const parsed = parseImagePath(filePath);
  if (!parsed) return false;
  return !RESIZED_IMAGE_SUFFIX_RE.test(parsed.baseName);
};

const getArchivedOriginalPath = (filePath: string): string =>
  posix.join(ORIGINAL_ARCHIVE_PREFIX, filePath);

const getOriginalPathFromArchive = (filePath: string): string | null => {
  const archivePrefix = `${ORIGINAL_ARCHIVE_PREFIX}/`;
  return filePath.startsWith(archivePrefix)
    ? filePath.slice(archivePrefix.length)
    : null;
};

const archiveOriginal = async (
  bucketName: string,
  filePath: string
): Promise<string> => {
  const bucket = getStorage().bucket(bucketName);
  const archivedPath = getArchivedOriginalPath(filePath);
  await bucket.file(filePath).move(archivedPath);
  return archivedPath;
};

const parseImagePath = (
  filePath: string
): { dir: string; baseName: string; extension: string } | null => {
  const extension = extname(filePath);
  const baseName = extension ? basename(filePath, extension) : basename(filePath);
  if (!baseName) return null;

  return {
    dir: dirname(filePath),
    baseName,
    extension,
  };
};

const buildResizedPath = (filePath: string, size: ImageSize): string => {
  const parsed = parseImagePath(filePath);
  if (!parsed) {
    throw new Error(`Cannot build resized path for extensionless file: ${filePath}`);
  }

  return posix.join(
    parsed.dir,
    `${parsed.baseName}_${size}x${size}${parsed.extension}`
  );
};

const resizeImage = async (input: Buffer, size: ImageSize): Promise<Buffer> => {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Image dimensions could not be read");
  }

  const resizeOptions =
    metadata.width <= metadata.height
      ? { width: size }
      : { height: size };

  return sharp(input)
    .rotate()
    .resize({ ...resizeOptions, withoutEnlargement: true })
    .toBuffer();
};

export const processStorageImage = async (
  options: ProcessImageOptions
): Promise<ProcessImageResult> => {
  if (!isEligibleImagePath(options.filePath)) {
    return { processed: false, created: [], skippedReason: "ineligible-path" };
  }

  if (!isSupportedImageContentType(options.contentType)) {
    return {
      processed: false,
      created: [],
      skippedReason: "unsupported-content-type",
    };
  }

  const bucket = getStorage().bucket(options.bucketName);
  const sourceFile = bucket.file(options.sourceFilePath ?? options.filePath);
  const [sourceBytes] = await sourceFile.download();
  const created: string[] = [];
  const sizes = options.sizes ?? DEFAULT_IMAGE_SIZES;

  for (const size of sizes) {
    const resizedPath = buildResizedPath(options.filePath, size);
    const resizedFile = bucket.file(resizedPath);

    if (options.onlyMissing) {
      const [exists] = await resizedFile.exists();
      if (exists) continue;
    }

    const resizedBytes = await resizeImage(sourceBytes, size);
    await resizedFile.save(resizedBytes, {
      resumable: false,
      metadata: {
        contentType: options.contentType,
        metadata: options.customMetadata,
      },
    });
    created.push(resizedPath);
  }

  if (options.archiveOriginalOnSuccess) {
    await archiveOriginal(options.bucketName, options.filePath);
  }

  return { processed: true, created };
};

export const processImageUpload = onObjectFinalized(
  {
    bucket: DEFAULT_STORAGE_BUCKET,
    cpu: 1,
    region: "europe-west1",
    timeoutSeconds: 180,
    memory: "1GiB",
    maxInstances: 10,
  },
  async (event) => {
    const filePath = event.data.name;
    const bucketName = event.data.bucket;
    const contentType = event.data.contentType;

    if (!filePath) return;

    try {
      const result = await processStorageImage({
        bucketName,
        filePath,
        contentType,
        customMetadata: event.data.metadata,
        archiveOriginalOnSuccess: true,
      });

      if (!result.processed) {
        console.log("Skipping image resize", {
          filePath,
          reason: result.skippedReason,
        });
        return;
      }

      console.log("Created resized images", {
        filePath,
        created: result.created,
      });
    } catch (error) {
      console.error("Image resize failed; keeping original in place", {
        filePath,
        error,
      });
    }
  }
);

export const backfillStorageImageSizes = onDocumentCreated(
  {
    document: RUN_BACKFILL_STORAGE_IMAGE_SIZES_DOC,
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (event) => {
    const bucket = getStorage().bucket(DEFAULT_STORAGE_BUCKET);
    const sizes = getBackfillSizes(event.data?.data() as BackfillRequest);
    const summary: BackfillSummary = {
      scanned: 0,
      processed: 0,
      created: 0,
      skipped: 0,
      failed: 0,
    };

    const scanPrefixes = [
      ...IMAGE_PREFIXES,
      ...IMAGE_PREFIXES.map((prefix) =>
        posix.join(ORIGINAL_ARCHIVE_PREFIX, prefix)
      ),
    ];

    for (const prefix of scanPrefixes) {
      const [files] = await bucket.getFiles({ prefix });

      for (const file of files) {
        summary.scanned++;
        const archivedOriginalPath = getOriginalPathFromArchive(file.name);
        const outputPath = archivedOriginalPath ?? file.name;

        if (!isEligibleImagePath(outputPath)) {
          summary.skipped++;
          continue;
        }

        try {
          const [metadata] = await file.getMetadata();
          const result = await processStorageImage({
            bucketName: bucket.name,
            filePath: outputPath,
            sourceFilePath: file.name,
            contentType: metadata.contentType,
            customMetadata: normalizeCustomMetadata(metadata.metadata),
            onlyMissing: true,
            sizes,
          });

          if (!result.processed) {
            summary.skipped++;
            continue;
          }

          summary.processed++;
          summary.created += result.created.length;
        } catch (error) {
          summary.failed++;
          console.error("Backfill image resize failed", {
            filePath: file.name,
            error,
          });
        }
      }
    }

    console.log("Storage image size backfill completed", summary);

    if (event.data) {
      await getFirestore()
        .collection(MAINTENANCE_COLLECTION)
        .doc("last-storage-image-size-backfill")
        .set({
          ...summary,
          completedAt: new Date(),
        });

      await event.data.ref.delete();
    }
  }
);
