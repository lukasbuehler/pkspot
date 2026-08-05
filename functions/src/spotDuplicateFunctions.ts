import {createHash} from "node:crypto";
import * as admin from "firebase-admin";
import {FieldValue, GeoPoint, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import type {
  PreviewSpotDuplicateResolutionRequest,
  PreviewSpotDuplicateResolutionResponse,
  ResolveSpotDuplicateRequest,
  ResolveSpotDuplicateResponse,
  SpotDuplicateCandidatePreview,
  SpotDuplicateBlockerCode,
  SpotDuplicateDependencyCounts,
} from "../../src/db/schemas/SpotDuplicateResolutionSchema";
import type {MediaSchema} from "../../src/db/schemas/Media";

const CALLABLE_OPTIONS = {cors: true, invoker: "public" as const};
const RAPID_DUPLICATE_WINDOW_MS = 10_000;
const MAX_RESOLVABLE_EDITS = 50;
const CONTENT_FIELDS = [
  "access",
  "amenities",
  "bounds",
  "bounds_raw",
  "description",
  "external_references",
  "hide_streetview",
  "location",
  "location_raw",
  "media",
  "name",
  "type",
] as const;

type LoadedSpot = {
  id: string;
  ref: FirebaseFirestore.DocumentReference;
  data: FirebaseFirestore.DocumentData;
  updateTimeMillis: number;
  edits: FirebaseFirestore.QueryDocumentSnapshot[];
  createEdit: FirebaseFirestore.QueryDocumentSnapshot;
  dependencies: SpotDuplicateDependencyCounts;
  preview: SpotDuplicateCandidatePreview;
};

const db = admin.firestore();

const assertAdmin = async (uid: string | undefined): Promise<void> => {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const user = await db.doc(`users/${uid}`).get();
  if (user.data()?.["is_admin"] !== true) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
};

const spotIdFrom = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) {
    throw new HttpsError("invalid-argument", "A valid Spot id is required.");
  }
  return value;
};

const reportPathFrom = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !/^spots\/[A-Za-z0-9_-]+\/reports\/[A-Za-z0-9_-]+$/u.test(value)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "A valid Spot report is required.",
    );
  }
  return value;
};

const normalize = (value: unknown): unknown => {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof GeoPoint) {
    return {latitude: value.latitude, longitude: value.longitude};
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
};

const equal = (left: unknown, right: unknown): boolean =>
  JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));

const localizedText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const text = (entry as Record<string, unknown>)["text"];
      if (typeof text === "string") return text;
    }
  }
  return "";
};

const contentSubset = (
  subset: FirebaseFirestore.DocumentData,
  superset: FirebaseFirestore.DocumentData,
): boolean => CONTENT_FIELDS.every((field) => {
  const left = subset[field];
  const right = superset[field];
  if (left === undefined || left === null) return true;
  if (Array.isArray(left) && left.length === 0) return true;
  if (field === "media" && Array.isArray(left) && Array.isArray(right)) {
    const rightSources = new Set(right.map((item) => item?.src));
    return left.every((item) => rightSources.has(item?.src));
  }
  return equal(left, right);
});

const differentContentFields = (
  left: FirebaseFirestore.DocumentData,
  right: FirebaseFirestore.DocumentData,
): string[] => CONTENT_FIELDS.filter(
  (field) => !equal(left[field], right[field]),
);

const queryCount = async (
  query: FirebaseFirestore.Query,
): Promise<number> => (await query.count().get()).data().count;

