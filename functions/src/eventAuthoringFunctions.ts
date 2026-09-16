import { hasApprovedOneIdAdultPolicy } from "./externalAgeVerificationPolicy";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  eventRegionsForCountry,
  normalizeEventCountryCode,
} from "../../src/db/schemas/EventGeography";
import type {
  EventOwnerSchema,
  EventSchema,
} from "../../src/db/schemas/EventSchema";
import type { EventSuggestionSchema } from "../../src/db/schemas/EventSuggestionSchema";
import type { OrganizationMemberSchema, OrganizationReferenceSchema, OrganizationSchema } from "../../src/db/schemas/OrganizationSchema";
import type { UserSchema } from "../../src/db/schemas/UserSchema";

const CALLABLE_OPTIONS = { cors: true, enforceAppCheck: true };
const MAX_PUBLIC_COMMUNITY_LISTINGS = 3;
const AUTHORING_RATE_LIMITS = "event_authoring_rate_limits";
const DAY_MS = 24 * 60 * 60 * 1_000;
const DAILY_AUTHORING_LIMITS = {
  community: 10,
  formal: 20,
  suggestion: 5,
} as const;

/**
 * Mirrors the Firestore compatibility switch. Set this only in the coordinated
 * release that enables unlisted community events.
 */
export const unlistedCommunityAuthoringEnabled = (): boolean => false;

type RecordValue = Record<string, unknown>;

interface CommunityEventInput {
  name: unknown;
  description?: unknown;
  locality: unknown;
  countryCode: unknown;
  startsAt: unknown;
  endsAt: unknown;
  timeZone: unknown;
  visibility: unknown;
  broadcast?: unknown;
}

interface FormalEventInput {
  name: unknown;
  description?: unknown;
  locality?: unknown;
  countryCode?: unknown;
  startsAt: unknown;
  endsAt: unknown;
  timeZone?: unknown;
  organizerName?: unknown;
  organizationId?: unknown;
  coverImageUrl?: unknown;
}

const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};

const cleanText = (
  value: unknown,
  name: string,
  max: number,
  required = true,
): string | undefined => {
  if (value === undefined || value === null || value === "") {
    if (!required) return undefined;
    throw new HttpsError("invalid-argument", `${name} is required.`);
  }
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${name} must be text.`);
  }
  const cleaned = value.replace(/\s+/gu, " ").trim();
  if (!cleaned || cleaned.length > max) {
    throw new HttpsError("invalid-argument", `${name} is invalid.`);
  }
  return cleaned;
};

const cleanOptionalUrl = (value: unknown, name: string): string | undefined => {
  const raw = cleanText(value, name, 2_000, false);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url.toString();
  } catch {
    throw new HttpsError("invalid-argument", `${name} must be a public HTTP URL.`);
  }
};

const cleanTimestamp = (value: unknown, name: string): Timestamp => {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${name} must be an ISO date and time.`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new HttpsError("invalid-argument", `${name} is invalid.`);
  }
  return Timestamp.fromDate(date);
};

const cleanTimeZone = (value: unknown, required = true): string | undefined => {
  const timeZone = cleanText(value, "Time zone", 100, required);
  if (!timeZone) return undefined;
  try {
    Intl.DateTimeFormat("en", { timeZone }).format(0);
    return timeZone;
  } catch {
    throw new HttpsError("invalid-argument", "Time zone is invalid.");
  }
};

const cleanVisibility = (value: unknown): "public" | "unlisted" => {
  if (value !== "public" && value !== "unlisted") {
    throw new HttpsError("invalid-argument", "Visibility must be public or unlisted.");
  }
  if (value === "unlisted" && !unlistedCommunityAuthoringEnabled()) {
    throw new HttpsError(
      "failed-precondition",
      "Unlisted community events are not available yet.",
    );
  }
  return value;
};

const cleanCountry = (value: unknown, required = true): string | undefined => {
  if ((value === undefined || value === null || value === "") && !required) {
    return undefined;
  }
  const country = normalizeEventCountryCode(value);
  if (!country) {
    throw new HttpsError("invalid-argument", "Choose a supported ISO country.");
  }
  return country;
};

