import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "../../../../environments/environment.default";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { SpotActivityService } from "./spot-activity.service";

describe("temporary Lindenhof activity preview", () => {
  const production = environment.production;
  const getDocument = vi.fn().mockResolvedValue(null);
  beforeEach(() => {
    getDocument.mockClear();
    environment.production = false;
    TestBed.configureTestingModule({providers: [
      {provide: FirestoreAdapterService, useValue: {getDocument}},
    ]});
  });
  afterEach(() => { environment.production = production; });

  it("shows the synthetic range only for the chosen Spot in development", async () => {
    expect(await TestBed.inject(SpotActivityService).get("8CHFHRFUCozO9yeLEq6N"))
      .toEqual({status: "recently_trained", bucket: "10–24", window_days: 30});
    expect(getDocument).not.toHaveBeenCalled();
  });
  it("continues reading real data for every other Spot", async () => {
    await TestBed.inject(SpotActivityService).get("another-spot");
    expect(getDocument).toHaveBeenCalledWith("spot_activity_public/another-spot");
  });
  it("never substitutes synthetic activity in production", async () => {
    environment.production = true;
    expect(await TestBed.inject(SpotActivityService).get("8CHFHRFUCozO9yeLEq6N")).toBeNull();
    expect(getDocument).toHaveBeenCalledWith("spot_activity_public/8CHFHRFUCozO9yeLEq6N");
  });
});