const dependencyCounts = async (
  spotRef: FirebaseFirestore.DocumentReference,
): Promise<SpotDuplicateDependencyCounts> => {
  const spotId = spotRef.id;
  const [
    edits,
    reviews,
    reports,
    challenges,
    events,
    checkIns,
    bookmarked,
    visited,
    homeSpots,
    verified,
    managed,
    used,
    aliases,
  ] = await Promise.all([
    spotRef.collection("edits").get(),
    spotRef.collection("reviews").count().get(),
    spotRef.collection("reports").count().get(),
    spotRef.collection("challenges").count().get(),
    queryCount(
      db.collection("events").where("spot_ids", "array-contains", spotId),
    ),
    queryCount(
      db.collectionGroup("check_ins").where("spot_id", "==", spotId),
    ),
    queryCount(db.collectionGroup("private_data")
      .where("bookmarks", "array-contains", spotId)),
    queryCount(db.collectionGroup("private_data")
      .where("visited_spots", "array-contains", spotId)),
    queryCount(
      db.collection("users").where("home_spots", "array-contains", spotId),
    ),
    queryCount(
      db.collectionGroup("verified_spots").where("spot_id", "==", spotId),
    ),
    queryCount(
      db.collectionGroup("managed_spots").where("spot_id", "==", spotId),
    ),
    queryCount(
      db.collectionGroup("used_spots").where("spot_id", "==", spotId),
    ),
    db.collection("spot_slugs").where("spot_id", "==", spotId).get(),
  ]);
  return {
    edits: edits.size,
    reviews: reviews.data().count,
    reports: reports.data().count,
    challenges: challenges.data().count,
    events,
    checkIns,
    privateLists: bookmarked + visited,
    homeSpots,
    organizationReferences: verified + managed + used,
    slugAliases: aliases.size,
  };
};

const loadSpot = async (spotId: string): Promise<LoadedSpot> => {
  const ref = db.doc(`spots/${spotId}`);
  const [snapshot, editsSnapshot, dependencies] = await Promise.all([
    ref.get(),
    ref.collection("edits").get(),
    dependencyCounts(ref),
  ]);
  if (!snapshot.exists) {
    throw new HttpsError("not-found", `Spot ${spotId} was not found.`);
  }
  const edits = editsSnapshot.docs.sort(
    (left, right) =>
      (left.data()["timestamp_raw_ms"] ?? 0) -
      (right.data()["timestamp_raw_ms"] ?? 0),
  );
  const createEdit = edits.find((edit) => edit.data()["type"] === "CREATE");
  if (!createEdit) {
    throw new HttpsError("failed-precondition", "A Spot has no CREATE edit.");
  }
  const data = snapshot.data() ?? {};
  return {
    id: spotId,
    ref,
    data,
    updateTimeMillis: snapshot.updateTime?.toMillis() ?? 0,
    edits,
    createEdit,
    dependencies,
    preview: {
      id: spotId,
      name: localizedText(data["name"]) || spotId,
      description: localizedText(data["description"]) || undefined,
      media: Array.isArray(data["media"]) ? data["media"] as MediaSchema[] : [],
      creatorUid: createEdit.data()["user"]?.["uid"],
      createdAtMillis: createEdit.data()["timestamp_raw_ms"],
      editCount: edits.length,
      dependencies,
      uniqueFields: [],
    },
  };
};

const blockersFor = (
  reported: LoadedSpot,
  candidate: LoadedSpot,
  redundant: LoadedSpot,
  reportPath: string,
): SpotDuplicateBlockerCode[] => {
  const blockers: SpotDuplicateBlockerCode[] = [];
  const reportedCreate = reported.createEdit.data();
  const candidateCreate = candidate.createEdit.data();
  if (reportedCreate["user"]?.["uid"] !== candidateCreate["user"]?.["uid"]) {
    blockers.push("different_creator");
  }
  if (!equal(reportedCreate["data"], candidateCreate["data"])) {
    blockers.push("different_create_payload");
  }
  const timeDifference = Math.abs(
    (reportedCreate["timestamp_raw_ms"] ?? 0) -
      (candidateCreate["timestamp_raw_ms"] ?? 0),
  );
  if (timeDifference > RAPID_DUPLICATE_WINDOW_MS) {
    blockers.push("outside_rapid_window");
  }
  if (redundant.edits.length > MAX_RESOLVABLE_EDITS) {
    blockers.push("too_many_edits");
  }
  const canonicalData = redundant === reported ? candidate.data : reported.data;
  if (!contentSubset(redundant.data, canonicalData)) {
    blockers.push("unique_content");
  }
  const dependencies = redundant.dependencies;
  if (dependencies.reviews) blockers.push("reviews");
  if (dependencies.challenges) blockers.push("challenges");
  if (dependencies.events) blockers.push("events");
  if (dependencies.checkIns) blockers.push("check_ins");
  if (dependencies.privateLists) blockers.push("private_lists");
  if (dependencies.homeSpots) blockers.push("home_spot");
  if (dependencies.organizationReferences) {
    blockers.push("organization_reference");
  }
  const sourceIsOnRedundant = reportPath.startsWith(`spots/${redundant.id}/`);
  const allowedReports = sourceIsOnRedundant ? 1 : 0;
  if (dependencies.reports > allowedReports) {
    blockers.push("unrelated_reports");
  }
  return blockers;
};

