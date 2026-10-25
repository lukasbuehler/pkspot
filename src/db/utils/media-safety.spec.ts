import { classifySafeSearch } from "./media-safety";

describe("SafeSearch classification", () => {
  it("separates suggestive content from adult content and violence", () => {
    expect(classifySafeSearch({ adult: "UNLIKELY", violence: "UNLIKELY", racy: "LIKELY" })).toBe("suggestive");
    expect(classifySafeSearch({ adult: "VERY_LIKELY", racy: "LIKELY" })).toBe("adult_content");
    expect(classifySafeSearch({ violence: "LIKELY", racy: "LIKELY" })).toBe("graphic_violence");
    expect(classifySafeSearch({ racy: "POSSIBLE" })).toBe("none");
  });
});
