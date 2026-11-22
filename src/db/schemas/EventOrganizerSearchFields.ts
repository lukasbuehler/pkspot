import type { EventSchema } from "./EventSchema";

/**
 * Which kind of organizer an event names, in display precedence order:
 * a PK Spot organization, a community member (`organizer_user`), or a plain
 * text name (`organizer_name`).
 */
export const EVENT_ORGANIZER_KINDS = ["organization", "user", "name"] as const;
export type EventOrganizerKind = (typeof EVENT_ORGANIZER_KINDS)[number];

/**
 * Flat, server-derived organizer fields stored on the event document so the
 * discovery projection and Typesense can show who hosts an event without the
 * nested organizer objects. Every value is already public on the event page.
 */
export interface EventOrganizerSearchFields {
  organizer_kind?: EventOrganizerKind;
  /** Resolved like `Event.organizerName`. */
  organizer_display_name?: string;
  organizer_organization_id?: string;
  organizer_organization_slug?: string;
  organizer_logo_url?: string;
  organizer_logo_background_color?: string;
  organizer_user_id?: string;
  organizer_user_avatar_url?: string;
}

/** Field names in a stable order, for helper-field and projection lists. */
export const EVENT_ORGANIZER_SEARCH_FIELD_NAMES = [
  "organizer_kind",
  "organizer_display_name",
  "organizer_organization_id",
  "organizer_organization_slug",
  "organizer_logo_url",
  "organizer_logo_background_color",
  "organizer_user_id",
  "organizer_user_avatar_url",
] as const satisfies readonly (keyof EventOrganizerSearchFields)[];

const nonEmpty = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Derive the organizer search fields from an event. Only fields with a value
 * are returned, so a caller that deletes absent server-derived fields clears
 * stale values when an organizer is removed or replaced.
 *
 * Copies only public snapshots: the organization reference and the
 * server-written `organizer_user` (uid, display name, profile picture).
 */
export const deriveEventOrganizerSearchFields = (
  event: Pick<EventSchema, "organizer" | "organizer_user" | "organizer_name">,
): EventOrganizerSearchFields => {
  const plainName = nonEmpty(event.organizer_name);

  const organization =
    event.organizer?.type === "organization"
      ? event.organizer.organization
      : undefined;
  const organizationId = nonEmpty(organization?.id);
  if (organization && organizationId) {
    return withoutUndefined({
      organizer_kind: "organization",
      organizer_display_name:
        nonEmpty(organization.name) ??
        nonEmpty(event.organizer_user?.display_name) ??
        plainName,
      organizer_organization_id: organizationId,
      organizer_organization_slug: nonEmpty(organization.slug),
      organizer_logo_url: nonEmpty(organization.logo_url),
      organizer_logo_background_color: nonEmpty(
        organization.logo_background_color,
      ),
    });
  }

  const userId = nonEmpty(event.organizer_user?.uid);
  if (userId) {
    return withoutUndefined({
      organizer_kind: "user",
      organizer_display_name:
        nonEmpty(event.organizer_user?.display_name) ?? plainName,
      organizer_user_id: userId,
      organizer_user_avatar_url: nonEmpty(
        event.organizer_user?.profile_picture,
      ),
    });
  }

  if (plainName) {
    return { organizer_kind: "name", organizer_display_name: plainName };
  }

  return {};
};

const withoutUndefined = (
  fields: EventOrganizerSearchFields,
): EventOrganizerSearchFields =>
  Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as EventOrganizerSearchFields;
