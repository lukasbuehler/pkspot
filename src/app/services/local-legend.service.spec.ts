import { TestBed } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "./firebase/authentication.service";
import { TrainingSummaryService } from "./firebase/firestore/training-summary.service";
import { LocalLegendService } from "./local-legend.service";
import type { LocalLegendSettingsSchema } from "../../db/schemas/TrainingSummarySchema";

function setup(choice: LocalLegendSettingsSchema | null, uid: string | null = "user") {
  const getLocalLegend = vi.fn().mockResolvedValue(choice);
  TestBed.configureTestingModule({providers: [
    {provide: AuthenticationService, useValue: {user: {uid}, authState$: new BehaviorSubject(uid ? {uid} : null)}},
    {provide: TrainingSummaryService, useValue: {getLocalLegend}},
  ]});
  return {service: TestBed.inject(LocalLegendService), getLocalLegend};
}

describe("LocalLegendService first-check-in choice", () => {
  it("resolves an initially loading setting instead of bypassing an undecided choice", async () => {
    const {service} = setup(null);
    expect(service.state()).toBe("unavailable");
    await expect(service.choiceForCheckIn()).resolves.toBe("undecided");
    expect(service.state()).toBe("undecided");
  });

  it("recognizes an existing declined choice after loading", async () => {
    const {service} = setup({enabled: false, decided_at_raw_ms: 1});
    await expect(service.choiceForCheckIn()).resolves.toBe("off");
  });

  it("does not treat a settings read failure as declining participation", async () => {
    const {service, getLocalLegend} = setup(null);
    getLocalLegend.mockRejectedValue(new Error("offline"));
    await expect(service.choiceForCheckIn()).rejects.toThrow("offline");
  });

  it("rejects anonymous check-ins without reading settings", async () => {
    const {service, getLocalLegend} = setup(null, null);
    await expect(service.choiceForCheckIn()).rejects.toThrow("Sign in");
    expect(getLocalLegend).not.toHaveBeenCalled();
  });
});
