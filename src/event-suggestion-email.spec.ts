import {describe, expect, it} from "vitest";
import {Timestamp} from "firebase/firestore";
import {buildEventSuggestionEmail} from "../functions/src/eventSuggestionEmail";

describe("event suggestion staff email", () => {
  it("keeps recipients and headers fixed while linking the private review queue", () => {
    const email = buildEventSuggestionEmail("suggestion-1", {
      name: "Jam\r\nBcc: attacker@example.test", description: "Review this source first.",
      submitter_id: "athlete", status: "submitted", locality_string: "Zürich", country_code: "CH",
      organizer_name: "Local crew", source_url: "https://example.test/jam", time_zone: "Europe/Zurich",
      start: Timestamp.fromDate(new Date("2026-11-01T12:00:00Z")),
      end: Timestamp.fromDate(new Date("2026-11-01T14:00:00Z")),
      time_created: Timestamp.now(), time_updated: Timestamp.now(),
    });
    expect(email.to).toEqual(["support@pkspot.app"]);
    expect(email.from).toBe("PK Spot Events <support@pkspot.app>");
    expect(email.subject).toBe("New PK Spot event suggestion");
    expect(email.text).toContain("https://pkspot.app/moderation/event-suggestions");
    expect(email.text).toContain("Zürich, CH");
    expect(email.text).toContain("2026-11-01T12:00:00.000Z");
    expect(email.text).toContain("https://example.test/jam");
  });
});
