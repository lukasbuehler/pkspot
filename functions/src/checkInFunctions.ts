import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import type {
  CheckInAggregateEligibility,
  ConfirmCheckInRequest,
  ConfirmCheckInResponse,
  DeleteAllCheckInsResponse,
  DeleteCheckInRequest,
  DeleteCheckInResponse,
  SpotActivityPublicSchema,
} from "../../src/db/schemas/CheckInActivitySchema";
import {checkInActivityBucket} from "../../src/db/schemas/CheckInActivitySchema";

const db = admin.firestore();
const CALLABLE_OPTIONS = {
  cors: true,
  enforceAppCheck: true,
  invoker: "public" as const,
};
const PROXIMITY_METERS = 50;
const MAX_ACCURACY_METERS = 50;
const CHECK_IN_COOLDOWN_MS = 4 * 60 * 60 * 1_000;
const SESSION_IDLE_MS = 5 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const ACTIVITY_WINDOW_MS = 30 * DAY_MS;
const MAX_PER_HOUR = 12;
const MAX_TRAVEL_SPEED_KMH = 250;
const SPOT_ID_PATTERN = /^[^/]{1,150}$/u;

type RecordValue = Record<string, unknown>;
type Coordinate = {lat: number; lng: number};
type CheckInLookup = {
  spot_id?: unknown;
  session_record_id?: unknown;
  accepted_for_aggregate?: unknown;
};

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const coordinateFrom = (value: unknown): Coordinate | null => {
  if (!isRecord(value)) return null;
  const lat = numberValue(value["lat"]) ?? numberValue(value["latitude"]);
  const lng = numberValue(value["lng"]) ?? numberValue(value["longitude"]);
  if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return {lat, lng};
};

const haversineMeters = (first: Coordinate, second: Coordinate): number => {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const deltaLat = toRadians(second.lat - first.lat);
  const deltaLng = toRadians(second.lng - first.lng);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(first.lat)) * Math.cos(toRadians(second.lat)) *
      Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const pointInPolygon = (point: Coordinate, polygon: readonly Coordinate[]): boolean => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const before = polygon[previous];
    const crosses = (current.lat > point.lat) !== (before.lat > point.lat) &&
      point.lng < (before.lng - current.lng) * (point.lat - current.lat) /
        (before.lat - current.lat) + current.lng;
    if (crosses) inside = !inside;
  }
  return inside;
};

const distanceToSegmentMeters = (
  point: Coordinate,
  start: Coordinate,
  end: Coordinate,
): number => {
  const longitudeScale = Math.cos(point.lat * Math.PI / 180);
  const x = (point.lng - start.lng) * longitudeScale;
  const y = point.lat - start.lat;
  const dx = (end.lng - start.lng) * longitudeScale;
  const dy = end.lat - start.lat;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return haversineMeters(point, start);
  const progress = Math.max(0, Math.min(1, (x * dx + y * dy) / lengthSquared));
  return haversineMeters(point, {
    lat: start.lat + progress * (end.lat - start.lat),
    lng: start.lng + progress * (end.lng - start.lng),
  });
};

const effectiveSpotDistance = (
  location: Coordinate,
  spot: RecordValue,
): {distance: number; center: Coordinate | null} => {
  const center = coordinateFrom(spot["location_raw"]) ?? coordinateFrom(spot["location"]);
  const rawBounds = Array.isArray(spot["bounds_raw"])
    ? spot["bounds_raw"]
    : Array.isArray(spot["bounds"])
      ? spot["bounds"]
      : [];
  const polygon = rawBounds.map(coordinateFrom).filter((item): item is Coordinate => item !== null);
  const centerDistance = center ? haversineMeters(location, center) : Infinity;
  if (polygon.length < 3) return {distance: centerDistance, center};
  if (pointInPolygon(location, polygon)) return {distance: 0, center};
  let edgeDistance = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    edgeDistance = Math.min(
      edgeDistance,
      distanceToSegmentMeters(location, polygon[index], polygon[(index + 1) % polygon.length]),
    );
  }
  return {distance: Math.min(centerDistance, edgeDistance), center};
};

