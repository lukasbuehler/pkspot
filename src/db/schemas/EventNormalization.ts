import {
  EVENT_ADMISSION_MODES,
  EVENT_DISCOVERABILITIES,
  EVENT_KINDS,
  EVENT_LIFECYCLE_STATUSES,
  EVENT_NOTIFICATION_POLICIES,
  EVENT_PRIORITIES,
  EVENT_PUBLICATION_STATES,
  EVENT_SCHEDULE_MODES,
  EVENT_SOCIAL_ATTENDANCE_MODES,
  EVENT_VISIBILITIES,
  EventAttendanceSchema,
  EventCategory,
  EventDisplayedLifecycleStatus,
  EventKind,
  EventOwnerSchema,
  EventSchema,
} from "./EventSchema";
import { validateEventTiming } from "../utils/event-timing";

export const DEFAULT_EVENT_ATTENDANCE: Readonly<EventAttendanceSchema> = {
  social: "rsvp",
  admission: "none",
  eligibility: { type: "everyone" },
};

export interface EventNormalizationOptions {
  fallbackOwner?: EventOwnerSchema;
  /** New event creation requires an owner; legacy normalization does not. */
  requireOwner?: boolean;
}

export interface EventNormalizationResult {
  patch: Partial<EventSchema>;
  invalid: string[];
}

const includes = <T extends string>(
  values: readonly T[],
  value: unknown,
): value is T => typeof value === "string" && values.includes(value as T);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const hasOnlyKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => Object.keys(value).every((key) => keys.includes(key));

const discoverabilityIsValid = (
  value: unknown,
): value is NonNullable<EventSchema["discoverability"]> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  if (!includes(EVENT_DISCOVERABILITIES, policy["audience"])) return false;
  return policy["audience"] === "organization_followers" ||
    policy["audience"] === "organization_members"
    ? nonEmptyString(policy["organization_id"]) &&
        hasOnlyKeys(policy, ["audience", "organization_id"])
    : hasOnlyKeys(policy, ["audience"]);
};

export const isEventOwner = (value: unknown): value is EventOwnerSchema => {
  if (!value || typeof value !== "object") return false;
  const owner = value as Record<string, unknown>;
  return (
    (owner["type"] === "user" &&
      nonEmptyString(owner["user_id"]) &&
      hasOnlyKeys(owner, ["type", "user_id"])) ||
    (owner["type"] === "organization" &&
      nonEmptyString(owner["organization_id"]) &&
      hasOnlyKeys(owner, ["type", "organization_id"]))
  );
};

export const eventKindFromLegacyCategories = (
  categories: readonly EventCategory[] | undefined,
): EventKind => {
  const inferredKinds = new Set(
    (categories ?? []).map((category): EventKind => {
      switch (category) {
        case "competition":
          return "competition";
        case "workshop":
          return "workshop";
        case "camp":
        case "show":
        case "awards":
          return "festival";
        case "jam":
        case "social":
        case "travel":
          return "session";
        case "other":
          return "other";
      }
    }),
  );
  return inferredKinds.size === 1
    ? (inferredKinds.values().next().value ?? "other")
    : "other";
};

export const legacyCategoryForEventKind = (kind: EventKind): EventCategory => {
  switch (kind) {
    case "session":
      return "jam";
    case "class":
    case "workshop":
      return "workshop";
    case "competition":
      return "competition";
    case "festival":
      return "camp";
    case "other":
      return "other";
  }
};

export const eventIsPublished = (
  data: Pick<EventSchema, "publication_state" | "published">,
): boolean =>
  data.publication_state !== undefined
    ? data.publication_state === "published"
    : data.published !== false;

