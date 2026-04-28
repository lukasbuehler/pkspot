import admin from "firebase-admin";

const DEFAULT_SOURCE = "parkour-spots-czechia";
const DEFAULT_LANGUAGE = "cs";
const DEFAULT_PATTERN = "^(?:\\d+\\)\\s*)?(.*)$";
const BATCH_SIZE = 400;

type NameValue = string | { text?: unknown };
type SpotNameMap = Record<string, NameValue | undefined>;

interface ScriptOptions {
  source: string;
  language: string;
  pattern: string;
  force: boolean;
  rebuildClusters: boolean;
}

function getOptionValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = args.indexOf(`--${name}`);
  if (index >= 0) {
    return args[index + 1];
  }

  return undefined;
}

function parseOptions(): ScriptOptions {
  const args = process.argv.slice(2);
  return {
    source: getOptionValue(args, "source") ?? DEFAULT_SOURCE,
    language: getOptionValue(args, "language") ?? DEFAULT_LANGUAGE,
    pattern: getOptionValue(args, "pattern") ?? DEFAULT_PATTERN,
    force: args.includes("--force"),
    rebuildClusters: args.includes("--rebuild-clusters"),
  };
}

function nameText(value: NameValue | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.text === "string"
  ) {
    return value.text;
  }

  return null;
}

function applyNameRegex(name: string, regex: RegExp): string | null {
  regex.lastIndex = 0;
  const matches = regex.exec(name);
  if (!matches) {
    return null;
  }

  const nextName = (matches[1] ?? matches[0]).trim();
  return nextName.length > 0 ? nextName : null;
}

function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return;
  }

  admin.initializeApp({
    projectId: "parkour-base-project",
  });
}

async function fixCzechiaImportNames() {
  const options = parseOptions();
  const regex = new RegExp(options.pattern);

  initializeFirebaseAdmin();

  const db = admin.firestore();
  const spotsRef = db
    .collection("spots")
    .where("source", "==", options.source);

  console.log(
    `${options.force ? "LIVE" : "DRY RUN"}: fixing spots from source ${
      options.source
    }, writing names to ${options.language}.`
  );

  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let processedCount = 0;
  let updateCount = 0;
  let skippedCount = 0;
  const examples: string[] = [];

  while (true) {
    let query = spotsRef.limit(BATCH_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    let batchUpdates = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const name = (data["name"] ?? {}) as SpotNameMap;
      const englishName = nameText(name["en"]);
      const currentTargetName = nameText(name[options.language]);
      const sourceName = englishName ?? currentTargetName;

      processedCount++;
      lastDoc = doc;

      if (!sourceName) {
        skippedCount++;
        continue;
      }

      const nextName = applyNameRegex(sourceName, regex);
      if (!nextName) {
        skippedCount++;
        continue;
      }

      const shouldDeleteEnglish = englishName !== null;
      const shouldUpdateTarget = currentTargetName !== nextName;
      if (!shouldDeleteEnglish && !shouldUpdateTarget) {
        continue;
      }

      updateCount++;
      batchUpdates++;
      if (examples.length < 20) {
        examples.push(`${doc.id}: ${sourceName} -> ${nextName}`);
      }

      if (options.force) {
        const update: admin.firestore.UpdateData<admin.firestore.DocumentData> =
          {
            [`name.${options.language}`]: nextName,
            time_updated: admin.firestore.FieldValue.serverTimestamp(),
          };

        if (shouldDeleteEnglish) {
          update["name.en"] = admin.firestore.FieldValue.delete();
        }

        batch.update(doc.ref, update);
      }
    }

    if (options.force && batchUpdates > 0) {
      await batch.commit();
    }

    console.log(
      `Processed ${processedCount}; ${
        options.force ? "updated" : "would update"
      } ${updateCount}; skipped ${skippedCount}.`
    );
  }

  console.log("Done.");
  console.log(
    `${options.force ? "Updated" : "Would update"} ${updateCount} of ${processedCount} matching spots.`
  );
  if (options.force && (updateCount > 0 || options.rebuildClusters)) {
    const runRef = db.collection("spot_clusters").doc("run");
    const runSnap = await runRef.get();
    if (runSnap.exists) {
      await runRef.delete();
    }
    await runRef.set({
      triggered_by: "czechia-import-name-fix",
      import_source: options.source,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log("Triggered spot cluster rebuild.");
  }
  if (examples.length > 0) {
    console.log("Examples:");
    examples.forEach((example) => console.log(`- ${example}`));
  }
  if (!options.force) {
    console.log("No changes were written. Re-run with --force to apply.");
  }
}

fixCzechiaImportNames().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