const spotCenter = (spot: RecordValue | undefined): Coordinate | null =>
  spot
    ? coordinateFrom(spot["location_raw"]) ?? coordinateFrom(spot["location"])
    : null;

const spotNameFrom = (spot: RecordValue): string | undefined => {
  const name = spot["name"];
  if (typeof name === "string") return name.slice(0, 200);
  if (!isRecord(name)) return undefined;
  const preferred = stringValue(name["en"]);
  if (preferred) return preferred.slice(0, 200);
  const fallback = Object.values(name).find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return fallback?.slice(0, 200);
};

const parseConfirmInput = (value: unknown): ConfirmCheckInRequest => {
  if (!isRecord(value)) throw new HttpsError("invalid-argument", "Check-in data is required.");
  const spotId = stringValue(value["spotId"]);
  const location = coordinateFrom(value["location"]);
  const accuracyMeters = numberValue(value["accuracyMeters"]);
  const timeZone = stringValue(value["timeZone"]);
  if (!spotId || !SPOT_ID_PATTERN.test(spotId)) {
    throw new HttpsError("invalid-argument", "A valid Spot is required.");
  }
  if (!location || accuracyMeters === undefined || accuracyMeters < 0 || accuracyMeters > 10_000) {
    throw new HttpsError("invalid-argument", "A valid current location is required.");
  }
  if (!timeZone || timeZone.length > 100) {
    throw new HttpsError("invalid-argument", "A valid time zone is required.");
  }
  return {spotId, location, accuracyMeters, timeZone};
};

const assertParticipationAllowed = (user: RecordValue | undefined): void => {
  const agePolicy = isRecord(user?.["age_policy"]) ? user["age_policy"] : {};
  const participation = agePolicy["participation_state"] ?? "allowed";
  if (participation !== "allowed" && participation !== "platform_signal_unavailable") {
    throw new HttpsError("permission-denied", "This account cannot check in.");
  }
};

const appendVisit = (
  visits: readonly RecordValue[],
  checkInId: string,
  spotId: string,
  spotName: string | undefined,
  now: Timestamp,
  nowMs: number,
): RecordValue[] => {
  const next = visits.map((visit) => ({...visit}));
  const previous = next.at(-1);
  if (previous && previous["left_at_raw_ms"] === undefined) {
    previous["left_at"] = now;
    previous["left_at_raw_ms"] = nowMs;
  }
  next.push({
    check_in_id: checkInId,
    spot_id: spotId,
    ...(spotName ? {spot_name: spotName} : {}),
    arrived_at: now,
    arrived_at_raw_ms: nowMs,
  });
  return next;
};

const visitRecordsFrom = (value: unknown): RecordValue[] =>
  Array.isArray(value) ? value.filter(isRecord).map((visit) => ({...visit})) : [];

const enqueueRollup = (
  transaction: FirebaseFirestore.Transaction,
  spotId: string,
  now: Timestamp,
): void => {
  transaction.set(db.doc(`check_in_activity_rollups/${spotId}`), {
    spot_id: spotId,
    next_rollup_at: now,
  }, {merge: true});
};