const requireUser = async (uid: string): Promise<UserSchema> => {
  const snapshot = await admin.firestore().doc(`users/${uid}`).get();
  if (!snapshot.exists) throw new HttpsError("permission-denied", "User profile not found.");
  return snapshot.data() as UserSchema;
};

const hasVerifiedAdultEvidence = (user: UserSchema): boolean => {
  const policy = user.age_policy;
  if (hasApprovedOneIdAdultPolicy(policy)) return true;
  return (
    policy?.adult_eligibility === "verified" &&
    (policy.age_range?.lower ?? -1) >= 18 &&
    policy.assurance?.status === "active" &&
    (policy.assurance.client_integrity === "play_integrity_request_bound" || policy.assurance.client_integrity === "apple_app_attest_request_bound") &&
    typeof policy.assurance.approval_basis === "string" &&
    policy.assurance.approval_basis.length > 0
  );
};

const requireVerifiedAdult = async (uid: string): Promise<UserSchema> => {
  const user = await requireUser(uid);
  if (!hasVerifiedAdultEvidence(user)) {
    throw new HttpsError(
      "permission-denied",
      "An active server-confirmed 18+ assurance is required to publish activities.",
    );
  }
  return user;
};

const isAdmin = (user: UserSchema): boolean => user.is_admin === true;

const requireOrganizationManager = async (
  uid: string,
  organizationId: string,
  allowAdmin = false,
): Promise<OrganizationReferenceSchema> => {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(organizationId)) {
    throw new HttpsError("invalid-argument", "Organization is invalid.");
  }
  const [organizationSnapshot, memberSnapshot] = await Promise.all([
    admin.firestore().doc(`organizations/${organizationId}`).get(),
    admin.firestore().doc(`organizations/${organizationId}/members/${uid}`).get(),
  ]);
  const organization = organizationSnapshot.data() as OrganizationSchema | undefined;
  const role = (memberSnapshot.data() as OrganizationMemberSchema | undefined)?.role;
  if (
    !organizationSnapshot.exists ||
    organization?.active !== true ||
    !allowAdmin && (role !== "owner" && role !== "admin")
  ) {
    throw new HttpsError(
      "permission-denied",
      "An active organization owner or admin is required.",
    );
  }
  return {
    id: organizationId,
    name: organization.name,
    slug: organization.slug || organizationId,
    ...(organization.logo_url ? { logo_url: organization.logo_url } : {}),
    ...(organization.logo_background_color
      ? { logo_background_color: organization.logo_background_color }
      : {}),
  };
};

const communitySlug = (eventId: string): string => `community-event-${eventId}`;
const formalSlug = (eventId: string): string => `event-${eventId}`;

const activePublicCommunityListings = async (
  transaction: admin.firestore.Transaction,
  uid: string,
): Promise<number> => {
  const now = Timestamp.now();
  const query = admin
    .firestore()
    .collection("events")
    .where("owner.user_id", "==", uid)
    .where("listing_tier", "==", "community")
    .where("visibility", "==", "public")
    .where("lifecycle_status", "==", "planned");
  const snapshot = await transaction.get(query);
  return snapshot.docs.filter((document) => {
    const event = document.data() as EventSchema;
    const end = event.end as unknown as Timestamp | undefined;
    return !end || end.toMillis() >= now.toMillis();
  }).length;
};

const requirePublicCommunityCapacity = async (
  transaction: admin.firestore.Transaction,
  uid: string,
  excludingEventId?: string,
): Promise<void> => {
  const count = await activePublicCommunityListings(transaction, uid);
  const adjusted = excludingEventId ? Math.max(0, count - 1) : count;
  if (adjusted >= MAX_PUBLIC_COMMUNITY_LISTINGS) {
    throw new HttpsError(
      "resource-exhausted",
      `You can have up to ${MAX_PUBLIC_COMMUNITY_LISTINGS} active public community events.`,
    );
  }
};

/**
 * A small transaction-bound limit complements App Check and the active-listing
 * cap. It deliberately counts publication attempts, not edits or cancellations.
 */
