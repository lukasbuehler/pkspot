import * as admin from "firebase-admin";
import {FieldPath, FieldValue} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import type {
  BackfillTrainingSummariesRequest,
  BackfillTrainingSummariesResponse,
  DeleteMySpotRankRequest,
  LocalLegendSettingsSchema,
  SetLocalLegendParticipationResponse,
  SpotLegendTallySchema,
  TrainingMonthSchema,
  TrainingRanksSchema,
} from "../../src/db/schemas/TrainingSummarySchema";
import {
  RANK_MIN_VERIFIED_DAYS,
  buildTrainingMonthSummary,
  buildLocalLegendMonthSummary,
  buildTrainingSpotSummary,
  legendTallyId,
  legendTalliesForMonth,
  localDateKey,
  openRankMonths,
  rankSpotTallies,
  sessionMonthKey,
  shiftMonth,
  type TrainingSummarySession,
} from "../../src/db/utils/training-summary";
import {deleteCheckInForUser} from "./checkInFunctions";

/**
 * Private training summaries and private Spot ranks.
 *
 * - `users/{uid}/training_months/{YYYY-MM}` and `users/{uid}/training_spots/{spotId}`
 *   are owner-readable, server-written views of the person's own history.
 * - `spot_legend_tallies` is server-only working data: verified-day counts per
 *   person, Spot and open month.
 * - Local Legend is opt-in (`users/{uid}/training_settings/local_legend`).
 *   Only participants get tallies, so people who have not joined are never
 *   compared. Leaving deletes the person's tallies; their current-month rank is removed and past ranks remain manageable
 *   without rejoining. Joining counts only subsequent verified check-ins.
 * - `users/{uid}/training_ranks/{YYYY-MM}` holds the person's own ranks. A
 *   nightly job publishes them so a rank change cannot reveal when someone
 *   else trained, and only when at least three people checked in at the Spot.
 *   Once a month is over its ranks become final, stay in the person's own
 *   document as history, and the month's tallies are deleted.
 *
 * Summaries are recomputed from `session_records` on every write, so deleting
 * a check-in removes its contribution. Open ranks update only overnight.
 */

const db = () => admin.firestore();
const CALLABLE_OPTIONS = {
  cors: true,
  enforceAppCheck: true,
  invoker: "public" as const,
};
const HOUR_MS = 60 * 60 * 1_000;
/** Query margin around a month so every time zone's local month is covered. */
const MONTH_MARGIN_MS = 15 * HOUR_MS;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/u;
const SPOT_ID_PATTERN = /^(?!\.{1,2}$)[^/]{1,150}$/u;
const TALLY_COLLECTION = "spot_legend_tallies";
const settingsPath = (uid: string) => `users/${uid}/training_settings/local_legend`;
/** Months, the grace period and the nightly run follow this zone. */
const RANK_TIME_ZONE = "Europe/Zurich";

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** Reads only the fields the summaries need from a stored session. */
export function summarySessionFrom(id: string, data: RecordValue): TrainingSummarySession | null {
  const startedAt = numberValue(data["started_at_raw_ms"]);
  if (startedAt === undefined) return null;
  const visits = Array.isArray(data["spot_visits"]) ? data["spot_visits"] : [];
  return {
    id,
    source: stringValue(data["source"]),
    started_at_raw_ms: startedAt,
    ended_at_raw_ms: numberValue(data["ended_at_raw_ms"]),
    time_zone: stringValue(data["time_zone"]),
    spot_visits: visits.filter(isRecord).flatMap((visit) => {
      const spotId = stringValue(visit["spot_id"]);
      const arrivedAt = numberValue(visit["arrived_at_raw_ms"]) ?? startedAt;
      if (!spotId) return [];
      return [{
        spot_id: spotId,
        arrived_at_raw_ms: arrivedAt,
        ...(stringValue(visit["check_in_id"]) ? {check_in_id: stringValue(visit["check_in_id"])} : {}),
        ...(stringValue(visit["spot_name"]) ? {spot_name: stringValue(visit["spot_name"])} : {}),
        ...(typeof visit["verified"] === "boolean" ? {verified: visit["verified"]} : {}),
      }];
    }),
  };
}

function monthWindow(month: string): {start: number; end: number} {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: Date.UTC(year, monthNumber - 1, 1) - MONTH_MARGIN_MS,
    end: Date.UTC(year, monthNumber, 1) + MONTH_MARGIN_MS,
  };
}