const deleteCheckInForUser = async (uid: string, checkInId: string): Promise<boolean> => {
  const lookupRef = db.doc(`users/${uid}/check_in_lookup/${checkInId}`);
  return db.runTransaction(async (transaction) => {
    const lookupSnapshot = await transaction.get(lookupRef);
    if (!lookupSnapshot.exists) return false;
    const lookup = lookupSnapshot.data() as CheckInLookup;
    const spotId = stringValue(lookup.spot_id);
    const sessionRecordId = stringValue(lookup.session_record_id);
    if (!spotId || !sessionRecordId) {
      transaction.delete(lookupRef);
      return false;
    }

    const sessionRef = db.doc(`users/${uid}/session_records/${sessionRecordId}`);
    const privateDataRef = db.doc(`users/${uid}/private_data/main`);
    const indexRef = db.doc(`users/${uid}/check_in_spot_index/${spotId}`);
    const legacyIndexRef = db.doc(`users/${uid}/legacy_check_in_spot_index/${spotId}`);
    const integrityRef = db.doc(`users/${uid}/check_in_integrity/main`);
    const contributionRef = db.doc(`spots/${spotId}/check_in_aggregate_contributions/${checkInId}`);
    const legacyCheckIns = db.collection(`users/${uid}/check_ins`)
      .where("spot_id", "==", spotId)
      .limit(1);
    const [sessionSnapshot, indexSnapshot, legacyIndexSnapshot, integritySnapshot, legacyCheckInsSnapshot] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(indexRef),
      transaction.get(legacyIndexRef),
      transaction.get(integrityRef),
      transaction.get(legacyCheckIns),
    ]);
    const session = sessionSnapshot.data() ?? {};
    const remainingVisits = visitRecordsFrom(session["spot_visits"]).filter(
      (visit) => visit["check_in_id"] !== checkInId,
    );
    const now = Timestamp.now();
    const nowMs = now.toMillis();
    if (sessionSnapshot.exists && session["source"] === "check_in") {
      if (remainingVisits.length === 0) {
        transaction.delete(sessionRef);
      } else {
        transaction.update(sessionRef, {
          spot_visits: remainingVisits,
          last_activity_at: now,
          last_activity_raw_ms: nowMs,
          time_updated: now,
          time_updated_raw_ms: nowMs,
        });
      }
    }

    const index = indexSnapshot.data() ?? {};
    const remainingCount = Math.max(0, (numberValue(index["visit_count"]) ?? 1) - 1);
    if (remainingCount === 0) {
      transaction.delete(indexRef);
      const preservesLegacyVisit =
        index["preexisting_visited"] === true ||
        legacyIndexSnapshot.data()?.["legacy_visited"] === true ||
        !legacyCheckInsSnapshot.empty;
      if (!preservesLegacyVisit) {
        transaction.set(privateDataRef, {
          visited_spots: FieldValue.arrayRemove(spotId),
        }, {merge: true});
      }
    } else {
      transaction.update(indexRef, {visit_count: remainingCount});
    }

    if (integritySnapshot.data()?.["last_check_in_id"] === checkInId) {
      transaction.delete(integrityRef);
    }
    transaction.delete(lookupRef);
    transaction.delete(contributionRef);
    enqueueRollup(transaction, spotId, now);
    return true;
  });
};

