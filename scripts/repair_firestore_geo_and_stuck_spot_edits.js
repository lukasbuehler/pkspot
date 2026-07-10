const admin = require("firebase-admin");
const path = require("node:path");

const APPLY = process.argv.includes("--apply");
const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || "./scripts/serviceAccountKey.json";
const BUG_FRAGMENT = 'Cannot use "undefined" as a Firestore value';

const serviceAccount = require(path.resolve(process.cwd(), SERVICE_ACCOUNT_PATH));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();
const { FieldValue, GeoPoint } = admin.firestore;

function isGeoPoint(value) {
  return value instanceof GeoPoint;
}

function readPoint(value) {
  if (!value || typeof value !== "object") return null;
  if (isGeoPoint(value)) {
    return { kind: "geopoint", lat: value.latitude, lng: value.longitude };
  }

  const lat = value.lat ?? value.latitude ?? value._latitude;
  const lng = value.lng ?? value.longitude ?? value._longitude;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { kind: "plain", lat, lng };
  }
  return null;
}

function toGeoPoint(value) {
  const point = readPoint(value);
  return point ? new GeoPoint(point.lat, point.lng) : null;
}

function toRawPoint(value) {
  const point = readPoint(value);
  return point ? { lat: point.lat, lng: point.lng } : null;
}

function normalizeSpotGeoUpdate(data) {
  const update = {};

  if (data.location !== undefined) {
    const location = toGeoPoint(data.location);
    if (location) {
      update.location = location;
      update.location_raw = data.location_raw ?? toRawPoint(location);
    }
  }

  if (Array.isArray(data.bounds)) {
    const bounds = data.bounds.map(toGeoPoint);
    if (bounds.every(Boolean)) {
      update.bounds = bounds;
      update.bounds_raw = data.bounds_raw ?? data.bounds.map(toRawPoint);
    }
  }

  if (data.bounds_center !== undefined) {
    const center = toGeoPoint(data.bounds_center);
    if (center) update.bounds_center = center;
  }

  return update;
}

function buildNestedMergeUpdate(field, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { [field]: value };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [`${field}.${key}`, entry]),
  );
}

function normalizeEditSpotUpdate(editData) {
  const rawData = editData.data ?? {};
  const update = {};

  for (const [key, value] of Object.entries(rawData)) {
    if (key === "external_references" || key === "amenities") {
      Object.assign(update, buildNestedMergeUpdate(key, value));
    } else {
      update[key] = value;
    }
  }

  Object.assign(update, normalizeSpotGeoUpdate(rawData));

  if (editData.type === "CREATE") {
    if (update.source === undefined) update.source = "pkspot";
    if (update.is_iconic === undefined) update.is_iconic = false;
  }

  return update;
}

function editSortValue(edit) {
  const data = edit.data();
  if (Number.isFinite(data.timestamp_raw_ms)) return data.timestamp_raw_ms;
  const timestamp = data.timestamp;
  if (timestamp && typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }
  return 0;
}

function mediaAddedCount(editData) {
  return Array.isArray(editData.data?.media) ? editData.data.media.length : 0;
}

async function loadBadSpotGeoDocs() {
  const seen = new Map();
  const queries = [
    db
      .collection("spots")
      .where("bounds_center", "!=", null)
      .select("bounds_center", "bounds", "bounds_raw", "bounds_radius_m"),
    db
      .collection("spots")
      .where("bounds", "!=", null)
      .select("bounds_center", "bounds", "bounds_raw", "bounds_radius_m"),
  ];

  for (const query of queries) {
    const snapshot = await query.get();
    for (const doc of snapshot.docs) {
      seen.set(doc.id, doc);
    }
  }

  return [...seen.values()].filter((doc) => {
    const data = doc.data();
    const center = readPoint(data.bounds_center);
    const badCenter =
      data.bounds_center !== undefined &&
      data.bounds_center !== null &&
      (!center || center.kind !== "geopoint");
    const badBounds =
      Array.isArray(data.bounds) &&
      data.bounds.some((point) => {
        const parsed = readPoint(point);
        return !parsed || parsed.kind !== "geopoint";
      });
    return badCenter || badBounds;
  });
}

async function repairSpotGeoDocs() {
  const badSpotDocs = await loadBadSpotGeoDocs();
  let updated = 0;

  for (const doc of badSpotDocs) {
    const update = normalizeSpotGeoUpdate(doc.data());
    console.log(`${APPLY ? "Repairing" : "Would repair"} ${doc.ref.path}`, {
      fields: Object.keys(update),
    });
    if (APPLY && Object.keys(update).length > 0) {
      await doc.ref.update(update);
      updated++;
    }
  }

  return { candidates: badSpotDocs.length, updated };
}

async function loadBuggedPendingEdits() {
  const snapshot = await db
    .collectionGroup("edits")
    .where("target_type", "==", "spot")
    .where("approved", "==", false)
    .select(
      "type",
      "approved",
      "visibility",
      "review_status",
      "processing_status",
      "blocked_reason",
      "timestamp",
      "timestamp_raw_ms",
      "data",
      "user",
    )
    .limit(500)
    .get();

  return snapshot.docs
    .filter((doc) => {
      const data = doc.data();
      return (
        data.review_status === undefined &&
        typeof data.blocked_reason === "string" &&
        data.blocked_reason.includes(BUG_FRAGMENT)
      );
    })
    .sort((left, right) => editSortValue(left) - editSortValue(right));
}

async function approveBuggedPendingEdits() {
  const editDocs = await loadBuggedPendingEdits();
  let approved = 0;

  for (const editDoc of editDocs) {
    const spotRef = editDoc.ref.parent.parent;
    if (!spotRef || spotRef.parent.id !== "spots") {
      console.warn("Skipping edit outside spots/{spotId}/edits/{editId}", {
        path: editDoc.ref.path,
      });
      continue;
    }

    const editData = editDoc.data();
    const spotUpdate = normalizeEditSpotUpdate(editData);
    const userId = editData.user?.uid;

    console.log(`${APPLY ? "Approving" : "Would approve"} ${editDoc.ref.path}`, {
      spotPath: spotRef.path,
      type: editData.type,
      spotFields: Object.keys(spotUpdate),
      userId,
    });

    if (!APPLY) continue;

    await spotRef.update(spotUpdate);
    await editDoc.ref.update({
      approved: true,
      visibility: "public",
      processing_status: "APPROVED_AFTER_DEPLOY_FIX",
      blocked_reason: FieldValue.delete(),
      processed_at: FieldValue.serverTimestamp(),
      decision_at: FieldValue.serverTimestamp(),
    });

    if (typeof userId === "string") {
      const userUpdate = {
        spot_edits_count: FieldValue.increment(1),
      };
      if (editData.type === "CREATE") {
        userUpdate.spot_creates_count = FieldValue.increment(1);
      }
      const mediaCount = mediaAddedCount(editData);
      if (mediaCount > 0) {
        userUpdate.media_added_count = FieldValue.increment(mediaCount);
      }
      await db.collection("users").doc(userId).set(userUpdate, { merge: true });
    }

    approved++;
  }

  return { candidates: editDocs.length, approved };
}

async function main() {
  console.log(
    `${APPLY ? "Applying" : "Dry-running"} production Firestore repair for ${serviceAccount.project_id}`,
  );

  const spotGeo = await repairSpotGeoDocs();
  const pendingEdits = await approveBuggedPendingEdits();

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        spotGeo,
        pendingEdits,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await admin.app().delete();
  });
