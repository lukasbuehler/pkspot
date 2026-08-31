import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  publicSpotWarningForReason,
  publicSpotWarningForReasons,
} from "../functions/src/spotPublicWarning";
import {
  normalizePublicSpotNoticeType,
  publicSpotNoticeTypeForReportReason,
} from "./db/schemas/SpotPublicNotice";
import { localizedPublicSpotWarning } from "./app/components/spot-details/spot-public-warning";

describe("public Spot warnings", () => {
  it("uses a stable duplicate type without exposing the private report text", () => {
    expect(publicSpotNoticeTypeForReportReason("duplicate")).toBe("duplicate");
    expect(publicSpotWarningForReason("duplicate")).toEqual({
      type: "duplicate",
      message: "This Spot may be a duplicate.",
    });
  });

  it("recognizes legacy duplicate notices stored as other", () => {
    const notice = {
      type: "other" as const,
      message: "This Spot may be a duplicate.",
    };

    expect(normalizePublicSpotNoticeType(notice, undefined)).toBe("duplicate");
    expect(localizedPublicSpotWarning(notice, undefined)).toBe(
      "This Spot may be a duplicate.",
    );
  });

  it("falls back to a generic localized public warning", () => {
    expect(localizedPublicSpotWarning(undefined, undefined)).toBe(
      "Information about this Spot may be outdated. Please use caution.",
    );
  });

  it("keeps inaccessible and access-concern warnings distinct", () => {
    expect(publicSpotWarningForReason("inaccessible").message).toBe(
      "This Spot may be inaccessible.",
    );
    expect(publicSpotWarningForReason("access_concern").message).toBe(
      "Access to this Spot may be restricted or unavailable.",
    );
    expect(localizedPublicSpotWarning({type: "inaccessible"})).toBe(
      "This Spot may be inaccessible.",
    );
    expect(localizedPublicSpotWarning({type: "access_concern"})).toBe(
      "Access to this Spot may be restricted or unavailable.",
    );
  });

  it("uses the strongest neutral warning when several reasons apply", () => {
    expect(publicSpotWarningForReason("private").type).toBe("access_concern");
    expect(publicSpotWarningForReasons(["duplicate", "private", "torn down"])).toEqual({
      type: "destroyed",
      message: "This Spot may have been removed or destroyed.",
    });
  });

  it("keeps private report text admin-only and localizes ordinary Spot warnings", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/components/spot-details/spot-details.component.ts",
      ),
      "utf8",
    );
    const currentReport = source.match(
      /currentReport = computed\([\s\S]*?\n  private _latestReportRequestSpotId/,
    )?.[0];

    expect(currentReport).toContain("this.isAdmin() && privateReport");
    expect(currentReport).toContain("localizedPublicSpotWarning(");
  });

  it("rebuilds public projection from active reports rather than report text", () => {
    const source = readFileSync(
      join(process.cwd(), "functions/src/reportLifecycleHelpers.ts"),
      "utf8",
    );

    expect(source).toContain("publicSpotWarningForReasons(active.flatMap(reportReasons))");
    expect(source).toContain("is_reported: true");
    expect(source).toContain("report_reason: warning.message");
    expect(source).toContain("public_notice:");
    expect(source).toContain("clearSpotReportProjection");
  });
});