export const confirmCheckIn = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<ConfirmCheckInResponse> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to check in.");
    const input = parseConfirmInput(request.data);
    const now = Timestamp.now();
    const nowMs = now.toMillis();
    const userRef = db.doc(`users/${uid}`);
    const spotRef = db.doc(`spots/${input.spotId}`);
    const dedupeRef = db.doc(`users/${uid}/check_in_dedup/${input.spotId}`);
    const rateRef = db.doc(`check_in_rate_limits/${uid}_${Math.floor(nowMs / HOUR_MS)}`);
    const privateDataRef = db.doc(`users/${uid}/private_data/main`);
    const spotIndexRef = db.doc(`users/${uid}/check_in_spot_index/${input.spotId}`);
    const integrityRef = db.doc(`users/${uid}/check_in_integrity/main`);
    const sessionCollection = db.collection(`users/${uid}/session_records`);
    const recentSessions = sessionCollection.orderBy("last_activity_raw_ms", "desc").limit(20);
    const checkInId = db.collection("check_in_ids").doc().id;

    return db.runTransaction(async (transaction) => {
      const [userSnapshot, spotSnapshot, dedupeSnapshot, rateSnapshot, privateDataSnapshot, indexSnapshot, integritySnapshot, sessionsSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(spotRef),
        transaction.get(dedupeRef),
        transaction.get(rateRef),
        transaction.get(privateDataRef),
        transaction.get(spotIndexRef),
        transaction.get(integrityRef),
        transaction.get(recentSessions),
      ]);
      assertParticipationAllowed(userSnapshot.data());
      if (!spotSnapshot.exists) throw new HttpsError("not-found", "This Spot no longer exists.");

      const dedupe = dedupeSnapshot.data() ?? {};
      const previousAt = numberValue(dedupe["last_confirmed_at_raw_ms"]);
      const previousCheckInId = stringValue(dedupe["last_check_in_id"]);
      const previousSessionId = stringValue(dedupe["session_record_id"]);
      if (
        previousAt !== undefined && previousCheckInId && previousSessionId &&
        nowMs - previousAt < CHECK_IN_COOLDOWN_MS
      ) {
        return {
          checkInId: previousCheckInId,
          sessionRecordId: previousSessionId,
          duplicate: true,
        };
      }

      const rate = rateSnapshot.data() ?? {};
      if ((numberValue(rate["count"]) ?? 0) >= MAX_PER_HOUR) {
        throw new HttpsError("resource-exhausted", "Too many check-ins. Please try again later.");
      }

      const spot = spotSnapshot.data() ?? {};
      const {distance, center} = effectiveSpotDistance(input.location, spot);
      let eligibility: CheckInAggregateEligibility = "accepted";
      let exclusionReason: string | undefined;
      if (input.accuracyMeters > MAX_ACCURACY_METERS) {
        eligibility = "excluded";
        exclusionReason = "location_accuracy";
      } else if (!Number.isFinite(distance) || distance > PROXIMITY_METERS) {
        eligibility = "excluded";
        exclusionReason = "outside_spot_geofence";
      }

      const integrity = integritySnapshot.data() ?? {};
      const priorSpotId = stringValue(integrity["last_accepted_spot_id"]);
      const priorAcceptedAt = numberValue(integrity["last_accepted_at_raw_ms"]);
      if (eligibility === "accepted" && center && priorSpotId && priorAcceptedAt) {
        const priorSpot = await transaction.get(db.doc(`spots/${priorSpotId}`));
        const priorCenter = spotCenter(priorSpot.data());
        if (priorCenter) {
          const elapsedHours = Math.max((nowMs - priorAcceptedAt) / HOUR_MS, 1 / 60);
          if (haversineMeters(priorCenter, center) / 1_000 / elapsedHours > MAX_TRAVEL_SPEED_KMH) {
            eligibility = "excluded";
            exclusionReason = "impossible_travel";
          }
        }
      }

      const currentSession = sessionsSnapshot.docs.find((snapshot) => {
        const data = snapshot.data();
        const lastActivity = numberValue(data["last_activity_raw_ms"]);
        return data["source"] === "check_in" && lastActivity !== undefined &&
          nowMs - lastActivity < SESSION_IDLE_MS;
      });
      const sessionRef = currentSession?.ref ?? sessionCollection.doc();
      const currentVisits = currentSession ? visitRecordsFrom(currentSession.data()["spot_visits"]) : [];
      const visits = appendVisit(
        currentVisits,
        checkInId,
        input.spotId,
        spotNameFrom(spot),
        now,
        nowMs,
      );
      if (currentSession) {
        transaction.update(sessionRef, {
          spot_visits: visits,
          last_activity_at: now,
          last_activity_raw_ms: nowMs,
          time_updated: now,
          time_updated_raw_ms: nowMs,
        });
      } else {
        transaction.create(sessionRef, {
          owner_id: uid,
          source: "check_in",
          started_at: now,
          started_at_raw_ms: nowMs,
          last_activity_at: now,
          last_activity_raw_ms: nowMs,
          time_zone: input.timeZone,
          spot_visits: visits,
          people_present: [],
          time_created: now,
          time_created_raw_ms: nowMs,
          time_updated: now,
          time_updated_raw_ms: nowMs,
        });
      }

      const privateData = privateDataSnapshot.data() ?? {};
      const visited = Array.isArray(privateData["visited_spots"])
        ? privateData["visited_spots"].filter((item): item is string => typeof item === "string")
        : [];
      const index = indexSnapshot.data() ?? {};
      const previousCount = numberValue(index["visit_count"]) ?? 0;
      transaction.set(spotIndexRef, {
        visit_count: previousCount + 1,
        ...(previousCount === 0 ? {preexisting_visited: visited.includes(input.spotId)} : {}),
      }, {merge: true});
      if (previousCount === 0) {
        transaction.set(privateDataRef, {
          visited_spots: FieldValue.arrayUnion(input.spotId),
        }, {merge: true});
      }

      transaction.set(dedupeRef, {
        last_confirmed_at_raw_ms: nowMs,
        last_check_in_id: checkInId,
        session_record_id: sessionRef.id,
      });
      transaction.set(rateRef, {
        count: (numberValue(rate["count"]) ?? 0) + 1,
        expires_at: Timestamp.fromMillis(nowMs + 2 * HOUR_MS),
      });
      transaction.set(db.doc(`users/${uid}/check_in_lookup/${checkInId}`), {
        spot_id: input.spotId,
        session_record_id: sessionRef.id,
        accepted_for_aggregate: eligibility === "accepted",
      });
      transaction.set(db.doc(`spots/${input.spotId}/check_in_aggregate_contributions/${checkInId}`), {
        owner_id: uid,
        spot_id: input.spotId,
        session_record_id: sessionRef.id,
        check_in_id: checkInId,
        accepted_at: now,
        accepted_day: new Date(nowMs).toISOString().slice(0, 10),
        eligibility,
        verification_version: "server_proximity_v1",
        ...(exclusionReason ? {exclusion_reason: exclusionReason} : {}),
      });
      if (eligibility === "accepted" && center) {
        transaction.set(integrityRef, {
          last_accepted_spot_id: input.spotId,
          last_accepted_at_raw_ms: nowMs,
          last_check_in_id: checkInId,
        });
      }
      enqueueRollup(transaction, input.spotId, now);
      return {checkInId, sessionRecordId: sessionRef.id, duplicate: false};
    });
  },
);

