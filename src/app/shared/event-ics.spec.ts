import { buildIcsCalendar, foldIcsLine, type IcsEvent } from "./event-ics";

const NOW = new Date("2026-11-21T12:00:00Z");

const exact: IcsEvent = {
  id: "jam-1",
  name: "Santa Jam; Luzern, CH",
  description: "Bring snacks.\nOpen to all.",
  venue: "Grandstand Parkour Park",
  locality: "Luzern",
  startSeconds: Date.parse("2026-12-05T10:00:00Z") / 1000,
  endSeconds: Date.parse("2026-12-05T17:00:00Z") / 1000,
  url: "https://pkspot.app/events/santa-jam",
};

function unfold(calendar: string): string[] {
  return calendar.replace(/\r\n /gu, "").split("\r\n");
}

describe("buildIcsCalendar", () => {
  it("writes timed events in UTC with escaped text and CRLF line endings", () => {
    const calendar = buildIcsCalendar([exact], { now: NOW, name: "PK Spot events" });
    const lines = unfold(calendar);

    expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(calendar).not.toMatch(/[^\r]\n/u);
    expect(lines).toContain("UID:event-jam-1@pkspot.app");
    expect(lines).toContain("DTSTAMP:20261121T120000Z");
    expect(lines).toContain("DTSTART:20261205T100000Z");
    expect(lines).toContain("DTEND:20261205T170000Z");
    expect(lines).toContain("SUMMARY:Santa Jam\\; Luzern\\, CH");
    expect(lines).toContain("LOCATION:Grandstand Parkour Park\\, Luzern");
    expect(lines).toContain(
      "DESCRIPTION:Bring snacks.\\nOpen to all.\\n\\nhttps://pkspot.app/events/santa-jam",
    );
    expect(lines).toContain("URL:https://pkspot.app/events/santa-jam");
    expect(lines).toContain("STATUS:CONFIRMED");
    expect(lines).toContain("TRANSP:OPAQUE");
    expect(lines).toContain("X-WR-CALNAME:PK Spot events");
  });

  it("writes date-only events as all-day entries with an exclusive end date", () => {
    const lines = unfold(
      buildIcsCalendar(
        [
          {
            ...exact,
            dateOnly: { startDate: "2026-12-30", endDate: "2026-12-31" },
          },
        ],
        { now: NOW },
      ),
    );
    expect(lines).toContain("DTSTART;VALUE=DATE:20261230");
    expect(lines).toContain("DTEND;VALUE=DATE:20270101");
    expect(lines.some((line) => line.startsWith("DTSTART:"))).toBe(false);
  });

  it("marks cancelled and free-time entries and never ends before the start", () => {
    const lines = unfold(
      buildIcsCalendar(
        [{ ...exact, endSeconds: exact.startSeconds, cancelled: true, transparent: true }],
        { now: NOW, refreshHours: 6 },
      ),
    );
    expect(lines).toContain("STATUS:CANCELLED");
    expect(lines).toContain("TRANSP:TRANSPARENT");
    expect(lines).toContain("DTEND:20261205T110000Z");
    expect(lines).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H");
  });

  it("truncates long descriptions", () => {
    const lines = unfold(
      buildIcsCalendar([{ ...exact, description: "x".repeat(5000), url: undefined }], { now: NOW }),
    );
    const description = lines.find((line) => line.startsWith("DESCRIPTION:"));
    expect(description?.length).toBeLessThanOrEqual("DESCRIPTION:".length + 1500);
    expect(description?.endsWith("…")).toBe(true);
  });
});

describe("foldIcsLine", () => {
  it("folds at 75 octets without splitting multi-byte characters", () => {
    const line = `SUMMARY:${"Zürich 🇨🇭 Jam ".repeat(12)}`;
    const folded = foldIcsLine(line);
    const encoder = new TextEncoder();
    for (const part of folded.split("\r\n")) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /gu, "")).toBe(line);
  });

  it("keeps short lines unchanged", () => {
    expect(foldIcsLine("VERSION:2.0")).toBe("VERSION:2.0");
  });
});
