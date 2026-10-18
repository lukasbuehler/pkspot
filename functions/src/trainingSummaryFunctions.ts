import * as admin from "firebase-admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import type {
  BackfillTrainingSummariesRequest,
  BackfillTrainingSummariesResponse,
  GetMySpotRanksRequest,
  GetMySpotRanksResponse,
  MySpotRank,
  TrainingMonthSchema,
} from "../../src/db/schemas/TrainingSummarySchema";
import {
  LEGEND_MIN_VERIFIED_DAYS,
  buildTrainingMonthSummary,
  buildTrainingSpotSummary,
  legendTallyId,
  legendTalliesForMonth,
  localDateKey,
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
 * - `spot_legend_tallies` is server-only. It holds verified-day counts per
 *   person, Spot and month so `getMySpotRanks` can tell each person their own
 *   rank. No response names, lists or counts other people.
 *
 * Everything is recomputed from `session_records`, so deleting a check-in or a
 * session removes it from every summary and rank.
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
const MAX_RANKED_SPOTS = 10;
const TALLY_COLLECTION = "spot_legend_tallies";

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
  let written = 0;
  for (const month of new Set(months)) {
    if (!MONTH_PATTERN.test(month)) continue;
    const monthRef = db().doc(`users/${uid}/training_months/${month}`);
    const {start, end} = monthWindow(month);
    const spots = await db().runTransaction(async (transaction) => {
      const [previousSnapshot, sessionsSnapshot] = await Promise.all([
        transaction.get(monthRef),
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
      const previous = previousSnapshot.data() as TrainingMonthSchema | undefined;
      const affected = new Set([
        ...Object.keys(previous?.spots ?? {}),
        ...Object.keys(summary?.spots ?? {}),
      ]);

      if (summary) transaction.set(monthRef, summary);
      else if (previousSnapshot.exists) transaction.delete(monthRef);

      const tallies = new Map(legendTalliesForMonth(uid, summary).map((tally) => [tally.spot_id, tally]));
      for (const spotId of affected) {
        const tallyRef = db().doc(`${TALLY_COLLECTION}/${legendTallyId(month, spotId, uid)}`);
        const tally = tallies.get(spotId);
        if (tally) transaction.set(tallyRef, tally);
        else transaction.delete(tallyRef);
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

const parseTimeZone = (value: unknown): string | undefined => {
  const timeZone = stringValue(value);
  if (!timeZone || timeZone.length > 100) return undefined;
  try {
    new Intl.DateTimeFormat("en", {timeZone});
    return timeZone;
  } catch {
    return undefined;
  }
};

export const getMySpotRanks = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<GetMySpotRanksResponse> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to see your Spot ranks.");
    const input = (isRecord(request.data) ? request.data : {}) as GetMySpotRanksRequest;
    const timeZone = parseTimeZone(input.timeZone) ?? "UTC";
    const currentMonth = localDateKey(Date.now(), timeZone).slice(0, 7);
    const month = input.month ?? currentMonth;
    // Tallies are kept for this month and last month only.
    if (!MONTH_PATTERN.test(month) || (month !== currentMonth && month !== shiftMonth(currentMonth, -1))) {
      throw new HttpsError("invalid-argument", "Ranks are available for this month and last month.");
    }

    let spotIds: string[];
    if (input.spotIds !== undefined) {
      if (!Array.isArray(input.spotIds) || input.spotIds.length > MAX_RANKED_SPOTS ||
        !input.spotIds.every((spotId) => typeof spotId === "string" && SPOT_ID_PATTERN.test(spotId))) {
        throw new HttpsError("invalid-argument", `Request at most ${MAX_RANKED_SPOTS} valid Spots.`);
      }
      spotIds = [...new Set(input.spotIds)];
    } else {
      const summary = (await db().doc(`users/${uid}/training_months/${month}`).get()).data() as
        TrainingMonthSchema | undefined;
      spotIds = Object.entries(summary?.spots ?? {})
        .filter(([, spot]) => spot.verified_days > 0)
        .sort(([, left], [, right]) => right.verified_days - left.verified_days)
        .slice(0, MAX_RANKED_SPOTS)
        .map(([spotId]) => spotId);
    }

    const ranks: MySpotRank[] = [];
    for (const spotId of spotIds) {
      const mine = await db().doc(`${TALLY_COLLECTION}/${legendTallyId(month, spotId, uid)}`).get();
      const verifiedDays = numberValue(mine.data()?.["verified_days"]) ?? 0;
      if (verifiedDays < 1) continue;
      const ahead = await db().collection(TALLY_COLLECTION)
        .where("spot_id", "==", spotId)
        .where("month", "==", month)
        .where("verified_days", ">", verifiedDays)
        .count()
        .get();
      const rank = ahead.data().count + 1;
      ranks.push({
        spotId,
        month,
        verifiedDays,
        rank,
        legend: rank === 1 && verifiedDays >= LEGEND_MIN_VERIFIED_DAYS,
      });
    }
    return {month, ranks: ranks.sort((left, right) => left.rank - right.rank || right.verifiedDays - left.verifiedDays)};
  },
);

/** Keeps only this month's and last month's tallies. */
export const pruneSpotLegendTallies = onSchedule(
  {schedule: "15 4 * * *", timeZone: "Europe/Zurich"},
  async (): Promise<void> => {
    const keepFrom = shiftMonth(new Date().toISOString().slice(0, 7), -2);
    while (true) {
      const expired = await db().collection(TALLY_COLLECTION)
        .where("month", "<", keepFrom)
        .limit(400)
        .get();
      if (expired.empty) return;
      const batch = db().batch();
      expired.docs.forEach((document) => batch.delete(document.ref));
      await batch.commit();
      if (expired.size < 400) return;
    }
  },
);

/** Removes every private summary and rank tally for a deleted account. */
export async function deleteTrainingSummariesForUser(uid: string): Promise<void> {
  await db().recursiveDelete(db().collection(`users/${uid}/training_months`));
  await db().recursiveDelete(db().collection(`users/${uid}/training_spots`));
  while (true) {
    const tallies = await db().collection(TALLY_COLLECTION).where("uid", "==", uid).limit(400).get();
    if (tallies.empty) return;
    const batch = db().batch();
    tallies.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    if (tallies.size < 400) return;
  }
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
    let query = db().collection("users").orderBy(admin.firestore.FieldPath.documentId()).limit(limit);
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
