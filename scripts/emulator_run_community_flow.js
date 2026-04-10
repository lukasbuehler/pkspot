const admin = require("firebase-admin");

process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-pkspot";

admin.initializeApp({
  projectId: process.env.GCLOUD_PROJECT,
});

const db = admin.firestore();
const { GeoPoint, Timestamp, FieldValue } = admin.firestore;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function deleteCollection(collectionName) {
  while (true) {
    const snapshot = await db.collection(collectionName).limit(200).get();
    if (snapshot.empty) {
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function waitFor(predicate, label, timeoutMs = 30000, intervalMs = 500) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const value = await predicate();
    if (value) {
      return value;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

function buildSpotSeed({
  id,
  name,
  lat,
  lng,
  locality,
  regionCode,
  regionName,
  countryCode,
  countryName,
  rating,
  numReviews,
  covered = false,
}) {
  const now = Timestamp.now();

  return {
    id,
    data: {
      name: { en: name },
      location: new GeoPoint(lat, lng),
      location_raw: { lat, lng },
      address: {
        formatted: `${locality}, ${regionName}, ${countryName}`,
        locality,
        region: {
          code: regionCode,
          name: regionName,
        },
        country: {
          code: countryCode,
          name: countryName,
        },
      },
      rating,
      num_reviews: numReviews,
      amenities: covered ? { covered: true } : {},
      type: covered ? "parkour gym" : "urban landscape",
      time_created: now,
      time_updated: now,
      media: [],
    },
  };
}

function buildSeedSpots() {
  const spots = [];

  for (let index = 0; index < 5; index += 1) {
    spots.push(
      buildSpotSeed({
        id: `zh-zurich-${index + 1}`,
        name: `Zurich Spot ${index + 1}`,
        lat: 47.3769 + index * 0.001,
        lng: 8.5417 + index * 0.001,
        locality: "Zurich",
        regionCode: "ZH",
        regionName: "Zurich",
        countryCode: "CH",
        countryName: "Switzerland",
        rating: 4.9 - index * 0.1,
        numReviews: 20 - index,
        covered: index % 2 === 0,
      })
    );

    spots.push(
      buildSpotSeed({
        id: `zh-pfaeffikon-${index + 1}`,
        name: `Pfaeffikon ZH Spot ${index + 1}`,
        lat: 47.3688 + index * 0.0006,
        lng: 8.7854 + index * 0.0006,
        locality: "Pfaffikon",
        regionCode: "ZH",
        regionName: "Zurich",
        countryCode: "CH",
        countryName: "Switzerland",
        rating: 4.7 - index * 0.08,
        numReviews: 16 - index,
        covered: index % 2 === 1,
      })
    );

    spots.push(
      buildSpotSeed({
        id: `sz-pfaeffikon-${index + 1}`,
        name: `Pfaeffikon SZ Spot ${index + 1}`,
        lat: 47.2018 + index * 0.0006,
        lng: 8.7785 + index * 0.0006,
        locality: "Pfaffikon",
        regionCode: "SZ",
        regionName: "Schwyz",
        countryCode: "CH",
        countryName: "Switzerland",
        rating: 4.6 - index * 0.08,
        numReviews: 14 - index,
        covered: index % 2 === 0,
      })
    );

    spots.push(
      buildSpotSeed({
        id: `fr-paris-${index + 1}`,
        name: `Paris Spot ${index + 1}`,
        lat: 48.8566 + index * 0.001,
        lng: 2.3522 + index * 0.001,
        locality: "Paris",
        regionCode: "IDF",
        regionName: "Ile-de-France",
        countryCode: "FR",
        countryName: "France",
        rating: 4.8 - index * 0.07,
        numReviews: 18 - index,
        covered: index % 2 === 0,
      })
    );
  }

  return spots;
}

async function seedSpots() {
  const batch = db.batch();
  for (const spot of buildSeedSpots()) {
    batch.set(db.collection("spots").doc(spot.id), spot.data);
  }
  await batch.commit();
}

async function fetchCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function main() {
  console.log("Resetting emulator collections...");
  await deleteCollection("community_slugs");
  await deleteCollection("community_pages");
  await deleteCollection("maintenance");
  await deleteCollection("spots");

  console.log("Seeding spots...");
  await seedSpots();

  console.log("Waiting for derived landing fields on spots...");
  await waitFor(async () => {
    const spots = await fetchCollection("spots");
    const readySpots = spots.filter((spot) => spot.landing?.countryCode);
    return readySpots.length >= 20 ? readySpots : null;
  }, "spot derived fields");

  console.log("Triggering localized address backfill...");
  await db.collection("maintenance").doc("run-update-addresses").set({
    created_at: FieldValue.serverTimestamp(),
  });

  await waitFor(async () => {
    const triggerDoc = await db
      .collection("maintenance")
      .doc("run-update-addresses")
      .get();
    if (!triggerDoc.exists) {
      return true;
    }

    const data = triggerDoc.data();
    return data?.status === "DONE" || data?.status === "DONE_WITH_ERRORS"
      ? data
      : null;
  }, "address backfill completion", 30000, 1000);

  const refreshedSpots = await fetchCollection("spots");
  const localizedSpotCount = refreshedSpots.filter(
    (spot) =>
      spot.address?.localityLocal ||
      spot.address?.country?.localName ||
      spot.address?.region?.localName
  ).length;

  console.log(`Localized spots after backfill: ${localizedSpotCount}`);

  console.log("Triggering manual community rebuild...");
  await db.collection("maintenance").doc("run-rebuild-community-pages").set({
    created_at: FieldValue.serverTimestamp(),
  });

  await waitFor(async () => {
    const triggerDoc = await db
      .collection("maintenance")
      .doc("run-rebuild-community-pages")
      .get();
    const data = triggerDoc.data();
    return data?.status === "DONE" ? data : null;
  }, "community rebuild completion", 30000, 1000);

  const communityPages = await fetchCollection("community_pages");
  const communitySlugs = await fetchCollection("community_slugs");

  const pageSummaries = communityPages
    .filter((page) => !String(page.id).startsWith("run-"))
    .map((page) => ({
      id: page.id,
      scope: page.scope,
      displayName: page.displayName,
      preferredSlug: page.preferredSlug,
      totalSpots: page.counts?.totalSpots,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const slugSummaries = communitySlugs
    .map((slug) => ({
      slug: slug.id,
      communityKey: slug.communityKey,
      isPreferred: slug.isPreferred,
    }))
    .sort((left, right) => String(left.slug).localeCompare(String(right.slug)));

  console.log("Community pages:");
  console.table(pageSummaries);

  console.log("Community slugs:");
  console.table(slugSummaries);

  const zhSlug = slugSummaries.find((slug) => slug.slug === "pfaeffikon-zh");
  const zhPreferredSlug = slugSummaries.find((slug) => slug.slug === "pfaeffikon");
  const szSlug = slugSummaries.find((slug) => slug.slug === "pfaeffikon-sz");

  if (!zhSlug || !zhPreferredSlug || !szSlug) {
    throw new Error(
      "Expected pfaeffikon, pfaeffikon-zh, and pfaeffikon-sz slugs to exist."
    );
  }

  if (zhPreferredSlug.communityKey !== "locality:ch:zh:pfaffikon") {
    throw new Error("Expected pfaeffikon to point to the ZH community.");
  }

  const unexpectedRuntimePageDoc = communityPages.find((page) =>
    String(page.id).startsWith("run-")
  );

  if (unexpectedRuntimePageDoc) {
    throw new Error(
      `Unexpected runtime document found in community_pages: ${unexpectedRuntimePageDoc.id}`
    );
  }

  const maintenanceDocs = await fetchCollection("maintenance");
  const rebuildDoc = maintenanceDocs.find(
    (doc) => doc.id === "run-rebuild-community-pages"
  );

  if (!rebuildDoc || rebuildDoc.status !== "DONE") {
    throw new Error("Expected maintenance rebuild document to finish with DONE.");
  }

  console.log("Emulator community flow completed successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