const attendanceIsValid = (value: unknown): value is EventAttendanceSchema => {
  if (!value || typeof value !== "object") return false;
  const attendance = value as Record<string, unknown>;
  if (
    !hasOnlyKeys(attendance, [
      "social",
      "admission",
      "capacity",
      "waitlist",
      "eligibility",
      "instructions",
      "instructions_i18n",
    ])
  ) {
    return false;
  }
  if (
    !includes(EVENT_SOCIAL_ATTENDANCE_MODES, attendance["social"]) ||
    !includes(EVENT_ADMISSION_MODES, attendance["admission"])
  ) {
    return false;
  }
  if (
    attendance["instructions"] !== undefined &&
    typeof attendance["instructions"] !== "string"
  ) {
    return false;
  }
  if (
    attendance["instructions_i18n"] !== undefined &&
    (!attendance["instructions_i18n"] ||
      typeof attendance["instructions_i18n"] !== "object" ||
      Array.isArray(attendance["instructions_i18n"]) ||
      Object.values(
        attendance["instructions_i18n"] as Record<string, unknown>,
      ).some(
        (translation) =>
          typeof translation !== "string" &&
          (!translation ||
            typeof translation !== "object" ||
            typeof (translation as { text?: unknown }).text !== "string"),
      ))
  ) {
    return false;
  }
  if (
    attendance["capacity"] !== undefined &&
    (!Number.isInteger(attendance["capacity"]) ||
      (attendance["capacity"] as number) <= 0 ||
      attendance["admission"] !== "registration")
  ) {
    return false;
  }
  const eligibility = attendance["eligibility"];
  if (eligibility !== undefined) {
    if (
      !eligibility ||
      typeof eligibility !== "object" ||
      Array.isArray(eligibility)
    ) {
      return false;
    }
    const policy = eligibility as Record<string, unknown>;
    if (
      policy["type"] !== "everyone" &&
      policy["type"] !== "invited" &&
      policy["type"] !== "organization_members"
    ) {
      return false;
    }
    if (
      policy["type"] === "organization_members" &&
      (!nonEmptyString(policy["organization_id"]) ||
        !hasOnlyKeys(policy, ["type", "organization_id"]))
    ) {
      return false;
    }
    if (
      policy["type"] !== "organization_members" &&
      !hasOnlyKeys(policy, ["type"])
    ) {
      return false;
    }
  }
  return (
    attendance["waitlist"] === undefined ||
    (typeof attendance["waitlist"] === "boolean" &&
      attendance["admission"] === "registration")
  );
};

/**
 * Build an additive, idempotent patch for a legacy or partially normalized
 * event. Existing valid normalized choices win; invalid values are reported
 * instead of silently replaced.
 *
 * Legacy kind inference is deliberately conservative: multiple categories
 * infer a kind only when they all map to the same kind. Ambiguous combinations
 * fall back to `other` for manual classification. `event_categories` remains
 * intact, except that an explicitly stored `kind` adds its closest legacy
 * category for older clients.
 */
