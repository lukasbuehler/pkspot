/**
 * Fix profile picture files that were uploaded with an extension (e.g. .png)
 * while the app expects extension-less file keys:
 *   profile_pictures/{uid}
 *
 * Default mode is DRY RUN.
 *
 * Usage:
 *   ./scripts/fix_profile_picture_extensions_runner.sh --dry-run
 *   ./scripts/fix_profile_picture_extensions_runner.sh --force
 *   ./scripts/fix_profile_picture_extensions_runner.sh --force --delete-source
 *   ./scripts/fix_profile_picture_extensions_runner.sh --force --copy-sized
 *   ./scripts/fix_profile_picture_extensions_runner.sh --force --uids=uid1,uid2
 */

import admin from "firebase-admin";

const PROJECT_ID = "parkour-base-project";
const DEFAULT_BUCKET = "parkour-base-project.appspot.com";
const PROFILE_PICTURES_PREFIX = "profile_pictures/";
const SUPPORTED_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;
const KNOWN_SIZES = [200, 400, 800] as const;

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}

type Candidate = {
  uid: string;
  extension: string;
  sourcePath: string;
  destinationPath: string;
  hasBaseSource: boolean;
  sizedSourceCount: number;
};

type CliArgs = {
  dryRun: boolean;
  deleteSource: boolean;
  copySized: boolean;
  uids: Set<string> | null;
  bucket: string;
};

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const dryRun = !force || argv.includes("--dry-run");
  const deleteSource = argv.includes("--delete-source");
  const copySized = argv.includes("--copy-sized");

  const uidsArg = argv.find((a) => a.startsWith("--uids="));
  const bucketArg = argv.find((a) => a.startsWith("--bucket="));
  const bucket = bucketArg?.split("=")[1] || DEFAULT_BUCKET;

  let uids: Set<string> | null = null;
  if (uidsArg) {
    const value = uidsArg.split("=")[1] ?? "";
    const parsed = value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    uids = new Set(parsed);
  }

  return { dryRun, deleteSource, copySized, uids, bucket };
}

