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
const DEFAULT_WAIT_TIMEOUT_MS = 30000;
const COMMUNITY_MERGE_WAIT_TIMEOUT_MS = 90000;

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

async function waitFor(predicate, label, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS, intervalMs = 500) {
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
  media = [],
  boundsRaw,
}) {
  const now = Timestamp.now();

  const data = {
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
      media,
  };

  if (boundsRaw) {
    data.bounds_raw = boundsRaw;
    data.bounds = boundsRaw.map((point) => new GeoPoint(point.lat, point.lng));
  }

  return {
    id,
    data,
  };
}

function distanceMeters(left, right) {
  const earthRadiusM = 6371000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLng = toRadians(right.lng - left.lng);
  const leftLat = toRadians(left.lat);
  const rightLat = toRadians(right.lat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLng / 2) ** 2;

  return (
    2 *
    earthRadiusM *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function spotFootprintPoints(spot) {
  return [
    spot.location_raw,
    ...(spot.bounds_raw ?? []),
  ].filter(
    (point) =>
      point &&
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lng)
  );
}

function assertCommunityRadiusContainsSpots(page, spots, label) {
  const [lat, lng] = page.bounds_center ?? [];
  const radiusM = page.bounds_radius_m;

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(radiusM)
  ) {
    throw new Error(`${label} is missing finite community bounds.`);
  }

  const center = { lat, lng };
  const outside = [];

  for (const spot of spots) {
    for (const point of spotFootprintPoints(spot)) {
      const distanceM = distanceMeters(center, point);
      if (distanceM > radiusM + 1) {
        outside.push({
          spotId: spot.id,
          point,
          distanceM: Math.round(distanceM),
          radiusM,
        });
      }
    }
  }

  if (outside.length > 0) {
    throw new Error(
      `${label} radius does not contain all member spot footprint points: ${JSON.stringify(outside)}`
    );
  }
}

