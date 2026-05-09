const admin = require("firebase-admin");

const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT;

if (!projectId) {
  console.error(
    "Set GCLOUD_PROJECT, GOOGLE_CLOUD_PROJECT, or FIREBASE_PROJECT before requesting a community rebuild."
  );
  process.exit(1);
}

admin.initializeApp({ projectId });

const db = admin.firestore();
const { FieldValue } = admin.firestore;

async function main() {
  await db.collection("maintenance").doc("run-rebuild-community-pages").set(
    {
      requested_at: FieldValue.serverTimestamp(),
      requested_by: "request_community_rebuild.js",
    },
    { merge: true }
  );

  console.log(
    `Requested community page rebuild for ${projectId}. Watch maintenance/run-rebuild-community-pages for status DONE.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void admin.app().delete();
  });