/** Check-ins written before visits carried `verified` fall back to their lookup. */
async function verifiedCheckInIdsFor(
  uid: string,
  sessions: readonly TrainingSummarySession[],
  transaction: FirebaseFirestore.Transaction,
): Promise<Set<string>> {
  const ids = [...new Set(sessions.flatMap((session) =>
    (session.spot_visits ?? [])
      .filter((visit) => visit.check_in_id && visit.verified === undefined)
      .map((visit) => visit.check_in_id as string),
  ))];
  const verified = new Set<string>();
  for (let index = 0; index < ids.length; index += 100) {
    const refs = ids.slice(index, index + 100).map((id) => db().doc(`users/${uid}/check_in_lookup/${id}`));
    const snapshots = await transaction.getAll(...refs);
    snapshots.forEach((snapshot) => {
      if (snapshot.data()?.["accepted_for_aggregate"] === true) verified.add(snapshot.id);
    });
  }
  return verified;
}

/**
 * Recomputes the given months for one person, then the all-time Spot views
 * those months touch. Each month runs in its own transaction so concurrent
 * session writes cannot leave a stale summary behind.
 */
export async function rebuildTrainingMonths(
  uid: string,
  months: Iterable<string>,
  options: {purge?: boolean} = {},
): Promise<number> {
  const touchedSpots = new Set<string>();
  const openMonths = new Set(openRankMonths(localDateKey(Date.now(), RANK_TIME_ZONE)));
  let written = 0;
  for (const month of new Set(months)) {
    if (!MONTH_PATTERN.test(month)) continue;
    const monthRef = db().doc(`users/${uid}/training_months/${month}`);
    const ranksRef = db().doc(`users/${uid}/training_ranks/${month}`);
    const {start, end} = monthWindow(month);
    const spots = await db().runTransaction(async (transaction) => {
      const [previousSnapshot, ranksSnapshot, settingsSnapshot, sessionsSnapshot] = await Promise.all([
        transaction.get(monthRef),
        transaction.get(ranksRef),
        transaction.get(db().doc(settingsPath(uid))),
        options.purge
          ? Promise.resolve(null)
          : transaction.get(
            db().collection(`users/${uid}/session_records`)
              .where("started_at_raw_ms", ">=", start)
              .where("started_at_raw_ms", "<", end),
          ),
      ]);
      const sessions = (sessionsSnapshot?.docs ?? [])
        .map((document) => summarySessionFrom(document.id, document.data()))
        .filter((session): session is TrainingSummarySession => session !== null)
        .filter((session) => sessionMonthKey(session) === month);
      const verified = await verifiedCheckInIdsFor(uid, sessions, transaction);
      const summary = buildTrainingMonthSummary(month, sessions, verified, Date.now());
      const settings = options.purge ? undefined : settingsSnapshot.data() as LocalLegendSettingsSchema | undefined;
      const eligibleSummary = settings?.enabled
        ? buildLocalLegendMonthSummary(month, sessions, verified,
          settings.enabled_since_raw_ms ?? settings.decided_at_raw_ms, Date.now())
        : null;
      if (summary) {
        for (const [spotId, spot] of Object.entries(summary.spots)) {
          spot.local_legend_days = eligibleSummary?.spots[spotId]?.verified_days ?? 0;
        }
      }
      const previous = previousSnapshot.data() as TrainingMonthSchema | undefined;
      const affected = new Set([
        ...Object.keys(previous?.spots ?? {}),
        ...Object.keys(summary?.spots ?? {}),
      ]);

      if (summary) transaction.set(monthRef, summary);
      else if (previousSnapshot.exists) transaction.delete(monthRef);

      // Closed months keep their final ranks; only open months have tallies,
      // and only for people who joined Local Legend.
      if (openMonths.has(month)) {
        const tallies = new Map(settings?.enabled
          ? legendTalliesForMonth(uid, eligibleSummary).map((tally) => [tally.spot_id, tally])
          : []);
        for (const spotId of affected) {
          const tallyRef = db().doc(`${TALLY_COLLECTION}/${legendTallyId(month, spotId, uid)}`);
          const tally = tallies.get(spotId);
          // A zero tally lets the nightly job withdraw an existing rank and
          // recalculate the remaining cohort without publishing on deletion.
          if (settings?.enabled) transaction.set(tallyRef, tally ?? {
            uid, spot_id: spotId, month, verified_days: 0, last_ms: Date.now(),
          }, {merge: true});
          else transaction.delete(tallyRef);
        }
      }

      // Final history is personal: removing its source can withdraw the
      // person's result, but never reranks other people's finished months.
      const ranks = ranksSnapshot.data() as TrainingRanksSchema | undefined;
      if (ranks && !openMonths.has(month)) {
        const kept = Object.fromEntries(Object.entries(ranks.spots ?? {}).filter(([spotId]) =>
          (summary?.spots[spotId]?.verified_days ?? 0) >= RANK_MIN_VERIFIED_DAYS));
        if (Object.keys(kept).length === 0) transaction.delete(ranksRef);
        else if (Object.keys(kept).length !== Object.keys(ranks.spots ?? {}).length) {
          transaction.set(ranksRef, {...ranks, spots: kept});
        }
      }
      return affected;
    });
    spots.forEach((spotId) => touchedSpots.add(spotId));
    written += 1;
  }

  if (touchedSpots.size > 0) {
    const monthsSnapshot = await db().collection(`users/${uid}/training_months`).get();
    const allMonths = monthsSnapshot.docs.map((document) => document.data() as TrainingMonthSchema);
    const writer = db().bulkWriter();
    for (const spotId of touchedSpots) {
      if (!SPOT_ID_PATTERN.test(spotId)) continue;
      const ref = db().doc(`users/${uid}/training_spots/${spotId}`);
      const spot = buildTrainingSpotSummary(spotId, allMonths, Date.now());
      if (spot) void writer.set(ref, spot);
      else void writer.delete(ref);
    }
    await writer.close();
  }
  return written;
}

