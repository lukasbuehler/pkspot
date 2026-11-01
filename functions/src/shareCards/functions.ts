import * as admin from "firebase-admin";
import { FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_STORAGE_BUCKET } from "../storageBucket";
import { renderShareCard } from "./render";
import { cachedContentMatches, cachedMediaReferences, contentFingerprint, legacyRevisions } from "./cache";
import { collections, EntityKind, projectCard, resolveCardSource, sourceFingerprint, storageMediaPath, shareCardMediaCandidates } from "./source";

const db = admin.firestore();
const bucket = () => admin.storage().bucket(DEFAULT_STORAGE_BUCKET);
const assets = resolve(__dirname, "../../../share-card-assets");
const keyFor = (kind: EntityKind, id: string) => createHash("sha256").update(`${kind}/${id}`).digest("hex");
const sourceRef = (kind: EntityKind, id: string) => db.doc(`${collections[kind]}/${id}`);
const cardRef = (kind: EntityKind, id: string) => db.doc(`share_cards/${keyFor(kind, id)}`);
const safeId = (value: unknown): string => {
  if (typeof value !== "string" || !/^[\w:.-]{1,200}$/.test(value) || value === "." || value === "..") throw new HttpsError("invalid-argument", "Invalid reference");
  return value;
};
const safeKind = (value: unknown): EntityKind => {
  if (typeof value !== "string" || !Object.hasOwn(collections, value)) throw new HttpsError("invalid-argument", "Invalid kind");
  return value as EntityKind;
};
const imageUrl = (kind: EntityKind, id: string, revision?: string) =>
  `https://europe-west1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/shareCardImage?kind=${kind}&id=${encodeURIComponent(id)}${revision ? `&v=${revision}` : ""}`;

async function load(kind: EntityKind, id: string, transaction?: Transaction) {
  const ref = sourceRef(kind, id);
  const snapshot = await (transaction ? transaction.get(ref) : ref.get());
  const source = await resolveCardSource(kind, snapshot.data(), async (ids) => {
    const refs = ids.map((spotId) => sourceRef("spot", spotId));
    const spots = await (transaction ? transaction.getAll(...refs) : db.getAll(...refs));
    return spots.map((spot) => spot.data());
  }, bucket().name);
  const data = snapshot.data();
  return source && data ? { source, revision: sourceFingerprint(source),
    contentFingerprint: contentFingerprint(kind, data, 2), contentFingerprintV1: contentFingerprint(kind, data), legacyRevisions: legacyRevisions(kind, data, source) } : null;
}
async function removeFile(path: unknown) {
  if (typeof path === "string" && path.startsWith("share_cards/")) await bucket().file(path).delete({ ignoreNotFound: true });
}
async function mediaState(media: string[]) {
  return Promise.all(media.map(async src => {
    const path = storageMediaPath(src, bucket().name);
    if (!path) return null;
    for (const candidate of shareCardMediaCandidates(path)) {
      try {
        const [metadata] = await bucket().file(candidate).getMetadata();
        if (Number(metadata.size) > 12 * 1024 * 1024 || !metadata.contentType?.startsWith("image/")) continue;
        return { path: candidate, generation: String(metadata.generation) };
      } catch (error) {
        if ((error as { code?: number }).code !== 404) throw error;
      }
    }
    return null;
  }));
}

/** Serving and retention deliberately ignore renderer freshness. Every saved
 * photo must still be approved and have exactly the stored object generation. */
async function canServeCard(card: Record<string, unknown>, current: NonNullable<Awaited<ReturnType<typeof load>>>): Promise<boolean> {
  if (typeof card.path !== "string" || !card.path.startsWith("share_cards/") || !cachedContentMatches(card, current)) return false;
  const eligible = new Set((current.source.eligibleMedia ?? current.source.media).flatMap((src) => {
    const path = storageMediaPath(src, bucket().name);
    return path ? shareCardMediaCandidates(path) : [];
  }));
  const references = cachedMediaReferences(card.media, eligible);
  if (!references) return false;
  const valid = await Promise.all(references.map(async (item) => {
    try {
      const [metadata] = await bucket().file(item.path).getMetadata();
      return String(metadata.generation) === item.generation && Number(metadata.size) <= 12 * 1024 * 1024 && !!metadata.contentType?.startsWith("image/");
    } catch (error) {
      if ((error as {code?: number}).code !== 404) throw error;
      return false;
    }
  }));
  return valid.every(Boolean);
}