const enforceAuthoringRateLimit = async (
  transaction: admin.firestore.Transaction,
  uid: string,
  kind: keyof typeof DAILY_AUTHORING_LIMITS,
): Promise<void> => {
  const now = Timestamp.now();
  const bucket = Math.floor(now.toMillis() / DAY_MS);
  const limit = DAILY_AUTHORING_LIMITS[kind];
  const rateRef = admin
    .firestore()
    .doc(`${AUTHORING_RATE_LIMITS}/${uid}_${kind}_${bucket}`);
  const current = await transaction.get(rateRef);
  const count = current.data()?.["count"];
  if (typeof count === "number" && count >= limit) {
    throw new HttpsError(
      "resource-exhausted",
      "You have reached today's publishing limit. Please try again tomorrow.",
    );
  }
  transaction.set(
    rateRef,
    {
      count: typeof count === "number" ? count + 1 : 1,
      updated_at: now,
      expires_at: Timestamp.fromMillis((bucket + 2) * DAY_MS),
    },
    { merge: true },
  );
};

const communityEvent = (
  uid: string,
  user: UserSchema,
  input: CommunityEventInput,
  eventId: string,
): EventSchema => {
  const visibility = cleanVisibility(input.visibility);
  const name = cleanText(input.name, "Title", 160)!;
  const locality = cleanText(input.locality, "City", 160)!;
  const country = cleanCountry(input.countryCode)!;
  const start = cleanTimestamp(input.startsAt, "Start");
  const end = cleanTimestamp(input.endsAt, "End");
  if (end.toMillis() <= start.toMillis()) {
    throw new HttpsError("invalid-argument", "End must be after start.");
  }
  const timeZone = cleanTimeZone(input.timeZone)!;
  const isPublic = visibility === "public";
  if (isPublic && user.public_profile_enabled !== true) {
    throw new HttpsError(
      "failed-precondition",
      "Public community events need a public organizer profile.",
    );
  }
  const now = Timestamp.now();
  return {
    name,
    ...(cleanText(input.description, "Description", 2_000, false)
      ? { description: cleanText(input.description, "Description", 2_000, false) }
      : {}),
    slug: communitySlug(eventId),
    locality_string: locality,
    country_code: country,
    region_keys: isPublic ? eventRegionsForCountry(country) : [],
    // Country keys already power the established community-follower and
    // community-page surfaces; city is held as display location, not guessed
    // into a locality key without an authoritative subdivision.
    community_keys: isPublic ? [`country:${country.toLowerCase()}`] : [],
    start: start as unknown as EventSchema["start"],
    end: end as unknown as EventSchema["end"],
    timing: {
      start_date: localDate(start.toDate(), timeZone),
      end_date: localDate(end.toDate(), timeZone),
      start_time: localTime(start.toDate(), timeZone),
      end_time: localTime(end.toDate(), timeZone),
      mode: "exact",
    },
    time_zone: timeZone,
    owner: { type: "user", user_id: uid },
    created_by: { uid },
    organizer_user: {
      uid,
      ...(isPublic && user.display_name ? { display_name: user.display_name } : {}),
      ...(isPublic && user.profile_picture ? { profile_picture: user.profile_picture } : {}),
    },
    kind: "other",
    event_categories: ["social"],
    listing_tier: "community",
    community_broadcast:
      isPublic && input.broadcast === true ? "on_publish" : "none",
    schedule_mode: "single",
    lifecycle_status: "planned",
    priority: "normal",
    publication_state: "published",
    published: true,
    visibility,
    discoverability: isPublic ? { audience: "global" } : { audience: "none" },
    attendance: {
      social: "rsvp",
      admission: "none",
      eligibility: { type: "everyone" },
    },
    notification_policy: "all",
    rsvp_counts: { going: 0, interested: 0, notgoing: 0, total: 0 },
    time_created: now as unknown as EventSchema["time_created"],
    time_updated: now as unknown as EventSchema["time_updated"],
  };
};

const localParts = (date: Date, timeZone: string): Record<string, string> =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

const localDate = (date: Date, timeZone: string): string => {
  const parts = localParts(date, timeZone);
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
};

const localTime = (date: Date, timeZone: string): string => {
  const parts = localParts(date, timeZone);
  return `${parts["hour"]}:${parts["minute"]}`;
};