function monthsOf(data: RecordValue | undefined, id: string): string[] {
  if (!data) return [];
  const session = summarySessionFrom(id, data);
  const month = session ? sessionMonthKey(session) : null;
  return month ? [month] : [];
}

async function accountExists(uid: string): Promise<boolean> {
  try {
    await admin.auth().getUser(uid);
    return true;
  } catch (error) {
    const code = isRecord(error) ? error["code"] : undefined;
    if (code === "auth/user-not-found") return false;
    throw error;
  }
}

export const onSessionRecordWrittenUpdateTrainingSummary = onDocumentWritten(
  {document: "users/{uid}/session_records/{sessionId}", retry: true},
  async (event) => {
    const uid = event.params.uid;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const months = new Set([
      ...monthsOf(before, event.params.sessionId),
      ...monthsOf(after, event.params.sessionId),
    ]);
    if (months.size === 0) return;
    // Account deletion removes sessions one by one. Do not rebuild summaries
    // for an account that no longer exists; purge them instead.
    const purge = !after && !(await accountExists(uid));
    await rebuildTrainingMonths(uid, months, {purge});
  },
);

/**
 * Publishes every open month's ranks into each person's `training_ranks`
 * document. Only changed entries are written. When a month's grace period is
 * over, its ranks are published one last time as final and its tallies deleted.
 */
export async function publishSpotRanks(nowMs = Date.now()): Promise<{
  tallies: number;
  written: number;
  finalized: string[];
}> {
  const today = localDateKey(nowMs, RANK_TIME_ZONE);
  const open = openRankMonths(today);
  const previous = shiftMonth(today.slice(0, 7), -1);
  const months = open.includes(previous) ? open : [previous, ...open];
  const result = {tallies: 0, written: 0, finalized: [] as string[]};

  for (const month of months) {
    const snapshot = await db().collection(TALLY_COLLECTION).where("month", "==", month).get();
    if (snapshot.empty) continue;
    const final = !open.includes(month);
    result.tallies += snapshot.size;

    const bySpot = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
    snapshot.docs.forEach((document) => {
      const spotId = stringValue(document.data()["spot_id"]);
      if (spotId) bySpot.set(spotId, [...(bySpot.get(spotId) ?? []), document]);
    });

    // Re-read a Spot's source documents and participation inside the same
    // transaction as publication. A concurrent withdrawal/deletion retries
    // publication rather than resurrecting its stale rank from the query above.
    for (const documents of bySpot.values()) {
      const written = await db().runTransaction(async (transaction) => {
        const [current, settings] = await Promise.all([
          transaction.getAll(...documents.map((document) => document.ref)),
          transaction.getAll(...documents.map((document) =>
            db().doc(settingsPath(document.data()["uid"])))),
        ]);
        const eligible = current.flatMap((document, index) => {
          const tally = document.data() as SpotLegendTallySchema | undefined;
          const choice = settings[index].data() as LocalLegendSettingsSchema | undefined;
          if (!tally || !choice?.enabled) return [];
          const since = choice.enabled_since_raw_ms ?? choice.decided_at_raw_ms;
          return tally.last_ms >= since ? [{tally, ref: document.ref}] : [];
        });
        const ranks = rankSpotTallies(eligible.map(({tally}) => tally));
        let written = 0;
        for (const {tally, ref} of eligible) {
          const entry = ranks.get(tally.uid);
          const published = entry ? JSON.stringify(entry) : "";
          if (!final && tally.published === published) continue;
          if (!entry && !tally.published && tally.verified_days > 0) continue;
          if (!final) transaction.update(ref, {published});
          written += 1;
          transaction.set(db().doc(`users/${tally.uid}/training_ranks/${month}`), {
            version: 1, month, final, computed_at_raw_ms: nowMs,
            spots: {[tally.spot_id]: entry ? {
              rank: FieldValue.delete(), tied_with: FieldValue.delete(),
              legend: FieldValue.delete(), ...entry,
            } : FieldValue.delete()},
          }, {merge: true});
        }
        return written;
      });
      result.written += written;
    }

    if (final) {
      await deleteInBatches(db().collection(TALLY_COLLECTION).where("month", "==", month));
      result.finalized.push(month);
    }
  }
  return result;
}