const tokenFor = (
  reportPath: string,
  reportUpdateTimeMillis: number,
  reported: LoadedSpot,
  candidate: LoadedSpot,
): string => createHash("sha256").update(JSON.stringify(normalize({
  reportPath,
  reportUpdateTimeMillis,
  reported: {
    id: reported.id,
    update: reported.updateTimeMillis,
    edits: reported.edits.map((edit) => [edit.id, edit.updateTime.toMillis()]),
    dependencies: reported.dependencies,
  },
  candidate: {
    id: candidate.id,
    update: candidate.updateTimeMillis,
    edits: candidate.edits.map((edit) => [edit.id, edit.updateTime.toMillis()]),
    dependencies: candidate.dependencies,
  },
}))).digest("hex");

const buildPreview = async (
  reportPath: string,
  candidateSpotId: string,
): Promise<PreviewSpotDuplicateResolutionResponse & {
  loadedReported: LoadedSpot;
  loadedCandidate: LoadedSpot;
}> => {
  const reportRef = db.doc(reportPath);
  const reportSnapshot = await reportRef.get();
  if (!reportSnapshot.exists) {
    throw new HttpsError("not-found", "Duplicate report was not found.");
  }
  if (reportSnapshot.data()?.["reason"] !== "duplicate") {
    throw new HttpsError(
      "failed-precondition",
      "Report is not a duplicate report.",
    );
  }
  const reportedSpotId = reportRef.parent.parent?.id;
  if (!reportedSpotId || reportedSpotId === candidateSpotId) {
    throw new HttpsError(
      "invalid-argument",
      "Choose a different candidate Spot.",
    );
  }
  const [reported, candidate] = await Promise.all([
    loadSpot(reportedSpotId),
    loadSpot(candidateSpotId),
  ]);
  reported.preview.uniqueFields = differentContentFields(
    reported.data,
    candidate.data,
  );
  candidate.preview.uniqueFields = differentContentFields(
    candidate.data,
    reported.data,
  );
  const eligibleCanonicalSpotIds = [reported, candidate]
    .filter((canonical) => {
      const redundant = canonical === reported ? candidate : reported;
      return blockersFor(
        reported,
        candidate,
        redundant,
        reportPath,
      ).length === 0;
    })
    .map((spot) => spot.id);
  const blockers = eligibleCanonicalSpotIds.length > 0 ? [] : [
    ...new Set([
      ...blockersFor(reported, candidate, reported, reportPath),
      ...blockersFor(reported, candidate, candidate, reportPath),
    ]),
  ];
  return {
    reported: reported.preview,
    candidate: candidate.preview,
    eligibleCanonicalSpotIds,
    blockers,
    previewToken: tokenFor(
      reportPath,
      reportSnapshot.updateTime?.toMillis() ?? 0,
      reported,
      candidate,
    ),
    loadedReported: reported,
    loadedCandidate: candidate,
  };
};

export const previewSpotDuplicateResolution =
  onCall<PreviewSpotDuplicateResolutionRequest>(
    CALLABLE_OPTIONS,
    async (request): Promise<PreviewSpotDuplicateResolutionResponse> => {
      await assertAdmin(request.auth?.uid);
      const reportPath = reportPathFrom(request.data?.reportPath);
      const candidateSpotId = spotIdFrom(request.data?.candidateSpotId);
      const preview = await buildPreview(reportPath, candidateSpotId);
      return {
        reported: preview.reported,
        candidate: preview.candidate,
        eligibleCanonicalSpotIds: preview.eligibleCanonicalSpotIds,
        blockers: preview.blockers,
        previewToken: preview.previewToken,
      };
    },
  );

