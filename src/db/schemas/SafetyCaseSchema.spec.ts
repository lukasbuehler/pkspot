import { describe, expect, it } from "vitest";
import {
  isSafetyCaseCategory,
  isSafetyCaseDecisionType,
  isSafetyCaseOutcome,
  isSafetyCasePriority,
  isSafetyCaseStatus,
  isSafetyCaseSubjectType,
  isSafetyCaseType,
} from "./SafetyCaseSchema";

describe("SafetyCaseSchema guards", () => {
  it("accepts every supported workflow discriminator", () => {
    expect(isSafetyCaseType("appeal")).toBe(true);
    expect(isSafetyCaseStatus("awaiting_information")).toBe(true);
    expect(isSafetyCasePriority("immediate")).toBe(true);
    expect(isSafetyCaseCategory("age_assurance_decision")).toBe(true);
    expect(isSafetyCaseSubjectType("media")).toBe(true);
    expect(isSafetyCaseDecisionType("restrict_profile")).toBe(true);
    expect(isSafetyCaseOutcome("reversed")).toBe(true);
  });

  it("rejects unknown or non-string values", () => {
    expect(isSafetyCaseType("message")).toBe(false);
    expect(isSafetyCaseStatus("deleted")).toBe(false);
    expect(isSafetyCasePriority(1)).toBe(false);
    expect(isSafetyCaseCategory("general")).toBe(false);
    expect(isSafetyCaseSubjectType(null)).toBe(false);
    expect(isSafetyCaseDecisionType("delete_forever")).toBe(false);
    expect(isSafetyCaseOutcome({})).toBe(false);
  });
});