/** Preparation is an explicit user action. GET/image/crawler requests never render. */
export const prepareShareCard = onCall({ region: "europe-west1", cors: true, enforceAppCheck: true,
  timeoutSeconds: 60, memory: "512MiB", maxInstances: 3 }, async request => {
  const kind = safeKind(request.data?.kind), id = safeId(request.data?.id);
  // App Check permits signed-out sharing too; bound both account/device-network load.
  const identity = request.auth?.uid ?? request.rawRequest.ip ?? "unknown";
  const rate = db.doc(`share_card_limits/${createHash("sha256").update(identity).digest("hex")}`);
  await db.runTransaction(async tx => {
    const old = (await tx.get(rate)).data();
    const now = Date.now(), fresh = !old || now - Number(old.started) > 60_000;
    if (!fresh && Number(old.count) >= 12) throw new HttpsError("resource-exhausted", "Please try again shortly");
    tx.set(rate, { started: fresh ? now : old!.started, count: fresh ? 1 : Number(old!.count) + 1,
      expires_at: Timestamp.fromMillis(now + 86400_000) });
  });
  const current = await load(kind, id);
  if (!current) throw new HttpsError("permission-denied", "Public preview unavailable");
  const media = await mediaState(current.source.media);
  const ref = cardRef(kind, id), lease = randomUUID();
  const persistedPath = (await ref.get()).data()?.path;
  const available = typeof persistedPath === "string" && persistedPath.startsWith("share_cards/") && (await bucket().file(persistedPath).exists())[0];
  const state = await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data();
    if (available && old?.path === persistedPath && old?.revision === current.revision && JSON.stringify(media) === JSON.stringify(old.media)) {
      tx.set(ref, {content_version: 2, content_fingerprint: current.contentFingerprint}, {merge: true});
      return { reused: true, old };
    }
    if (Number(old?.lease_until) > Date.now()) throw new HttpsError("aborted", "Preview is being prepared");
    tx.set(ref, { kind, id, lease, lease_revision: current.revision, lease_until: Date.now() + 65_000 }, { merge: true });
    return { reused: false, old };
  });
  try {
    if (state.reused) {
      logger.info("share_card_reused", { kind });
      return { imageUrl: imageUrl(kind, id, current.revision), reused: true };
    }
    const photos: Buffer[] = [];
    for (const item of media) if (item) {
      // Pin the generation, avoiding a race with replacement during download.
      const [bytes] = await bucket().file(item.path, { generation: item.generation }).download();
      photos.push(bytes);
    }
    const png = await renderShareCard({ ...current.source.input, photos }, {
      fontFile: resolve(assets, "font.ttf"), logo: await readFile(resolve(assets, "logo.png")),
    });
    const path = `share_cards/${collections[kind]}/${keyFor(kind, id)}/${lease}.png`;
    await bucket().file(path).save(png, { resumable: false, metadata: { contentType: "image/png", cacheControl: "private, no-store" } });
    let published = false;
    try {
      // Recheck privacy/content and lease in one transaction before publication.
      await db.runTransaction(async tx => {
        const [latest, card] = await Promise.all([load(kind, id, tx), tx.get(ref)]);
        if (!latest || latest.revision !== current.revision || latest.contentFingerprint !== current.contentFingerprint || card.data()?.lease !== lease) throw new HttpsError("aborted", "Preview changed during preparation");
        tx.set(ref, { kind, id, revision: current.revision, content_version: 2, content_fingerprint: current.contentFingerprint, path, media, generated_at: FieldValue.serverTimestamp() });
      });
      published = true;
    } finally { if (!published) await removeFile(path); }
    await removeFile(state.old?.path);
    logger.info("share_card_generated", { kind });
    return { imageUrl: imageUrl(kind, id, current.revision), reused: false };
  } catch (error) {
    await db.runTransaction(async tx => {
      const card = await tx.get(ref);
      if (card.data()?.lease === lease) tx.update(ref, { lease_until: 0, lease: FieldValue.delete() });
    });
    logger.error("share_card_preparation_failed", { kind, code: error instanceof HttpsError ? error.code : "internal" });
    throw error instanceof HttpsError ? error : new HttpsError("internal", "Preview preparation failed");
  }
});

/** Read-only gate. Private Storage has no download tokens or public ACLs.
 * No-store is intentional: eligibility and source media are checked every time. */
