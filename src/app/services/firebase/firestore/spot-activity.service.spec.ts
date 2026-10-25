import { describe, expect, it } from "vitest";
import { SpotActivityService } from "./spot-activity.service";

describe("Spot activity projection", () => {
  it("uses only valid stored bands", () => {
    const service = new SpotActivityService();
    for (const count of [2,5,10,25]) expect(service.displayMin("other", count)).toBe(count);
    for (const value of [undefined,null,0,1,3,24,100,"10"]) expect(service.displayMin("other", value)).toBeNull();
  });
  it("does not fabricate activity for Lindenhof", () => {
    const service = new SpotActivityService();
    expect(service.displayMin("8CHFHRFUCozO9yeLEq6N", null)).toBeNull();
    expect(service.displayMin("8CHFHRFUCozO9yeLEq6N", 5)).toBe(5);
  });
});
