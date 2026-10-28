const fs = require("node:fs");
const path = require("node:path");

// Match logical assets, not generated sizes or archived source copies. URLs
// are parsed locally; no media is downloaded and signed query strings are kept
// out of reports. Unknown buckets never count as a reference to this bucket.
function logicalStoragePath(value, bucket) {
  if (typeof value !== "string") return null;
  let objectPath = value;
  if (value.startsWith("gs://")) {
    if (!value.startsWith(`gs://${bucket}/`)) return null;
    objectPath = value.slice(bucket.length + 6);
  } else if (value.startsWith("https://")) {
    let url;
    try { url = new URL(value); } catch { return null; }
    if (url.hostname === "firebasestorage.googleapis.com") {
      const prefix = `/v0/b/${bucket}/o/`;
      if (!url.pathname.startsWith(prefix)) return null;
      try { objectPath = decodeURIComponent(url.pathname.slice(prefix.length)); } catch { return null; }
    } else if (url.hostname === "storage.googleapis.com") {
      const prefix = `/${bucket}/`;
      if (!url.pathname.startsWith(prefix)) return null;
      objectPath = decodeURIComponent(url.pathname.slice(prefix.length));
    } else return null;
  }
  if (!/^(?:resized_originals\/)?(?:spot_pictures|profile_pictures|post_media|event_media|organization_media|challenges)\//.test(objectPath)) return null;
  return objectPath.replace(/^resized_originals\//, "").replace(/_\d+x\d+(?=\.[^/.]+$|$)/, "");
}

async function auditMediaReferences(outputPath) {
  const admin = require("firebase-admin");
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "scripts/serviceAccountKey.json";
  const key = JSON.parse(fs.readFileSync(path.resolve(keyPath), "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
  const db = admin.firestore();
  const bucketName = `${key.project_id}.appspot.com`;
  const bucket = admin.storage().bucket(bucketName);
  const assets = new Map();
  const references = new Map();
  const entities = new Map();
  const users = new Set();
  const scans = {};

  function indexValue(value, documentPath) {
    if (typeof value === "string") {
      const logical = logicalStoragePath(value, bucketName);
      if (logical) {
        if (!references.has(logical)) references.set(logical, new Set());
        references.get(logical).add(documentPath);
        entities.get(documentPath).add(logical);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item) => indexValue(item, documentPath));
    } else if (value && typeof value === "object") {
      Object.values(value).forEach((item) => indexValue(item, documentPath));
    }
  }

  // Include other public media surfaces to avoid labelling a valid Event,
  // organization, post, or challenge photo as an unattached Spot photo.
  for (const [collection, fields, group] of [
    ["spots", ["media"]], ["users", ["profile_picture"]],
    ["events", ["media", "banner_src", "logo_src", "sponsor", "inline_spots", "program", "featured_participants"]],
    ["organizations", ["logo_url"]],
    ["posts", ["media"]], ["challenges", ["media", "top_posts"], true],
  ]) {
    let count = 0;
    const query = (group ? db.collectionGroup(collection) : db.collection(collection)).select(...fields);
    for await (const doc of query.stream()) {
      count++;
      entities.set(doc.ref.path, new Set());
      if (collection === "users") users.add(doc.id);
      indexValue(doc.data(), doc.ref.path);
    }
    scans[collection] = count;
    console.log(`Read ${count} ${collection} records`);
  }

  let storageObjectCount = 0;
  let quarantinedImageObjects = 0;
  let pageToken;
  do {
    const [files, next] = await bucket.getFiles({ autoPaginate: false, maxResults: 1000, pageToken });
    for (const file of files) {
      storageObjectCount++;
      if (file.name.startsWith("media_intake/") && file.metadata.contentType?.startsWith("image/")) quarantinedImageObjects++;
      const logical = logicalStoragePath(file.name, bucketName);
      if (!logical || !file.metadata.contentType?.startsWith("image/")) continue;
      if (!assets.has(logical)) assets.set(logical, { path: logical, objects: [], owner_uids: [], upload_ids: [] });
      const asset = assets.get(logical);
      asset.objects.push({ path: file.name, bytes: Number(file.metadata.size), created_at: file.metadata.timeCreated });
      const metadata = file.metadata.metadata ?? {};
      if (metadata.uid && !asset.owner_uids.includes(metadata.uid)) asset.owner_uids.push(metadata.uid);
      if (metadata.upload_id && !asset.upload_ids.includes(metadata.upload_id)) asset.upload_ids.push(metadata.upload_id);
    }
    pageToken = next?.pageToken;
  } while (pageToken);

  const approvedUploads = [];
  for await (const review of db.collection("media_upload_reviews").where("source", "==", "upload").stream()) {
    const data = review.data();
    if (data.status !== "approved" || data.incident_path) continue;
    const logical = logicalStoragePath(data.approved_path, bucketName);
    if (logical && data.target_kind === "spot" && data.target_id &&
        !entities.get(`spots/${data.target_id}`)?.has(logical)) {
      approvedUploads.push({ review_id: review.id, path: logical, uid: data.uid,
        spot_id: data.target_id, uploaded_at_ms: data.created_at?.toMillis?.() ?? 0,
        file_present: assets.has(logical), target_exists: entities.has(`spots/${data.target_id}`),
        current_references: [...(references.get(logical) ?? [])] });
    }
  }
  const historyBySpot = new Map();
  for (const candidate of approvedUploads) {
    if (!historyBySpot.has(candidate.spot_id)) {
      const edits = await db.collection(`spots/${candidate.spot_id}/edits`)
        .select("approved", "data.media", "modification_type", "timestamp_raw_ms", "timestamp").get();
      historyBySpot.set(candidate.spot_id, edits.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    }
    const edits = historyBySpot.get(candidate.spot_id);
    candidate.approved_edit_ids = edits.filter((edit) => edit.approved && Array.isArray(edit.data?.media) &&
      edit.data.media.some((media) => logicalStoragePath(media.src, bucketName) === candidate.path))
      .map((edit) => edit.id);
    candidate.later_media_overwrite_ids = edits.filter((edit) => edit.approved &&
      edit.modification_type === "OVERWRITE" && Array.isArray(edit.data?.media) &&
      (edit.timestamp_raw_ms ?? edit.timestamp?.toMillis?.() ?? 0) > candidate.uploaded_at_ms &&
      !edit.data.media.some((media) => logicalStoragePath(media.src, bucketName) === candidate.path))
      .map((edit) => edit.id);
  }
  const unreferenced = [...assets.values()].filter((asset) => !references.has(asset.path))
    .map((asset) => ({ ...asset, existing_owner_uids: asset.owner_uids.filter((uid) => users.has(uid)) }));
  const report = {
    generated_at: new Date().toISOString(), project_id: key.project_id, mode: "read_only",
    limitations: [
      "No deletion or relinking is authorized by this report.",
      "Absence from current references does not prove a lost photo: removals, old avatars and unknown legacy references need review.",
      "Moderation actions, duplicate merges and deletion records must be checked before restoring any candidate.",
      "Only the listed media-bearing fields and recognized Storage paths are indexed.",
    ],
    summary: { scanned_documents: scans, storage_objects: storageObjectCount,
      quarantined_image_objects: quarantinedImageObjects,
      logical_image_assets: assets.size, currently_referenced_assets: [...assets.keys()].filter((key) => references.has(key)).length,
      unreferenced_assets: unreferenced.length, unreferenced_with_existing_owner: unreferenced.filter((asset) => asset.existing_owner_uids.length).length,
      approved_spot_uploads_absent_from_target: approvedUploads.length,
      present_candidates_without_later_media_overwrite: approvedUploads.filter((item) => item.file_present && item.target_exists &&
        item.approved_edit_ids.length && !item.later_media_overwrite_ids.length).length },
    approved_spot_uploads_absent_from_target: approvedUploads,
    unreferenced_assets: unreferenced,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.summary));
  await admin.app().delete();
}

module.exports = { logicalStoragePath };
if (require.main === module) {
  const output = process.argv[2];
  if (!output) throw new Error("Usage: node scripts/audit-media-references.cjs <private-output.json>");
  auditMediaReferences(path.resolve(output)).catch((error) => { console.error(error.message); process.exit(1); });
}
