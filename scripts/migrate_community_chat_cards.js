const admin = require("firebase-admin");

const APPLY = process.argv.includes("--apply");
const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT;

if (!projectId) {
  console.error(
    "Set GCLOUD_PROJECT, GOOGLE_CLOUD_PROJECT, or FIREBASE_PROJECT before migrating community chat cards."
  );
  process.exit(1);
}

admin.initializeApp({ projectId });

const db = admin.firestore();

function hasSignedInOnlyCta(card) {
  return (
    card &&
    typeof card === "object" &&
    card.cta &&
    card.cta.target === "url" &&
    (card.ctaVisibility === "signed-in" ||
      (card.ctaVisibility !== "public" && card.category === "chat"))
  );
}

function publicCommunityInfoCard(card) {
  if (!hasSignedInOnlyCta(card)) {
    return card;
  }

  const { cta: _cta, ...publicCard } = card;
  return {
    ...publicCard,
    ctaVisibility: "signed-in",
  };
}

function mergePrivateCards(existingCards, chatCards) {
  const merged = [...existingCards];
  const seenIds = new Set(merged.map((card) => card.id).filter(Boolean));

  for (const card of chatCards) {
    if (card.id && seenIds.has(card.id)) {
      continue;
    }
    if (card.id) {
      seenIds.add(card.id);
    }
    merged.push(card);
  }

  return merged;
}

async function main() {
  const pages = await db.collection("community_pages").get();
  let touched = 0;
  let movedCards = 0;

  for (const page of pages.docs) {
    const data = page.data();
    const infoCards = Array.isArray(data.infoCards) ? data.infoCards : [];
    const privateCardsFromPublic = infoCards.filter(hasSignedInOnlyCta);
    if (privateCardsFromPublic.length === 0) {
      continue;
    }

    const publicCards = infoCards.map(publicCommunityInfoCard);
    const privateRef = page.ref.collection("private_info").doc("link_cards");
    const privateSnapshot = await privateRef.get();
    const privateData = privateSnapshot.data() || {};
    const existingPrivateCards = Array.isArray(privateData.infoCards)
      ? privateData.infoCards
      : [];
    const privateCards = mergePrivateCards(
      existingPrivateCards,
      privateCardsFromPublic
    );

    touched += 1;
    movedCards += privateCardsFromPublic.length;

    console.log(
      `${APPLY ? "Migrating" : "Would migrate"} ${privateCardsFromPublic.length} signed-in-only link card(s) for ${page.id}.`
    );

    if (!APPLY) {
      continue;
    }

    const batch = db.batch();
    batch.update(page.ref, { infoCards: publicCards });
    batch.set(privateRef, { infoCards: privateCards }, { merge: true });
    await batch.commit();
  }

  console.log(
    `${APPLY ? "Migrated" : "Dry run found"} ${movedCards} chat card(s) across ${touched} community page(s).`
  );
  if (!APPLY) {
    console.log("Run again with --apply to write the migration.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void admin.app().delete();
  });
