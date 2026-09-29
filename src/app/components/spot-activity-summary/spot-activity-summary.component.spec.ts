import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { SpotActivityService } from "../../services/firebase/firestore/spot-activity.service";
import { SpotActivitySummaryComponent } from "./spot-activity-summary.component";
import type { SpotActivityPublicSchema } from "../../../db/schemas/CheckInActivitySchema";

describe("compact Spot activity", () => {
  for (const [bucket, label] of [["2–4", "2+"], ["5–9", "5+"], ["10–24", "10+"], ["25+", "25+"]] as const) {
    it(`presents ${bucket} as ${label} without exposing a precise count`, async () => {
      TestBed.configureTestingModule({providers: [{provide: SpotActivityService, useValue: {
        get: async (): Promise<SpotActivityPublicSchema> => ({status: "recently_trained", bucket, window_days: 30}),
      }}]});
      const fixture = TestBed.createComponent(SpotActivitySummaryComponent);
      fixture.componentRef.setInput("spotId", "example");
      await fixture.whenStable();
      expect(fixture.nativeElement.textContent).toContain(`${label} trained here recently`);
      expect(fixture.nativeElement.textContent).not.toContain("30 days");
      expect(fixture.nativeElement.querySelector(".spot-activity-summary__count").textContent).toBe(label);
      fixture.componentRef.setInput("compact", true);
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector(".compact-count .spot-activity-summary__count").textContent).toBe(label);
      expect(fixture.nativeElement.querySelector(".cdk-visually-hidden").textContent).toContain("trained here recently");
    });
  }
  it("shows no row when the public activity threshold is not met", async () => {
    TestBed.configureTestingModule({providers: [{provide: SpotActivityService, useValue: {get: async () => null}}]});
    const fixture = TestBed.createComponent(SpotActivitySummaryComponent);
    fixture.componentRef.setInput("spotId", "example");
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector(".spot-activity-summary")).toBeNull();
  });
});