export const deleteCheckIn = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<DeleteCheckInResponse> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to manage check-ins.");
    const input = request.data as DeleteCheckInRequest;
    if (!input || typeof input.checkInId !== "string" || !SPOT_ID_PATTERN.test(input.checkInId)) {
      throw new HttpsError("invalid-argument", "A valid check-in is required.");
    }
    return {deleted: await deleteCheckInForUser(uid, input.checkInId)};
  },
);

export const deleteAllCheckIns = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<DeleteAllCheckInsResponse> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to manage check-ins.");
    let deleted = 0;
    while (true) {
      const lookups = await db.collection(`users/${uid}/check_in_lookup`).limit(100).get();
      if (lookups.empty) break;
      for (const lookup of lookups.docs) {
        if (await deleteCheckInForUser(uid, lookup.id)) deleted += 1;
      }
    }
    return {deleted};
  },
);

const rebuildSpotActivity = async (spotId: string, now: Timestamp): Promise<void> => {
  const cutoff = Timestamp.fromMillis(now.toMillis() - ACTIVITY_WINDOW_MS);
  const contributions = db.collection(`spots/${spotId}/check_in_aggregate_contributions`);
  const accepted = await contributions
    .where("eligibility", "==", "accepted")
    .where("accepted_at", ">=", cutoff)
    .get();
  const accounts = new Set(
    accepted.docs
      .map((document) => stringValue(document.data()["owner_id"]))
      .filter((uid): uid is string => Boolean(uid)),
  );
  const publicRef = db.doc(`spot_activity_public/${spotId}`);
  const jobRef = db.doc(`check_in_activity_rollups/${spotId}`);
  const bucket = checkInActivityBucket(accounts.size);
  while (true) {
    const expired = await contributions.where("accepted_at", "<", cutoff).limit(400).get();
    if (expired.empty) break;
    const batch = db.batch();
    expired.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    if (expired.size < 400) break;
  }
  const remaining = await contributions
    .where("accepted_at", ">=", cutoff)
    .limit(1)
    .get();
  if (!bucket) await publicRef.delete();
  else await publicRef.set({status: "recently_trained", bucket, window_days: 30} satisfies SpotActivityPublicSchema);
  if (remaining.empty) await jobRef.delete();
  else await jobRef.set({spot_id: spotId, next_rollup_at: Timestamp.fromMillis(now.toMillis() + DAY_MS)});
};

export const recomputeCheckInActivity = onSchedule(
  {schedule: "30 3 * * *", timeZone: "Europe/Zurich"},
  async (): Promise<void> => {
    const now = Timestamp.now();
    while (true) {
      const due = await db.collection("check_in_activity_rollups")
        .where("next_rollup_at", "<=", now)
        .limit(200)
        .get();
      if (due.empty) return;
      for (const job of due.docs) {
        const spotId = stringValue(job.data()["spot_id"]);
        if (spotId) await rebuildSpotActivity(spotId, now);
        else await job.ref.delete();
      }
    }
  },
);