const leaderboardEntries = (
  userId: string,
  snapshot: FirebaseFirestore.DocumentSnapshot,
  count: number,
): unknown[] => {
  const data = snapshot.data();
  const entries = Array.isArray(data?.["entries"]) ? [...data["entries"]] : [];
  const index = entries.findIndex((entry) => entry?.uid === userId);
  if (index >= 0) entries[index] = {...entries[index], count};
  entries.sort((left, right) => (right.count ?? 0) - (left.count ?? 0));
  return entries.slice(0, 50);
};

const nextContributionCounts = (
  user: FirebaseFirestore.DocumentSnapshot,
  counts: {edits: number; creates: number; media: number},
): Record<string, number> => {
  const data = user.data() ?? {};
  return {
    spots_edited: Math.max(0, (data["spot_edits_count"] ?? 0) - counts.edits),
    spots_created: Math.max(
      0,
      (data["spot_creates_count"] ?? 0) - counts.creates,
    ),
    media_added: Math.max(0, (data["media_added_count"] ?? 0) - counts.media),
  };
};

export const resolveSpotDuplicate = onCall<ResolveSpotDuplicateRequest>(
  CALLABLE_OPTIONS,
  async (request): Promise<ResolveSpotDuplicateResponse> => {
    const adminUid = request.auth?.uid;
    await assertAdmin(adminUid);
    const reportPath = reportPathFrom(request.data?.reportPath);
    const canonicalSpotId = spotIdFrom(request.data?.canonicalSpotId);
    const redundantSpotId = spotIdFrom(request.data?.redundantSpotId);
    const previewToken = request.data?.previewToken;
    if (
      canonicalSpotId === redundantSpotId ||
      typeof previewToken !== "string"
    ) {
      throw new HttpsError("invalid-argument", "Invalid duplicate resolution.");
    }
    const actionId = createHash("sha256")
      .update(`${reportPath}:${canonicalSpotId}:${redundantSpotId}`)
      .digest("hex");
    const actionRef = db.doc(`moderation_actions/${actionId}`);
    if ((await actionRef.get()).exists) {
      return {ok: true, canonicalSpotId, redundantSpotId, replayed: true};
    }
    const reportedSpotId = db.doc(reportPath).parent.parent?.id;
    const candidateSpotId = reportedSpotId === canonicalSpotId ?
      redundantSpotId :
      canonicalSpotId;
    const preview = await buildPreview(reportPath, candidateSpotId);
    if (preview.previewToken !== previewToken) {
      throw new HttpsError("aborted", "Spot data changed; preview again.");
    }
    if (!preview.eligibleCanonicalSpotIds.includes(canonicalSpotId)) {
      throw new HttpsError(
        "failed-precondition",
        preview.blockers.join(", ") || "Duplicate resolution is blocked.",
      );
    }
    const redundant = preview.loadedReported.id === redundantSpotId ?
      preview.loadedReported :
      preview.loadedCandidate.id === redundantSpotId ?
        preview.loadedCandidate :
        undefined;
    const canonical = preview.loadedReported.id === canonicalSpotId ?
      preview.loadedReported :
      preview.loadedCandidate.id === canonicalSpotId ?
        preview.loadedCandidate :
        undefined;
    if (!redundant || !canonical) {
      throw new HttpsError("invalid-argument", "Preview Spots do not match.");
    }
    const votes = await Promise.all(
      redundant.edits.map((edit) => edit.ref.collection("votes").get()),
    );
    const aliases = await db.collection("spot_slugs")
      .where("spot_id", "==", redundant.id)
      .get();
    const creatorUid = redundant.createEdit.data()["user"]?.["uid"];
    const approvedEdits = redundant.edits.filter(
      (edit) => edit.data()["approved"] === true,
    );
    const counts = {
      edits: approvedEdits.length,
      creates: approvedEdits.filter(
        (edit) => edit.data()["type"] === "CREATE",
      ).length,
      media: approvedEdits.reduce(
        (sum, edit) => sum + (Array.isArray(edit.data()["data"]?.["media"]) ?
          edit.data()["data"]["media"].length :
          0),
        0,
      ),
    };
    const redundantReports = await redundant.ref.collection("reports").get();
    const sourceReportRef = db.doc(reportPath);
    const sourceReportIsOnRedundant = reportPath.startsWith(
      `spots/${redundant.id}/`,
    );
    const creatorRef = creatorUid ? db.doc(`users/${creatorUid}`) : null;
    const leaderboardRefs = [
      db.doc("leaderboards/spots_edited"),
      db.doc("leaderboards/spots_created"),
      db.doc("leaderboards/media_added"),
    ];
    const writeCount =
      aliases.size +
      votes.reduce((sum, snapshot) => sum + snapshot.size, 0) +
      redundant.edits.length +
      redundantReports.size +
      2 +
      (sourceReportIsOnRedundant ? 0 : 1) +
      (creatorRef ? 4 : 0);
    if (writeCount > 480) {
      throw new HttpsError(
        "failed-precondition",
        "Resolution exceeds the safe write limit.",
      );
    }
    const replayed = await db.runTransaction(async (transaction) => {
      const action = await transaction.get(actionRef);
      if (action.exists) return true;

      const sourceReport = await transaction.get(sourceReportRef);
      const creator = creatorRef ? await transaction.get(creatorRef) : null;
      const leaderboards = creator?.exists ?
        await Promise.all(leaderboardRefs.map((ref) => transaction.get(ref))) :
        [];

      aliases.docs.forEach((alias) => {
        transaction.update(alias.ref, {spot_id: canonical.id});
      });
      votes.flatMap((snapshot) => snapshot.docs).forEach((vote) => {
        transaction.delete(vote.ref);
      });
      redundant.edits.forEach((edit) => transaction.delete(edit.ref));
      redundantReports.docs.forEach((report) => transaction.delete(report.ref));
      if (!sourceReportIsOnRedundant) {
        transaction.update(sourceReportRef, {
          status: "resolved",
          resolvedAt: FieldValue.serverTimestamp(),
          resolvedBy: {uid: adminUid},
          resolutionNote: "Resolved as a verified rapid-submit duplicate.",
        });
      }
      transaction.delete(redundant.ref);

      if (creator?.exists && creatorRef) {
        const next = nextContributionCounts(creator, counts);
        transaction.set(creatorRef, {
          spot_edits_count: next["spots_edited"],
          spot_creates_count: next["spots_created"],
          media_added_count: next["media_added"],
        }, {merge: true});
        leaderboardRefs.forEach((ref, index) => {
          const leaderboardId = ref.id;
          transaction.set(ref, {
            entries: leaderboardEntries(
              creator.id,
              leaderboards[index],
              next[leaderboardId],
            ),
            updated_at: FieldValue.serverTimestamp(),
          }, {merge: true});
        });
      }
      transaction.create(actionRef, {
        action_type: "resolve_duplicate_spot",
        source_type: "spot_report",
        source_path: reportPath,
        source_snapshot: sourceReport.data() ?? {},
        target_type: "spot",
        target_path: canonical.ref.path,
        target_snapshot: canonical.data,
        created_at: FieldValue.serverTimestamp(),
        created_by: {uid: adminUid},
        decision: {
          canonical_spot_id: canonical.id,
          redundant_spot_id: redundant.id,
          preview_token: previewToken,
          contribution_adjustment: counts,
        },
      });
      return false;
    });
    if (replayed) {
      return {ok: true, canonicalSpotId, redundantSpotId, replayed: true};
    }
    if (!sourceReportIsOnRedundant) {
      const remaining = await canonical.ref.collection("reports").get();
      const hasOpenReports = remaining.docs.some((report) => {
        const status = report.data()["status"];
        return status !== "resolved" && status !== "dismissed";
      });
      if (!hasOpenReports) {
        await canonical.ref.update({
          is_reported: FieldValue.delete(),
          report_reason: FieldValue.delete(),
          isReported: FieldValue.delete(),
          reportReason: FieldValue.delete(),
          latest_report_at: FieldValue.delete(),
          public_notice: FieldValue.delete(),
        });
      }
    }
    return {ok: true, canonicalSpotId, redundantSpotId, replayed: false};
  },
);