async function deleteInBatches(query: FirebaseFirestore.Query): Promise<void> {
  while (true) {
    const page = await query.limit(400).get();
    if (page.empty) return;
    const batch = db().batch();
    page.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    if (page.size < 400) return;
  }
}

/** Ranks are updated at the end of each day, never right after a check-in. */
export const publishSpotRanksNightly = onSchedule(
  {schedule: "30 3 * * *", timeZone: RANK_TIME_ZONE, timeoutSeconds: 540, memory: "512MiB"},
  async (): Promise<void> => {
    const result = await publishSpotRanks();
    console.info("publishSpotRanks", result);
  },
);

/** Participation changes never re-import previously withdrawn check-ins. */
export const setLocalLegendParticipation = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<SetLocalLegendParticipationResponse> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to choose Local Legend.");
    const enabled = isRecord(request.data) ? request.data["enabled"] : undefined;
    if (typeof enabled !== "boolean") throw new HttpsError("invalid-argument", "Choose on or off.");
    const choice = await db().runTransaction(async (transaction) => {
      const ref = db().doc(settingsPath(uid));
      const [snapshot, tallies] = await Promise.all([
        transaction.get(ref),
        transaction.get(db().collection(TALLY_COLLECTION).where("uid", "==", uid)),
      ]);
      const previous = snapshot.data() as LocalLegendSettingsSchema | undefined;
      const now = Date.now();
      const choice: LocalLegendSettingsSchema = {
        enabled,
        decided_at_raw_ms: now,
        ...(enabled ? {enabled_since_raw_ms: previous?.enabled
          ? previous.enabled_since_raw_ms ?? previous.decided_at_raw_ms : now} : {}),
      };
      transaction.set(ref, choice);
      if (!enabled) {
        tallies.docs.forEach((tally) => transaction.delete(tally.ref));
      }
      // Old clients retained open ranks while off. Reactivation must not
      // reveal those withdrawn results before the next nightly update.
      if (!enabled || previous?.enabled !== true) {
        const month = localDateKey(now, RANK_TIME_ZONE).slice(0, 7);
        transaction.delete(db().doc(`users/${uid}/training_ranks/${month}`));
      }
      return choice;
    });
    // Also refresh private progress fields, while retaining full training stats.
    await rebuildTrainingMonths(uid, openRankMonths(localDateKey(Date.now(), RANK_TIME_ZONE)));
    return {enabled, ...(choice.enabled_since_raw_ms !== undefined ? {enabledSinceRawMs: choice.enabled_since_raw_ms} : {})};
  },
);

/**
 * Removes one finished month's rank at one Spot from the person's own
 * history. Open months still change nightly, so they cannot be edited.
 */