export const normalizeEventModel = (
  data: Partial<EventSchema>,
  options: EventNormalizationOptions = {},
): EventNormalizationResult => {
  const patch: Partial<EventSchema> = {};
  const invalid: string[] = [];

  const publicationState = data.publication_state;
  if (
    publicationState !== undefined &&
    !includes(EVENT_PUBLICATION_STATES, publicationState)
  ) {
    invalid.push("publication_state");
  } else {
    const normalizedPublication =
      publicationState ?? (data.published === false ? "draft" : "published");
    if (publicationState === undefined) {
      patch.publication_state = normalizedPublication;
    }
    const legacyPublished = normalizedPublication === "published";
    if (data.published !== legacyPublished) patch.published = legacyPublished;
  }

  const assignEnumDefault = <K extends keyof EventSchema, T extends string>(
    key: K,
    values: readonly T[],
    fallback: T,
  ): void => {
    const value = data[key];
    if (value === undefined) {
      (patch as Record<string, unknown>)[key] = fallback;
    } else if (!includes(values, value)) {
      invalid.push(String(key));
    }
  };

  assignEnumDefault("visibility", EVENT_VISIBILITIES, "public");
  const visibility = includes(EVENT_VISIBILITIES, data.visibility)
    ? data.visibility
    : "public";
  if (data.discoverability === undefined) {
    patch.discoverability = {
      audience: visibility === "public" ? "global" : "none",
    };
  } else if (!discoverabilityIsValid(data.discoverability)) {
    invalid.push("discoverability");
  }
  if (data.viewer_policy !== undefined) {
    const policy = data.viewer_policy as unknown as Record<string, unknown>;
    const valid =
      !!policy &&
      ((policy["audience"] === "invited" &&
        hasOnlyKeys(policy, ["audience"])) ||
        (policy["audience"] === "organization_members" &&
          nonEmptyString(policy["organization_id"]) &&
          hasOnlyKeys(policy, ["audience", "organization_id"])));
    if (!valid) invalid.push("viewer_policy");
  } else if (visibility === "private") {
    patch.viewer_policy = { audience: "invited" };
  }
  assignEnumDefault(
    "kind",
    EVENT_KINDS,
    eventKindFromLegacyCategories(data.event_categories),
  );
  assignEnumDefault("schedule_mode", EVENT_SCHEDULE_MODES, "single");
  assignEnumDefault("lifecycle_status", EVENT_LIFECYCLE_STATUSES, "planned");
  assignEnumDefault("priority", EVENT_PRIORITIES, "normal");
  assignEnumDefault(
    "notification_policy",
    EVENT_NOTIFICATION_POLICIES,
    "all",
  );

  if (data.attendance === undefined) {
    patch.attendance = { ...DEFAULT_EVENT_ATTENDANCE };
  } else if (!attendanceIsValid(data.attendance)) {
    invalid.push("attendance");
  }

  if (data.timing !== undefined) {
    const activeUntil = timestampLikeToDate(data.active_until);
    const timingValidation = validateEventTiming(
      data.timing,
      data.time_zone,
      activeUntil,
    );
    if (!timingValidation.valid) invalid.push("timing");
  }

  if (data.organizer?.type === "organization") {
    if (data.organizer_access === undefined) {
      patch.organizer_access = "view";
    } else if (
      data.organizer_access !== "view" &&
      data.organizer_access !== "edit"
    ) {
      invalid.push("organizer_access");
    }
  } else if (data.organizer_access !== undefined) {
    invalid.push("organizer_access");
  }

  if (data.owner === undefined) {
    const owner = options.fallbackOwner;
    if (owner && isEventOwner(owner)) {
      patch.owner = owner;
    } else if (options.requireOwner) {
      invalid.push("owner");
    }
  } else if (!isEventOwner(data.owner)) {
    invalid.push("owner");
  }

  if (data.kind && includes(EVENT_KINDS, data.kind)) {
    const compatibilityCategory = legacyCategoryForEventKind(data.kind);
    const categories = data.event_categories ?? [];
    if (!categories.includes(compatibilityCategory)) {
      patch.event_categories = [...categories, compatibilityCategory];
    }
  }

  return { patch, invalid };
};

const timestampLikeToDate = (
  value: EventSchema["active_until"] | undefined,
): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const seconds = Number(
    (value as unknown as { seconds?: unknown; _seconds?: unknown }).seconds ??
      (value as unknown as { _seconds?: unknown })._seconds,
  );
  return Number.isFinite(seconds) ? new Date(seconds * 1_000) : undefined;
};

const validDate = (value: Date | null | undefined): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());

/**
 * Cancelled always wins. Otherwise invalid/missing/reversed times stay
 * `planned`; they must never accidentally appear live or completed.
 * Boundaries are inclusive at start and end.
 */
export const displayedEventLifecycle = (
  stored: "planned" | "cancelled",
  start: Date | null | undefined,
  end: Date | null | undefined,
  now: Date = new Date(),
): EventDisplayedLifecycleStatus => {
  if (stored === "cancelled") return "cancelled";
  if (
    !validDate(start) ||
    !validDate(end) ||
    !validDate(now) ||
    end.getTime() < start.getTime()
  ) {
    return "planned";
  }
  if (now.getTime() < start.getTime()) return "planned";
  if (now.getTime() <= end.getTime()) return "live";
  return "completed";
};