const formalEvent = (
  uid: string,
  input: FormalEventInput,
  eventId: string,
  owner: EventOwnerSchema,
  organizer?: OrganizationReferenceSchema,
): EventSchema => {
  const start = cleanTimestamp(input.startsAt, "Start");
  const end = cleanTimestamp(input.endsAt, "End");
  if (end.toMillis() <= start.toMillis()) {
    throw new HttpsError("invalid-argument", "End must be after start.");
  }
  const timeZone = cleanTimeZone(input.timeZone, false);
  const country = cleanCountry(input.countryCode, false);
  const now = Timestamp.now();
  const organizerName = cleanText(input.organizerName, "Organizer", 160, false);
  return {
    name: cleanText(input.name, "Title", 160)!,
    ...(cleanText(input.description, "Description", 5_000, false)
      ? { description: cleanText(input.description, "Description", 5_000, false) }
      : {}),
    slug: formalSlug(eventId),
    ...(cleanText(input.locality, "City", 160, false)
      ? { locality_string: cleanText(input.locality, "City", 160, false) }
      : {}),
    ...(country ? { country_code: country, region_keys: eventRegionsForCountry(country) } : {}),
    ...(cleanOptionalUrl(input.coverImageUrl, "Cover image")
      ? { banner_src: cleanOptionalUrl(input.coverImageUrl, "Cover image") }
      : {}),
    start: start as unknown as EventSchema["start"],
    end: end as unknown as EventSchema["end"],
    ...(timeZone
      ? {
          timing: {
            start_date: localDate(start.toDate(), timeZone),
            end_date: localDate(end.toDate(), timeZone),
            start_time: localTime(start.toDate(), timeZone),
            end_time: localTime(end.toDate(), timeZone),
            mode: "exact" as const,
          },
          time_zone: timeZone,
        }
      : {}),
    owner,
    created_by: { uid },
    ...(organizer ? { organizer: { type: "organization" as const, organization: organizer } } : {}),
    ...(!organizer && organizerName ? { organizer_name: organizerName } : {}),
    kind: "other",
    listing_tier: "formal",
    schedule_mode: "single",
    lifecycle_status: "planned",
    priority: "normal",
    publication_state: "published",
    published: true,
    visibility: "public",
    discoverability: { audience: "global" },
    attendance: {
      social: "rsvp",
      admission: "none",
      eligibility: { type: "everyone" },
    },
    notification_policy: "all",
    rsvp_counts: { going: 0, interested: 0, notgoing: 0, total: 0 },
    time_created: now as unknown as EventSchema["time_created"],
    time_updated: now as unknown as EventSchema["time_updated"],
  };
};

export const createCommunityEvent = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<{ eventId: string; slug: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to plan a community event.");
    const user = await requireVerifiedAdult(uid);
    const input = record(request.data) as unknown as CommunityEventInput;
    const db = admin.firestore();
    const eventRef = db.collection("events").doc();
    const event = communityEvent(uid, user, input, eventRef.id);
    await db.runTransaction(async (transaction) => {
      if (event.visibility === "public") {
        await requirePublicCommunityCapacity(transaction, uid);
        await enforceAuthoringRateLimit(transaction, uid, "community");
      }
      transaction.create(eventRef, event);
      transaction.create(db.doc(`event_slugs/${event.slug}`), { event_id: eventRef.id });
    });
    return { eventId: eventRef.id, slug: event.slug! };
  },
);

export const updateCommunityEvent = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<{ ok: true }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to update a community event.");
    const user = await requireVerifiedAdult(uid);
    const input = record(request.data);
    const eventId = cleanText(input["eventId"], "Event", 128)!;
    const event = record(input["event"]) as unknown as CommunityEventInput;
    const eventRef = admin.firestore().doc(`events/${eventId}`);
    await admin.firestore().runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(eventRef);
      if (!currentSnapshot.exists) throw new HttpsError("not-found", "Community event not found.");
      const current = currentSnapshot.data() as EventSchema;
      if (
        current.listing_tier !== "community" ||
        current.owner?.type !== "user" ||
        current.owner.user_id !== uid
      ) {
        throw new HttpsError("permission-denied", "Only the community event organizer can edit it.");
      }
      const replacement = communityEvent(uid, user, event, eventId);
      if (replacement.visibility === "public" && current.visibility !== "public") {
        await requirePublicCommunityCapacity(transaction, uid, eventId);
        await enforceAuthoringRateLimit(transaction, uid, "community");
      }
      transaction.update(eventRef, {
        ...replacement,
        slug: current.slug ?? communitySlug(eventId),
        time_created: current.time_created,
        created_by: current.created_by,
        // Notification consent is a one-time publication choice. Editing an
        // event cannot add a broadcast after people may have been notified.
        community_broadcast: current.community_broadcast ?? "none",
      });
    });
    return { ok: true };
  },
);