function assertCommunityPicksPreferMediaButUseFallback(page) {
  const standoutSection = page.communityPicks?.find(
    (section) => section.category === "standout"
  );

  if (!standoutSection) {
    throw new Error("Expected Zurich community picks to include standout spots.");
  }

  const spotIds = standoutSection.spots.map((spot) => spot.id);
  if (spotIds[0] !== "zh-zurich-1") {
    throw new Error(
      `Expected media-backed Zurich spot to rank first in community picks, got ${spotIds.join(", ")}.`
    );
  }

  if (!standoutSection.spots.some((spot) => !spot.imageSrc)) {
    throw new Error(
      "Expected community picks to include media-less spots when not enough media-backed spots are available."
    );
  }
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
        media:
          index === 0
            ? [
                {
                  type: "image",
                  src: "https://example.test/zurich-spot-1.jpg",
                  isInStorage: false,
                },
              ]
            : [],
        boundsRaw:
          index === 4
            ? [
                { lat: 47.3809, lng: 8.5457 },
                { lat: 47.3809, lng: 8.5857 },
                { lat: 47.3909, lng: 8.5857 },
              ]
            : undefined,
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
  await deleteCollection("community_merges");
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

  const zurichPage = communityPages.find(
    (page) => page.id === "locality:ch:zh:zurich"
  );
  if (!zurichPage) {
    throw new Error("Expected Zurich locality community page to exist.");
  }

  const zurichSpots = (await fetchCollection("spots")).filter((spot) =>
    String(spot.id).startsWith("zh-zurich-")
  );
  assertCommunityRadiusContainsSpots(
    zurichPage,
    zurichSpots,
    "Zurich locality community"
  );
  assertCommunityPicksPreferMediaButUseFallback(zurichPage);

  const maintenanceDocs = await fetchCollection("maintenance");
  const rebuildDoc = maintenanceDocs.find(
    (doc) => doc.id === "run-rebuild-community-pages"
  );

  if (!rebuildDoc || rebuildDoc.status !== "DONE") {
    throw new Error("Expected maintenance rebuild document to finish with DONE.");
  }

  console.log("Testing configurable community merge patching...");
  await db
    .collection("community_pages")
    .doc("locality:ch:zh:pfaffikon")
    .set(
      {
        infoCards: [
          {
            id: "local-chat",
            title: { en: "Pfaffikon chat" },
            category: "chat",
            visibility: "public",
          },
        ],
        merge_into: {
          target_community_key: "locality:ch:zh:zurich",
          info_cards: "move",
          status: "pending",
        },
      },
      { merge: true }
    );

  await waitFor(async () => {
    const mergeDoc = await db
      .collection("community_merges")
      .doc("locality:ch:zh:pfaffikon")
      .get();
    return mergeDoc.data()?.status === "active" ? mergeDoc.data() : null;
  }, "community merge patch completion", COMMUNITY_MERGE_WAIT_TIMEOUT_MS, 1000);

  await waitFor(async () => {
    const mergeDoc = await db.collection("maintenance").doc("last-community-merge").get();
    return mergeDoc.data()?.status === "DONE" ? mergeDoc.data() : null;
  }, "community merge rebuild completion", COMMUNITY_MERGE_WAIT_TIMEOUT_MS, 1000);

  const mergedSourcePage = (
    await db.collection("community_pages").doc("locality:ch:zh:pfaffikon").get()
  ).data();
  const mergedTargetPage = (
    await db.collection("community_pages").doc("locality:ch:zh:zurich").get()
  ).data();
  const forwardedPfaeffikonSlug = (
    await db.collection("community_slugs").doc("pfaeffikon").get()
  ).data();

  if (mergedSourcePage?.published !== false) {
    throw new Error("Expected merged source community to be unpublished.");
  }

  if (
    mergedSourcePage?.redirect_to_community_key !== "locality:ch:zh:zurich" ||
    mergedSourcePage?.merge_into?.status !== "active"
  ) {
    throw new Error("Expected merged source community to redirect to Zurich.");
  }

  if (mergedTargetPage?.counts?.totalSpots !== 10) {
    throw new Error(
      `Expected Zurich to contain merged Zurich + Pfaffikon spots, got ${mergedTargetPage?.counts?.totalSpots}.`
    );
  }

  if (
    !mergedTargetPage?.merged_community_keys?.includes("locality:ch:zh:pfaffikon") ||
    !mergedTargetPage?.search_aliases?.includes("Pfaffikon") ||
    !mergedTargetPage?.redirected_from_slugs?.includes("pfaeffikon")
  ) {
    throw new Error("Expected Zurich target page to retain merge metadata.");
  }

  if (
    !mergedTargetPage?.infoCards?.some(
      (card) =>
        card.origin_community_key === "locality:ch:zh:pfaffikon" &&
        card.title?.en === "Pfaffikon chat"
    )
  ) {
    throw new Error("Expected source info card to move into the target community.");
  }

  if (
    forwardedPfaeffikonSlug?.communityKey !== "locality:ch:zh:zurich" ||
    forwardedPfaeffikonSlug?.alias_for_community_key !== "locality:ch:zh:pfaffikon"
  ) {
    throw new Error("Expected source community slugs to forward to the target.");
  }

  console.log("Re-running manual rebuild to verify merge stability...");
  await db.collection("maintenance").doc("run-rebuild-community-pages").delete().catch(() => {});
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
  }, "second community rebuild completion", 30000, 1000);

  const stableSourcePage = (
    await db.collection("community_pages").doc("locality:ch:zh:pfaffikon").get()
  ).data();
  const stableTargetPage = (
    await db.collection("community_pages").doc("locality:ch:zh:zurich").get()
  ).data();

  if (stableSourcePage?.published !== false) {
    throw new Error("Expected merged source to remain unpublished after rebuild.");
  }

  if (
    stableTargetPage?.counts?.totalSpots !== 10 ||
    !stableTargetPage?.search_aliases?.includes("Pfaffikon")
  ) {
    throw new Error("Expected target merge behavior to remain stable after rebuild.");
  }

  console.log("Testing rejected community merge inputs...");
  await db
    .collection("community_pages")
    .doc("locality:ch:zh:zurich")
    .set(
      {
        merge_into: {
          target_community_key: "locality:ch:zh:zurich",
          info_cards: "move",
          status: "pending",
        },
      },
      { merge: true }
    );

  await waitFor(async () => {
    const page = await db
      .collection("community_pages")
      .doc("locality:ch:zh:zurich")
      .get();
    return page.data()?.merge_into?.status === "failed" ? page.data() : null;
  }, "self merge rejection", 30000, 1000);

  await db
    .collection("community_merges")
    .doc("locality:ch:sz:pfaffikon")
    .set({
      source_community_key: "locality:ch:sz:pfaffikon",
      target_community_key: "locality:ch:zh:zurich",
      status: "active",
      source_scope: "locality",
      target_scope: "locality",
      source_display_name: "Pfaffikon SZ",
      target_display_name: "Zurich",
      source_geography: {
        countryCode: "CH",
        countryName: "Switzerland",
        regionCode: "SZ",
        regionName: "Schwyz",
        regionSlug: "sz",
        localityName: "Pfaffikon",
        localitySlug: "pfaffikon",
      },
      target_geography: {
        countryCode: "CH",
        countryName: "Switzerland",
        regionCode: "ZH",
        regionName: "Zurich",
        regionSlug: "zh",
        localityName: "Zurich",
        localitySlug: "zurich",
      },
      source_slugs: ["pfaeffikon-sz"],
      source_search_aliases: ["Pfaffikon SZ"],
      info_cards: "skip",
    });

  await db
    .collection("community_pages")
    .doc("locality:ch:zh:zurich")
    .set(
      {
        merge_into: {
          target_community_key: "locality:ch:sz:pfaffikon",
          info_cards: "skip",
          status: "pending",
        },
      },
      { merge: true }
    );

  await waitFor(async () => {
    const page = await db
      .collection("community_pages")
      .doc("locality:ch:zh:zurich")
      .get();
    const merge_into = page.data()?.merge_into;
    return merge_into?.status === "failed" &&
      String(merge_into.error ?? "").includes("cycle")
      ? page.data()
      : null;
  }, "cycle merge rejection", 30000, 1000);

  console.log("Testing rebuild resilience with corrupt active merge cycles...");
  await db
    .collection("community_merges")
    .doc("locality:ch:zh:zurich")
    .set({
      source_community_key: "locality:ch:zh:zurich",
      target_community_key: "locality:ch:sz:pfaffikon",
      status: "active",
      source_scope: "locality",
      target_scope: "locality",
      source_display_name: "Zurich",
      target_display_name: "Pfaffikon SZ",
      source_geography: {
        countryCode: "CH",
        countryName: "Switzerland",
        regionCode: "ZH",
        regionName: "Zurich",
        regionSlug: "zh",
        localityName: "Zurich",
        localitySlug: "zurich",
      },
      target_geography: {
        countryCode: "CH",
        countryName: "Switzerland",
        regionCode: "SZ",
        regionName: "Schwyz",
        regionSlug: "sz",
        localityName: "Pfaffikon",
        localitySlug: "pfaffikon",
      },
      source_slugs: ["zurich"],
      source_search_aliases: ["Zurich"],
      info_cards: "skip",
    });

  await db.collection("maintenance").doc("run-rebuild-community-pages").delete().catch(() => {});
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
  }, "corrupt active-cycle rebuild completion", 30000, 1000);

  console.log("Emulator community flow completed successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
