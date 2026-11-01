import type { EventSuggestionSchema } from "../../src/db/schemas/EventSuggestionSchema";

/** Submitted content stays in the plain-text body, never in recipient headers. */
export function buildEventSuggestionEmail(id: string, suggestion: EventSuggestionSchema) {
  return {
    from: "PK Spot Events <support@pkspot.app>",
    to: ["support@pkspot.app"],
    subject: "New PK Spot event suggestion",
    text: [
      `Event suggestion: ${id}`,
      `Title: ${suggestion.name}`,
      `Organizer: ${suggestion.organizer_name ?? "Not provided"}`,
      `Place: ${[suggestion.locality_string, suggestion.country_code].filter(Boolean).join(", ") || "Not provided"}`,
      `Start: ${suggestion.start.toDate().toISOString()}`,
      `End: ${suggestion.end.toDate().toISOString()}`,
      `Time zone: ${suggestion.time_zone ?? "Not provided"}`,
      `Source: ${suggestion.source_url ?? "Not provided"}`,
      `Submitted by: ${suggestion.submitter_id}`,
      "", suggestion.description ?? "", "",
      "Review this suggestion in PK Spot:",
      "https://pkspot.app/moderation/event-suggestions",
    ].join("\n"),
  };
}