export const cancelCommunityEvent = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<{ ok: true }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to cancel a community event.");
    await requireVerifiedAdult(uid);
    const eventId = cleanText(record(request.data)["eventId"], "Event", 128)!;
    const eventRef = admin.firestore().doc(`events/${eventId}`);
    await admin.firestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(eventRef);
      const event = snapshot.data() as EventSchema | undefined;
      if (
        !snapshot.exists ||
        event?.listing_tier !== "community" ||
        event.owner?.type !== "user" ||
        event.owner.user_id !== uid
      ) {
        throw new HttpsError("permission-denied", "Only the community event organizer can cancel it.");
      }
      transaction.update(eventRef, {
        lifecycle_status: "cancelled",
        lifecycle_update: { changed_at: Timestamp.now(), changed_by: uid },
        time_updated: Timestamp.now(),
      });
    });
    return { ok: true };
  },
);

export const createFormalEvent = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<{ eventId: string; slug: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to create an event.");
    const user = await requireVerifiedAdult(uid);
    const input = record(request.data) as unknown as FormalEventInput;
    const organizationId = cleanText(input.organizationId, "Organization", 128, false);
    const organizer = organizationId
      ? await requireOrganizationManager(uid, organizationId, isAdmin(user))
      : undefined;
    if (!organizer && !isAdmin(user)) {
      throw new HttpsError(
        "permission-denied",
        "Choose an organization you manage, or request staff review.",
      );
    }
    const db = admin.firestore();
    const eventRef = db.collection("events").doc();
    const event = formalEvent(
      uid,
      input,
      eventRef.id,
      organizer ? { type: "organization", organization_id: organizer.id } : { type: "user", user_id: uid },
      organizer,
    );
    await db.runTransaction(async (transaction) => {
      await enforceAuthoringRateLimit(transaction, uid, "formal");
      transaction.create(eventRef, event);
      transaction.create(db.doc(`event_slugs/${event.slug}`), { event_id: eventRef.id });
    });
    return { eventId: eventRef.id, slug: event.slug! };
  },
);

export const submitEventSuggestion = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<{ suggestionId: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to suggest an event.");
    await requireVerifiedAdult(uid);
    const input = record(request.data) as unknown as FormalEventInput & {
      sourceUrl?: unknown;
    };
    const start = cleanTimestamp(input.startsAt, "Start");
    const end = cleanTimestamp(input.endsAt, "End");
    if (end.toMillis() <= start.toMillis()) {
      throw new HttpsError("invalid-argument", "End must be after start.");
    }
    const country = cleanCountry(input.countryCode, false);
    const now = Timestamp.now();
    const suggestion: EventSuggestionSchema = {
      submitter_id: uid,
      name: cleanText(input.name, "Title", 160)!,
      ...(cleanText(input.description, "Description", 5_000, false)
        ? { description: cleanText(input.description, "Description", 5_000, false) }
        : {}),
      ...(cleanText(input.locality, "City", 160, false)
        ? { locality_string: cleanText(input.locality, "City", 160, false) }
        : {}),
      ...(country ? { country_code: country } : {}),
      start: start as unknown as EventSuggestionSchema["start"],
      end: end as unknown as EventSuggestionSchema["end"],
      ...(cleanTimeZone(input.timeZone, false) ? { time_zone: cleanTimeZone(input.timeZone, false) } : {}),
      ...(cleanText(input.organizerName, "Organizer", 160, false)
        ? { organizer_name: cleanText(input.organizerName, "Organizer", 160, false) }
        : {}),
      ...(cleanOptionalUrl(input.sourceUrl, "Source URL")
        ? { source_url: cleanOptionalUrl(input.sourceUrl, "Source URL") }
        : {}),
      status: "submitted",
      time_created: now as unknown as EventSuggestionSchema["time_created"],
      time_updated: now as unknown as EventSuggestionSchema["time_updated"],
    };
    const db = admin.firestore();
    const suggestionRef = db.collection("event_suggestions").doc();
    await db.runTransaction(async (transaction) => {
      await enforceAuthoringRateLimit(transaction, uid, "suggestion");
      transaction.create(suggestionRef, suggestion);
    });
    return { suggestionId: suggestionRef.id };
  },
);

