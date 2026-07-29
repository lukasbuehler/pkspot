import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SafetyCasePublicView } from "../../db/schemas/SafetyCaseSchema";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import { SafetyCasesService } from "./safety-cases.service";

const caseView = (
  publicReference = "PKS-2026-ABCDEFGH",
): SafetyCasePublicView => ({
  public_reference: publicReference,
  case_type: "report",
  category: "child_safety",
  priority: "urgent",
  status: "received",
  subject: { type: "service" },
  summary: "Safety concern",
  description: "Details about the safety concern",
  acknowledged_at: "2026-07-29T10:00:00.000Z",
  target_resolution_at: "2026-08-05T10:00:00.000Z",
  complex_resolution_at: "2026-08-28T10:00:00.000Z",
  created_at: "2026-07-29T10:00:00.000Z",
  updated_at: "2026-07-29T10:00:00.000Z",
  events: [],
  can_appeal: false,
});

describe("SafetyCasesService", () => {
  const functions = {
    callPublic: vi.fn(),
    callAuthenticatedAppChecked: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        SafetyCasesService,
        { provide: FunctionsAdapterService, useValue: functions },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });
  });

  it("exchanges a one-time link and reuses only the returned case session", async () => {
    functions.callPublic.mockResolvedValueOnce({
      session_token: "private-session",
      expires_at: "2026-08-28T10:00:00.000Z",
      case: caseView(),
    });
    const service = TestBed.inject(SafetyCasesService);

    await service.exchangeAccessLink("one-time-token");
    functions.callPublic.mockResolvedValueOnce(caseView());
    await service.get("PKS-2026-ABCDEFGH");

    expect(functions.callPublic).toHaveBeenNthCalledWith(
      1,
      "exchangeSafetyCaseAccessLink",
      { access_token: "one-time-token" },
    );
    expect(functions.callPublic).toHaveBeenNthCalledWith(
      2,
      "getSafetyCaseView",
      {
        public_reference: "PKS-2026-ABCDEFGH",
        session_token: "private-session",
      },
    );
    expect(localStorage.getItem("pkspot.safety-case.PKS-2026-ABCDEFGH")).toBe(
      "private-session",
    );
  });

  it("stores a separate guest session returned for an appeal", async () => {
    functions.callPublic.mockResolvedValueOnce({
      case_id: "appeal-id",
      public_reference: "PKS-2026-APPEAL12",
      session_token: "appeal-session",
      session_expires_at: "2026-08-28T10:00:00.000Z",
    });
    const service = TestBed.inject(SafetyCasesService);

    const result = await service.appeal(
      "PKS-2026-ABCDEFGH",
      "The original reviewer missed relevant evidence.",
    );

    expect(result.public_reference).toBe("PKS-2026-APPEAL12");
    expect(localStorage.getItem("pkspot.safety-case.PKS-2026-APPEAL12")).toBe(
      "appeal-session",
    );
  });

  it("uses the App Check protected admin channel for decisions", async () => {
    functions.callAuthenticatedAppChecked.mockResolvedValueOnce({ ok: true });
    const service = TestBed.inject(SafetyCasesService);

    await service.decideAdminCase("PKS-2026-ABCDEFGH", {
      decision_type: "close_without_action",
      outcome: "no_action",
      public_reason: "The reviewed material does not breach the policy.",
    });

    expect(functions.callAuthenticatedAppChecked).toHaveBeenCalledWith(
      "decideSafetyCase",
      {
        public_reference: "PKS-2026-ABCDEFGH",
        decision_type: "close_without_action",
        outcome: "no_action",
        public_reason: "The reviewed material does not breach the policy.",
      },
    );
  });
});