function buildPublicProfilePictureUrl(bucketName: string, uid: string): string {
  const encodedPath = encodeURIComponent(`${PROFILE_PICTURES_PREFIX}${uid}`);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`;
}

function isSupportedExtension(extension: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extension);
}

function isKnownSize(size: number): boolean {
  return (KNOWN_SIZES as readonly number[]).includes(size);
}

function parseProfilePictureObject(path: string): {
  uid: string;
  extension: string;
  isSized: boolean;
  size?: number;
} | null {
  const stripped = path.startsWith(PROFILE_PICTURES_PREFIX)
    ? path.slice(PROFILE_PICTURES_PREFIX.length)
    : path;

  if (!stripped || stripped.includes("/")) {
    return null;
  }

  const sizedMatch = /^(.+)_(\d+)x\2\.(png|jpg|jpeg|webp)$/i.exec(stripped);
  if (sizedMatch) {
    const uid = sizedMatch[1];
    const size = Number(sizedMatch[2]);
    const extension = sizedMatch[3].toLowerCase();

    if (!isSupportedExtension(extension) || !isKnownSize(size)) {
      return null;
    }

    return {
      uid,
      extension,
      isSized: true,
      size,
    };
  }

  const baseMatch = /^(.+)\.(png|jpg|jpeg|webp)$/i.exec(stripped);
  if (!baseMatch) {
    return null;
  }

  const uid = baseMatch[1];
  const extension = baseMatch[2].toLowerCase();

  if (!isSupportedExtension(extension)) {
    return null;
  }

  // Skip potential non-profile files that look like "uid_123x123.ext"
  if (/_\d+x\d+$/.test(uid)) {
    return null;
  }

  return {
    uid,
    extension,
    isSized: false,
  };
}

async function copyIfNeeded(
  bucket: any,
  sourcePath: string,
  destinationPath: string,
  dryRun: boolean
): Promise<"copied" | "exists" | "missing"> {
  const sourceFile = bucket.file(sourcePath);
  const destinationFile = bucket.file(destinationPath);

  const [sourceExists] = await sourceFile.exists();
  if (!sourceExists) {
    return "missing";
  }

  const [destinationExists] = await destinationFile.exists();
  if (destinationExists) {
    return "exists";
  }

  if (dryRun) {
    return "copied";
  }

  await sourceFile.copy(destinationFile);
  return "copied";
}

async function maybeDeleteSource(
  bucket: any,
  path: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    return;
  }
  await bucket.file(path).delete({ ignoreNotFound: true });
}

async function maybeCopySizedVariants(
  bucket: any,
  uid: string,
  extension: string,
  dryRun: boolean
): Promise<{ copied: number; existed: number; missing: number }> {
  let copied = 0;
  let existed = 0;
  let missing = 0;

  for (const size of KNOWN_SIZES) {
    const sourcePath = `${PROFILE_PICTURES_PREFIX}${uid}_${size}x${size}.${extension}`;
    const destinationPath = `${PROFILE_PICTURES_PREFIX}${uid}_${size}x${size}`;

    const result = await copyIfNeeded(
      bucket,
      sourcePath,
      destinationPath,
      dryRun
    );
    if (result === "copied") copied++;
    if (result === "exists") existed++;
    if (result === "missing") missing++;
  }

  return { copied, existed, missing };
}

async function maybeUpdateUserDoc(
  db: FirebaseFirestore.Firestore,
  bucketName: string,
  uid: string,
  dryRun: boolean
): Promise<"updated" | "unchanged" | "missing-user"> {
  const userRef = db.collection("users").doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    return "missing-user";
  }

  const targetUrl = buildPublicProfilePictureUrl(bucketName, uid);
  const currentUrl = (userDoc.data()?.["profile_picture"] as string) ?? "";

  if (currentUrl === targetUrl) {
    return "unchanged";
  }

  if (!dryRun) {
    await userRef.update({ profile_picture: targetUrl });
  }

  return "updated";
}

async function run() {
  const args = parseArgs();
  const bucket = admin.storage().bucket(args.bucket);
  const db = admin.firestore();

  console.log(
    args.dryRun
      ? "DRY RUN: no changes will be written."
      : "LIVE RUN: changes will be written."
  );
  console.log(`Bucket: ${bucket.name}`);
  console.log(`Supported extensions: ${SUPPORTED_EXTENSIONS.join(", ")}`);
  if (args.uids && args.uids.size > 0) {
    console.log(`UID filter: ${Array.from(args.uids).join(", ")}`);
  }
  console.log("");

  const [files] = await bucket.getFiles({ prefix: PROFILE_PICTURES_PREFIX });

  const byUidAndExtension = new Map<
    string,
    Map<string, { hasBase: boolean; sizedSizes: Set<number> }>
  >();

  for (const file of files) {
    const parsed = parseProfilePictureObject(file.name);
    if (!parsed) {
      continue;
    }
    if (args.uids && !args.uids.has(parsed.uid)) {
      continue;
    }

    const perUid =
      byUidAndExtension.get(parsed.uid) ??
      new Map<string, { hasBase: boolean; sizedSizes: Set<number> }>();
    const perExt = perUid.get(parsed.extension) ?? {
      hasBase: false,
      sizedSizes: new Set<number>(),
    };

    if (parsed.isSized && parsed.size) {
      perExt.sizedSizes.add(parsed.size);
    } else {
      perExt.hasBase = true;
    }

    perUid.set(parsed.extension, perExt);
    byUidAndExtension.set(parsed.uid, perUid);
  }

  // Choose one extension per uid. Prefer extension with base source, then with
  // more sized variants, then by extension rank.
  const extensionRank: Record<string, number> = {
    png: 0,
    jpg: 1,
    jpeg: 2,
    webp: 3,
  };

  const work: Candidate[] = [];
  for (const [uid, extMap] of byUidAndExtension.entries()) {
    let selectedExt = "";
    let selectedMeta: { hasBase: boolean; sizedSizes: Set<number> } | null =
      null;

    for (const [extension, meta] of extMap.entries()) {
      if (!selectedMeta) {
        selectedExt = extension;
        selectedMeta = meta;
        continue;
      }

      const selectedHasBaseScore = selectedMeta.hasBase ? 1 : 0;
      const currentHasBaseScore = meta.hasBase ? 1 : 0;
      if (currentHasBaseScore > selectedHasBaseScore) {
        selectedExt = extension;
        selectedMeta = meta;
        continue;
      }
      if (currentHasBaseScore < selectedHasBaseScore) {
        continue;
      }

      const selectedSizedCount = selectedMeta.sizedSizes.size;
      const currentSizedCount = meta.sizedSizes.size;
      if (currentSizedCount > selectedSizedCount) {
        selectedExt = extension;
        selectedMeta = meta;
        continue;
      }
      if (currentSizedCount < selectedSizedCount) {
        continue;
      }

      if (extensionRank[extension] < extensionRank[selectedExt]) {
        selectedExt = extension;
        selectedMeta = meta;
      }
    }

    if (!selectedMeta) {
      continue;
    }

    work.push({
      uid,
      extension: selectedExt,
      sourcePath: `${PROFILE_PICTURES_PREFIX}${uid}.${selectedExt}`,
      destinationPath: `${PROFILE_PICTURES_PREFIX}${uid}`,
      hasBaseSource: selectedMeta.hasBase,
      sizedSourceCount: selectedMeta.sizedSizes.size,
    });
  }

  work.sort((a, b) => a.uid.localeCompare(b.uid));

  console.log(`Found ${work.length} profile picture(s) to inspect.`);

  let copiedBase = 0;
  let existingBase = 0;
  let missingBase = 0;
  let skippedBase = 0;
  let deletedSource = 0;
  let sizedCopied = 0;
  let sizedExisting = 0;
  let sizedMissing = 0;
  let userUpdated = 0;
  let userUnchanged = 0;
  let userMissing = 0;

  for (const item of work) {
    let baseResult: "copied" | "exists" | "missing" | "skipped";

    if (item.hasBaseSource) {
      baseResult = await copyIfNeeded(
        bucket,
        item.sourcePath,
        item.destinationPath,
        args.dryRun
      );
    } else {
      baseResult = "skipped";
    }

    if (baseResult === "copied") copiedBase++;
    if (baseResult === "exists") existingBase++;
    if (baseResult === "missing") missingBase++;
    if (baseResult === "skipped") skippedBase++;

    if (args.copySized) {
      const sized = await maybeCopySizedVariants(
        bucket,
        item.uid,
        item.extension,
        args.dryRun
      );
      sizedCopied += sized.copied;
      sizedExisting += sized.existed;
      sizedMissing += sized.missing;
    }

    const userResult = await maybeUpdateUserDoc(
      db,
      bucket.name,
      item.uid,
      args.dryRun
    );
    if (userResult === "updated") userUpdated++;
    if (userResult === "unchanged") userUnchanged++;
    if (userResult === "missing-user") userMissing++;

    if (args.deleteSource && item.hasBaseSource && baseResult === "copied") {
      await maybeDeleteSource(bucket, item.sourcePath, args.dryRun);
      deletedSource++;
    }

    console.log(
      `[${item.uid}] base=${baseResult} sizedSources=${item.sizedSourceCount} user=${userResult}` +
        (args.copySized ? " sized=checked" : "")
    );
  }

  console.log("\nSummary");
  console.log(`Base copied: ${copiedBase}`);
  console.log(`Base already existed: ${existingBase}`);
  console.log(`Base missing source: ${missingBase}`);
  console.log(`Base skipped (no base extension source): ${skippedBase}`);
  if (args.copySized) {
    console.log(`Sized copied: ${sizedCopied}`);
    console.log(`Sized already existed: ${sizedExisting}`);
    console.log(`Sized missing source: ${sizedMissing}`);
  }
  console.log(`User docs updated: ${userUpdated}`);
  console.log(`User docs unchanged: ${userUnchanged}`);
  console.log(`User docs missing: ${userMissing}`);
  if (args.deleteSource) {
    console.log(`Source files deleted: ${deletedSource}`);
  }
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
