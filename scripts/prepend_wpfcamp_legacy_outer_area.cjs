const admin = require("firebase-admin");
const path = require("path");

const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
  });
}

const db = admin.firestore();

const eventId = "wpfcamp";
const legacyOuterRing = {
  points: [
    { lat: 0, lng: -90 },
    { lat: 0, lng: 90 },
    { lat: 90, lng: -90 },
    { lat: 90, lng: 90 },
  ],
};

function samePoint(a, b) {
  return a?.lat === b.lat && a?.lng === b.lng;
}

function isLegacyOuterRing(value) {
  const points = value?.points;
  return (
    Array.isArray(points) &&
    points.length === legacyOuterRing.points.length &&
    points.every((point, index) => samePoint(point, legacyOuterRing.points[index]))
  );
}

async function main() {
  const isDryRun = !process.argv.includes("--force");
  const eventRef = db.collection("events").doc(eventId);
  const snapshot = await eventRef.get();

  if (!snapshot.exists) {
    throw new Error(`events/${eventId} does not exist`);
  }

  const data = snapshot.data() ?? {};
  const currentAreaPolygon = Array.isArray(data.area_polygon)
    ? data.area_polygon
    : [];
  const withoutExistingLegacyOuter = currentAreaPolygon.filter(
    (ring) => !isLegacyOuterRing(ring)
  );
  const nextAreaPolygon = [legacyOuterRing, ...withoutExistingLegacyOuter];

  console.log(
    JSON.stringify(
      {
        eventId,
        dryRun: isDryRun,
        currentRingCount: currentAreaPolygon.length,
        nextRingCount: nextAreaPolygon.length,
        currentFirstIsLegacyOuter: isLegacyOuterRing(currentAreaPolygon[0]),
      },
      null,
      2
    )
  );

  if (isDryRun) {
    console.log("Dry run only. Re-run with --force to write.");
    return;
  }

  await eventRef.update({ area_polygon: nextAreaPolygon });
  console.log(`Updated events/${eventId}.area_polygon`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
