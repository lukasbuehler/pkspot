import { FieldPath, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { CommunityPageSchema, CommunityPlaceLocalization } from "../../src/db/schemas/CommunityPageSchema";
import { canEnrichPlace, placeFingerprint, GeoNamesError } from "./communityPlaceNames";

const QUEUE = "community_place_localization_jobs";
const PAGES = "community_pages";
const DAY = 86_400_000;

export async function enqueueCommunityPlace(db: Firestore, id: string, force = false): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const pageRef = db.collection(PAGES).doc(id), jobRef = db.collection(QUEUE).doc(id);
    const [snapshot, job] = await tx.getAll(pageRef, jobRef);
    const page = snapshot.data() as CommunityPageSchema | undefined;
    if (!canEnrichPlace(page)) return false;
    const fingerprint = placeFingerprint(page);
    if (!force && (page.place_localization?.fingerprint === fingerprint || job.data()?.fingerprint === fingerprint)) return false;
    tx.set(jobRef, { fingerprint, attempts: 0, nextAttemptAt: Timestamp.now(), status: "pending" });
    return true;
  });
}

export async function enqueueCommunityPlaceBatch(db: Firestore, after?: string): Promise<{ scanned: number; queued: number; nextCursor: string | null }> {
  let query = db.collection(PAGES).orderBy(FieldPath.documentId()).limit(50);
  if (after) query = query.startAfter(after);
  const pages = await query.get();
  let queued = 0;
  for (const page of pages.docs) if (await enqueueCommunityPlace(db, page.id)) queued++;
  return { scanned: pages.size, queued, nextCursor: pages.size === 50 ? pages.docs[pages.size - 1].id : null };
}

/** Sequential batches cap API use at 40 requests/hour, including backfills. */
export async function processCommunityPlaces(
  db: Firestore,
  enrich: (page: CommunityPageSchema) => Promise<CommunityPlaceLocalization | null>,
): Promise<{ completed: number; review: number; failed: number }> {
  const jobs = await db.collection(QUEUE).where("nextAttemptAt", "<=", Timestamp.now()).orderBy("nextAttemptAt").limit(20).get();
  const counts = { completed: 0, review: 0, failed: 0 };
  for (const job of jobs.docs) {
    const pageRef = db.collection(PAGES).doc(job.id);
    const claimed = await db.runTransaction(async (tx) => {
      const [currentJob, pageDoc] = await tx.getAll(job.ref, pageRef);
      const data = currentJob.data(), page = pageDoc.data() as CommunityPageSchema | undefined;
      if (!data || data.nextAttemptAt.toMillis() > Date.now()) return null;
      if (!canEnrichPlace(page) || placeFingerprint(page) !== data.fingerprint) {
        tx.delete(job.ref); return null;
      }
      const attempt = Number(data.attempts || 0) + 1;
      const lease = Date.now() + 10 * 60_000;
      tx.update(job.ref, { attempts: attempt, nextAttemptAt: Timestamp.fromMillis(lease), status: "processing" });
      return { page, fingerprint: data.fingerprint as string, attempt, lease };
    });
    if (!claimed) continue;
    let result: CommunityPlaceLocalization | null = null;
    let error: GeoNamesError | undefined;
    try { result = await enrich(claimed.page); }
    catch (failure) { error = failure instanceof GeoNamesError ? failure : new GeoNamesError("unavailable"); }
    const outcome = await db.runTransaction(async (tx) => {
      const [currentJob, currentPage] = await tx.getAll(job.ref, pageRef);
      const data = currentJob.data(), page = currentPage.data() as CommunityPageSchema | undefined;
      // A newer request, lease or geography change wins over this in-flight response.
      if (!data || data.fingerprint !== claimed.fingerprint || data.nextAttemptAt.toMillis() !== claimed.lease) return;
      if (!canEnrichPlace(page) || placeFingerprint(page) !== claimed.fingerprint) { tx.delete(job.ref); return; }
      if (error) {
        tx.update(job.ref, {
          status: "retry", lastError: error.kind,
          nextAttemptAt: Timestamp.fromMillis(Date.now() + Math.min(30, 2 ** Math.min(claimed.attempt, 5)) * DAY),
        });
        return "failed" as const;
      } else if (!result) {
        // Missing/ambiguous matches are reviewed explicitly, not hammered hourly.
        tx.update(job.ref, { status: "needs-review", nextAttemptAt: Timestamp.fromMillis(Date.now() + 365 * DAY) });
        return "review" as const;
      } else {
        const parentRefs = (page.relationships?.parentKeys ?? [])
          .filter((id) => id !== job.id && !id.includes("/"))
          .map((id) => db.collection(PAGES).doc(id));
        const parents = parentRefs.length ? await tx.getAll(...parentRefs) : [];
        for (const parent of parents) {
          const children = parent.data()?.childCommunities as CommunityPageSchema["childCommunities"] | undefined;
          if (!children?.some((child) => child.communityKey === job.id)) continue;
          tx.update(parent.ref, { childCommunities: children.map((child) => child.communityKey === job.id
            ? { ...child, place_localization: result } : child) });
        }
        // A field update preserves all overrides and concurrently regenerated counts.
        tx.update(pageRef, { place_localization: result });
        tx.delete(job.ref);
        return "completed" as const;
      }
    });
    if (outcome) counts[outcome]++;
    if (error?.kind === "account" || error?.kind === "quota") break;
  }
  return counts;
}