export const shareCardImage = onRequest({ region: "europe-west1", cors: true, invoker: "public", timeoutSeconds: 20 }, async (request, response) => {
  response.set("Cache-Control", "private, no-store");
  response.set("X-Content-Type-Options", "nosniff");
  if (request.method !== "GET" && request.method !== "HEAD") { response.status(405).end(); return; }
  try {
    const kind = safeKind(request.query.kind);
    let id = safeId(request.query.id);
    if (request.query.alias === "1") {
      if (kind === "spot" || kind === "event") {
        const alias = await db.doc(`${kind}_slugs/${id.toLowerCase()}`).get();
        id = safeId(alias.data()?.[`${kind}_id`] ?? id);
      } else if (kind === "community") {
        const alias = await db.doc(`community_slugs/${id.toLowerCase()}`).get();
        id = safeId(alias.data()?.communityKey ?? id);
      }
    }
    const current = await load(kind, id);
    if (!current) { response.status(404).end(); return; }
    const card = (await cardRef(kind, id).get()).data();
    if (card && await canServeCard(card, current)) {
      try {
        const [png] = await bucket().file(card.path as string).download();
        response.type("png").send(png); return;
      } catch (error) {
        // Cleanup or replacement can remove a prepared image before its record.
        // GET remains read-only and uses the same fallback as an unprepared card.
        if ((error as { code?: number }).code !== 404) throw error;
      }
    }
    response.type("png").send(await readFile(resolve(assets, "fallback.png")));
  } catch (error) {
    if (error instanceof HttpsError && error.code === "invalid-argument") {
      response.status(400).end(); return;
    }
    logger.warn("share_card_image_failed", { code: error instanceof HttpsError ? error.code : "unavailable" });
    response.status(503).end();
  }
});

/** Invalidate on content/privacy changes without scheduling generation. */
function invalidate(kind: EntityKind) {
  return onDocumentWritten({ region: "europe-west1", document: `${collections[kind]}/{id}`, retry: true }, async event => {
    const before = projectCard(kind, event.data?.before.data()), after = projectCard(kind, event.data?.after.data());
    if (before && after && sourceFingerprint(before) === sourceFingerprint(after)) return;
    const ref = cardRef(kind, event.params.id);
    const path = await db.runTransaction(async tx => {
      const [card, latest] = await Promise.all([tx.get(ref), load(kind, event.params.id, tx)]);
      // Delayed triggers must preserve both current cards and renders of the
      // current source. Publication still rechecks privacy, revision and lease.
      const data = card.data();
      if (latest) {
        const revision = latest.revision;
        if ((data?.lease && data.lease_revision === revision && Number(data.lease_until) > Date.now()) ||
          (data && await canServeCard(data, latest))) return undefined;
      }
      tx.delete(ref); return card.data()?.path;
    });
    await removeFile(path);
  });
}
export const invalidateSpotShareCard = invalidate("spot");
export const invalidateEventShareCard = invalidate("event");
export const invalidateCommunityShareCard = invalidate("community");
export const invalidateProfileShareCard = invalidate("profile");

/** Recover uploads abandoned by process termination or failed deletion. Active
 * images are retained; unreferenced files and expired rate-limit records are bounded. */
export const cleanupShareCards = onSchedule({ schedule: "every 24 hours", region: "europe-west1", timeoutSeconds: 540 }, async () => {
  const [files] = await bucket().getFiles({ prefix: "share_cards/" });
  for (const file of files) {
    const created = Date.parse(String(file.metadata.timeCreated));
    if (!Number.isFinite(created) || Date.now() - created < 86400_000) continue;
    const key = file.name.split("/")[2];
    if (!/^[a-f0-9]{64}$/.test(key ?? "")) continue;
    const card = await db.doc(`share_cards/${key}`).get();
    const data = card.data();
    if (data?.path === file.name) {
      const current = await load(safeKind(data.kind), safeId(data.id));
      if (current && await canServeCard(data, current)) continue;
      const removable = await db.runTransaction(async tx => {
        const [latest, source] = await Promise.all([tx.get(card.ref), load(safeKind(data.kind), safeId(data.id), tx)]);
        const saved = latest.data();
        if (saved?.path !== file.name) return true; // Old unreferenced file.
        if (Number(saved.lease_until) > Date.now() || (source && await canServeCard(saved, source))) return false;
        tx.delete(card.ref);
        return true;
      });
      if (!removable) continue;
    }
    await file.delete({ ignoreNotFound: true });
  }
  const expired = await db.collection("share_card_limits").where("expires_at", "<", Timestamp.now()).limit(500).get();
  const batch = db.batch();
  expired.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
});
