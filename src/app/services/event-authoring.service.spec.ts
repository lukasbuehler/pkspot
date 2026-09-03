import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import { EventAuthoringService } from "./event-authoring.service";

describe("EventAuthoringService", () => {
  it("uses authenticated App Check callables for community-event authoring", async () => {
    const functions = {
      callAuthenticatedAppChecked: vi.fn().mockResolvedValue({
        eventId: "community-event-1",
        slug: "community-event-community-event-1",
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        EventAuthoringService,
        { provide: FunctionsAdapterService, useValue: functions },
      ],
    });
    const service = TestBed.inject(EventAuthoringService);
    const input = {
      name: "Tuesday Parkour",
      locality: "Zurich",
      countryCode: "CH",
      startsAt: "2026-09-08T17:00:00.000Z",
      endsAt: "2026-09-08T19:00:00.000Z",
      timeZone: "Europe/Zurich",
      visibility: "public" as const,
      broadcast: false,
    };

    await service.createCommunityEvent(input);

    expect(functions.callAuthenticatedAppChecked).toHaveBeenCalledWith(
      "createCommunityEvent",
      input,
    );
  });
});
