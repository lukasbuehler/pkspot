import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { BehaviorSubject, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { PlannedSessionsService } from "../../services/planned-sessions.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { SessionPlannerPageComponent } from "./session-planner-page.component";

function setup() {
  const create = vi.fn().mockResolvedValue({ id: "planned-id" });
  const navigate = vi.fn().mockResolvedValue(true);
  const paramMap = convertToParamMap({});
  TestBed.configureTestingModule({ providers: [
    { provide: AuthenticationService, useValue: { authState$: new BehaviorSubject({ uid: "teen" }) } },
    { provide: AgeAssuranceService, useValue: { hasVerifiedAdultEligibility: () => false } },
    { provide: PlannedSessionsService, useValue: { create } },
    { provide: FeatureTelemetryService, useValue: { run: (_f: string, _a: string, action: () => Promise<unknown>) => action(), failure: vi.fn() } },
    { provide: MetaTagService, useValue: { setStaticPageMetaTags: vi.fn(), setRobotsContent: vi.fn() } },
    { provide: Router, useValue: { navigate } },
    { provide: ActivatedRoute, useValue: { paramMap: of(paramMap), snapshot: { paramMap, data: {} } } },
  ] });
  const component = TestBed.runInInjectionContext(() => new SessionPlannerPageComponent());
  return { component, create, navigate };
}
describe("session planner", () => {
  it("defaults to invitation-only without requiring verified adulthood", async () => {
    const { component, create, navigate } = setup();
    component.form.patchValue({ title: "Training", start: "2027-01-01T12:00", end: "2027-01-01T14:00" });
    component.spots.set(["spot"]);
    await component.submit();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ audience: "private", spotId: "spot", title: "Training" }));
    expect(navigate).toHaveBeenCalledWith(["/events/session", "planned-id"]);
  });
  it("does not submit a form without a Spot", async () => {
    const { component, create } = setup();
    await component.submit();
    expect(create).not.toHaveBeenCalled();
    expect(component.error()).not.toBe("");
  });
});