export const deleteMySpotRank = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<{deleted: boolean}> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to manage your ranks.");
    const input = (isRecord(request.data) ? request.data : {}) as Partial<DeleteMySpotRankRequest>;
    if (typeof input.month !== "string" || !MONTH_PATTERN.test(input.month) ||
      typeof input.spotId !== "string" || !SPOT_ID_PATTERN.test(input.spotId)) {
      throw new HttpsError("invalid-argument", "A valid month and Spot are required.");
    }
    if (openRankMonths(localDateKey(Date.now(), RANK_TIME_ZONE)).includes(input.month)) {
      throw new HttpsError("failed-precondition", "This month's ranks are still changing.");
    }
    const month = input.month;
    const spotId = input.spotId;
    const ref = db().doc(`users/${uid}/training_ranks/${month}`);
    return db().runTransaction(async (transaction) => {
      const ranks = (await transaction.get(ref)).data() as TrainingRanksSchema | undefined;
      if (!ranks?.spots?.[spotId]) return {deleted: false};
      const spots = {...ranks.spots};
      delete spots[spotId];
      if (Object.keys(spots).length === 0) transaction.delete(ref);
      else transaction.set(ref, {...ranks, spots});
      return {deleted: true};
    });
  },
);

/** Removes every private summary and rank tally for a deleted account. */
export async function deleteTrainingSummariesForUser(uid: string): Promise<void> {
  await db().recursiveDelete(db().collection(`users/${uid}/training_months`));
  await db().recursiveDelete(db().collection(`users/${uid}/training_spots`));
  await db().recursiveDelete(db().collection(`users/${uid}/training_ranks`));
  await db().recursiveDelete(db().collection(`users/${uid}/training_settings`));
  await deleteInBatches(db().collection(TALLY_COLLECTION).where("uid", "==", uid));
}

/** Private training subcollections removed with the account. */
const PRIVATE_TRAINING_COLLECTIONS = [
  "session_records",
  "log_entries",
  "recovery_pauses",
  "check_in_spot_index",
  "legacy_check_in_spot_index",
  "check_in_dedup",
  "check_in_integrity",
  "check_ins",
] as const;

/**
 * Deletes a deleted account's private training history. Check-ins go first
 * through the regular deletion path so public Spot activity and visited
 * markers are updated exactly as when the person deletes them in the app.
 */
export async function deleteTrainingDataForUser(uid: string): Promise<void> {
  while (true) {
    const lookups = await db().collection(`users/${uid}/check_in_lookup`).limit(100).get();
    if (lookups.empty) break;
    for (const lookup of lookups.docs) {
      if (!(await deleteCheckInForUser(uid, lookup.id))) await lookup.ref.delete();
    }
  }
  for (const name of PRIVATE_TRAINING_COLLECTIONS) {
    await db().recursiveDelete(db().collection(`users/${uid}/${name}`));
  }
  await deleteTrainingSummariesForUser(uid);
}

/**
 * Administrator backfill for summaries of history recorded before the trigger
 * existed. Runs in pages; pass `next_cursor` back until it is null.
 */
export const backfillTrainingSummaries = onCall(
  {...CALLABLE_OPTIONS, timeoutSeconds: 540, memory: "1GiB"},
  async (request): Promise<BackfillTrainingSummariesResponse> => {
    const adminUid = request.auth?.uid;
    if (!adminUid) throw new HttpsError("unauthenticated", "Sign in required.");
    const adminUser = await db().doc(`users/${adminUid}`).get();
    if (adminUser.data()?.["is_admin"] !== true) {
      throw new HttpsError("permission-denied", "Administrator access required.");
    }
    const input = (isRecord(request.data) ? request.data : {}) as BackfillTrainingSummariesRequest;
    const dryRun = input.dry_run !== false;
    const limit = Math.min(100, Math.max(1, Math.floor(numberValue(input.limit) ?? 25)));
    let query = db().collection("users").orderBy(FieldPath.documentId()).limit(limit);
    if (input.cursor) query = query.startAfter(input.cursor);
    const users = await query.get();

    let monthsWritten = 0;
    for (const user of users.docs) {
      const sessions = await db().collection(`users/${user.id}/session_records`).get();
      const existing = await db().collection(`users/${user.id}/training_months`).get();
      const months = new Set([
        ...sessions.docs.flatMap((document) => monthsOf(document.data(), document.id)),
        // Stale months are rebuilt too, which deletes them when now empty.
        ...existing.docs.map((document) => document.id),
      ]);
      if (dryRun) monthsWritten += months.size;
      else monthsWritten += await rebuildTrainingMonths(user.id, months);
    }
    return {
      users_scanned: users.size,
      months_written: monthsWritten,
      next_cursor: users.size === limit ? users.docs.at(-1)?.id ?? null : null,
      dry_run: dryRun,
    };
  },
);
