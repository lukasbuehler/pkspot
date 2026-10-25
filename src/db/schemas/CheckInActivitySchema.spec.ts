import { describe, expect, it } from "vitest";
import { checkInActivityBucket } from "./CheckInActivitySchema";

describe("checkInActivityBucket", () => {
  it("publishes nothing below the two-account privacy threshold", () => {
    expect(checkInActivityBucket(0)).toBeNull();
    expect(checkInActivityBucket(1)).toBeNull();
  });

  it("uses only the approved coarse ranges", () => {
    expect(checkInActivityBucket(2)).toBe("2–4");
    expect(checkInActivityBucket(4)).toBe("2–4");
    expect(checkInActivityBucket(5)).toBe("5–9");
    expect(checkInActivityBucket(9)).toBe("5–9");
    expect(checkInActivityBucket(10)).toBe("10–24");
    expect(checkInActivityBucket(24)).toBe("10–24");
    expect(checkInActivityBucket(25)).toBe("25+");
  });
});