export const reviewEventSuggestion = onCall(
  CALLABLE_OPTIONS,
  async (request): Promise<{ ok: true; eventId?: string; slug?: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to review suggestions.");
    const reviewer = await requireVerifiedAdult(uid);
    if (!isAdmin(reviewer)) throw new HttpsError("permission-denied", "Administrator access required.");
    const input = record(request.data);
    const suggestionId = cleanText(input["suggestionId"], "Suggestion", 128)!;
    const outcome = input["outcome"];
    if (outcome !== "approved" && outcome !== "rejected") {
      throw new HttpsError("invalid-argument", "Choose an approval outcome.");
    }
    const note = cleanText(input["note"], "Review note", 2_000, false);
    const db = admin.firestore();
    const suggestionRef = db.doc(`event_suggestions/${suggestionId}`);
    const eventRef = outcome === "approved" ? db.collection("events").doc() : undefined;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(suggestionRef);
      const suggestion = snapshot.data() as EventSuggestionSchema | undefined;
      if (!snapshot.exists || !suggestion) throw new HttpsError("not-found", "Suggestion not found.");
      if (suggestion.status !== "submitted") {
        throw new HttpsError("failed-precondition", "Suggestion has already been reviewed.");
      }
      const reviewedAt = Timestamp.now();
      if (outcome === "rejected") {
        transaction.update(suggestionRef, {
          status: "rejected",
          review: { reviewer_id: uid, outcome, ...(note ? { note } : {}), reviewed_at: reviewedAt },
          time_updated: reviewedAt,
        });
        return;
      }
      const formalInput: FormalEventInput = {
        name: suggestion.name,
        description: suggestion.description,
        locality: suggestion.locality_string,
        countryCode: suggestion.country_code,
        startsAt: (suggestion.start as unknown as Timestamp).toDate().toISOString(),
        endsAt: (suggestion.end as unknown as Timestamp).toDate().toISOString(),
        timeZone: suggestion.time_zone,
        organizerName: suggestion.organizer_name,
      };
      const event = formalEvent(
        uid,
        formalInput,
        eventRef!.id,
        { type: "user", user_id: uid },
      );
      transaction.create(eventRef!, event);
      transaction.create(db.doc(`event_slugs/${event.slug}`), { event_id: eventRef!.id });
      transaction.update(suggestionRef, {
        status: "approved",
        review: {
          reviewer_id: uid,
          outcome,
          ...(note ? { note } : {}),
          reviewed_at: reviewedAt,
          event_id: eventRef!.id,
        },
        time_updated: reviewedAt,
      });
    });
    return outcome === "approved"
      ? { ok: true, eventId: eventRef!.id, slug: formalSlug(eventRef!.id) }
      : { ok: true };
  },
);

/** Demotion is held behind the same legacy-client rollout switch as unlisted authoring. */
export const demoteCommunityEventsWhenProfileBecomesPrivate = onDocumentUpdated(
  "users/{uid}",
  async (event): Promise<void> => {
    if (!unlistedCommunityAuthoringEnabled()) return;
    const before = event.data?.before.data() as UserSchema | undefined;
    const after = event.data?.after.data() as UserSchema | undefined;
    if (before?.public_profile_enabled !== true || after?.public_profile_enabled === true) return;
    const uid = String(event.params["uid"]);
    const communityEvents = await admin
      .firestore()
      .collection("events")
      .where("owner.user_id", "==", uid)
      .where("listing_tier", "==", "community")
      .where("visibility", "==", "public")
      .get();
    for (let index = 0; index < communityEvents.docs.length; index += 400) {
      const batch = admin.firestore().batch();
      for (const communityEvent of communityEvents.docs.slice(index, index + 400)) {
        batch.update(communityEvent.ref, {
          visibility: "unlisted",
          discoverability: { audience: "none" },
          community_broadcast: "none",
          region_keys: [],
          time_updated: Timestamp.now(),
        });
      }
      await batch.commit();
    }
  },
);
