import { describe, expect, it } from "vitest";
import type { EventProgramItem } from "../../db/models/Event";
import { eventProgramMoment } from "./event-program-now";

const item = (
  id: string,
  start: string,
  end?: string,
  status?: EventProgramItem["status"],
): EventProgramItem => ({
  id,
  title: id,
  category: "jam",
  start: new Date(start),
  end: end ? new Date(end) : undefined,
  status,
});

describe("eventProgramMoment", () => {
  it("returns parallel current items and the next start group", () => {
    const moment = eventProgramMoment(
      [
        item("current-a", "2026-07-30T10:00:00Z", "2026-07-30T11:00:00Z"),
        item("current-b", "2026-07-30T10:15:00Z", "2026-07-30T11:15:00Z"),
        item("next-a", "2026-07-30T12:00:00Z"),
        item("next-b", "2026-07-30T12:00:00Z"),
        item("later", "2026-07-30T13:00:00Z"),
      ],
      new Date("2026-07-30T10:30:00Z"),
    );

    expect(moment.current.map(({ item }) => item.id)).toEqual([
      "current-a",
      "current-b",
    ]);
    expect(moment.next.map(({ item }) => item.id)).toEqual([
      "next-a",
      "next-b",
    ]);
  });

  it("uses runtime overrides and excludes cancelled items", () => {
    const delayed = item(
      "delayed",
      "2026-07-30T10:00:00Z",
      "2026-07-30T11:00:00Z",
    );
    delayed.runtimeOverride = {
      start: new Date("2026-07-30T12:30:00Z"),
      end: new Date("2026-07-30T13:30:00Z"),
      status: "delayed",
    };

    const moment = eventProgramMoment(
      [
        item(
          "cancelled",
          "2026-07-30T12:00:00Z",
          "2026-07-30T13:00:00Z",
          "cancelled",
        ),
        delayed,
      ],
      new Date("2026-07-30T12:00:00Z"),
    );

    expect(moment.current).toEqual([]);
    expect(moment.next[0]).toMatchObject({
      item: { id: "delayed" },
      start: new Date("2026-07-30T12:30:00Z"),
    });
  });
});
