// @vitest-environment node
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({deliver: vi.fn()}));
vi.mock("../functions/node_modules/firebase-functions/lib/params/index.js", () => ({defineSecret: () => ({value: () => "test-key"})}));
vi.mock("../functions/node_modules/firebase-functions/lib/logger/index.js", () => ({info: vi.fn(), error: vi.fn()}));
vi.mock("../functions/node_modules/firebase-functions/lib/v2/providers/firestore.js", () => ({
  onDocumentCreated: (_options: unknown, handler: unknown) => handler,
  onDocumentWritten: (_options: unknown, handler: unknown) => handler,
}));
vi.mock("../functions/node_modules/firebase-admin/lib/index.js", () => ({
  firestore: () => ({doc: () => ({get: async () => ({data: () => ({name: {en: {text: "Target Spot"}}})})})}),
  auth: () => ({getUser: async () => ({email: "member@example.org", emailVerified: true})}),
}));
vi.mock("../functions/src/staffEmailDelivery", () => ({deliverStaffEmail: mocks.deliver}));

import {buildReportStaffEmail} from "../functions/src/reportStaffEmail";
import {onSpotReportStaffEmailWrite} from "../functions/src/reportStaffEmailFunctions";

const guestMediaReport = {
  kind: "media",
  reasons: ["illegal or unsafe content"],
  comment: "Please look at this",
  media: {type: "image", src: "https://example.org/photo.jpg"},
  context: "spot",
  spotId: "spot1",
  targetId: "spot1",
  user: {email: "guest@example.org", email_verified: false},
  submission: {app_check: false},
};

describe("report staff email", () => {
  it("sends guest media reports to support with an unverified Reply-To", () => {
    const email = buildReportStaffEmail({
      kind: "media",
      reportId: "r1",
      sourcePath: "reports/r1",
      data: guestMediaReport,
      targetName: "Target Spot",
    });
    expect(email.to).toEqual(["support@pkspot.app"]);
    expect(email.from).toBe("PK Spot Reports <support@pkspot.app>");
    expect(email.reply_to).toBe("guest@example.org");
    expect(email.subject).toBe("[PK Spot] New media report: illegal or unsafe content");
    expect(email.text).toContain("Guest (not signed in)");
    expect(email.text).toContain("guest@example.org (unverified)");
    expect(email.text).toContain("App Check: missing");
    expect(email.text).toContain("https://pkspot.app/en/map/spots/spot1");
    expect(email.text).toContain("Please look at this");
  });

  it("labels guests without contact details and ignores malformed addresses", () => {
    const email = buildReportStaffEmail({
      kind: "media",
      reportId: "r1",
      sourcePath: "reports/r1",
      data: {...guestMediaReport, user: {email: "a@b.com\r\nBcc: x@y.com"}},
    });
    expect(email.reply_to).toBeUndefined();
    expect(email.text).toContain("Reporter email: none given");
  });

  it("links scanner reports to their media review", () => {
    const email = buildReportStaffEmail({
      kind: "media",
      reportId: "scanner_abc",
      sourcePath: "reports/scanner_abc",
      data: {
        kind: "media",
        source: "scanner",
        reason: "suggestive",
        review_path: "media_upload_reviews/abc",
        media: {type: "image", src: "https://example.org/held.jpg"},
        scanner: {decision: "block", reason: "Vision SafeSearch flagged potentially suggestive content."},
        user: {uid: "system_media_scanner"},
      },
    });
    expect(email.subject).toBe("[PK Spot] Scanner flagged media: suggestive");
    expect(email.text).toContain("https://pkspot.app/en/moderation/media?review=abc");
    expect(email.text).toContain("Reporter: Media safety scanner");
    expect(email.reply_to).toBeUndefined();
  });

  it("never includes media or reporter details for restricted matches", () => {
    const email = buildReportStaffEmail({
      kind: "media",
      reportId: "scanner_x",
      sourcePath: "reports/scanner_x",
      data: {
        source: "scanner",
        reason: "scanner_reportable_match",
        incident_path: "safety_incidents/inc1",
        media: {type: "image", src: "https://example.org/restricted.jpg", storage_path: "media_intake/u/x/x.jpg"},
        scanner: {decision: "reportable_match", severity: "known_csam_match"},
        user: {uid: "system_media_scanner"},
      },
    });
    expect(email.text).not.toContain("example.org");
    expect(email.text).not.toContain("media_intake");
    expect(email.text).toContain("https://pkspot.app/en/moderation/incidents/inc1");
    expect(email.subject).toContain("Restricted");
  });

  it("uses the account email for signed-in profile reports", () => {
    const email = buildReportStaffEmail({
      kind: "profile",
      reportId: "p1",
      sourcePath: "user_reports/p1",
      data: {reason: "harassment", reportedUser: {uid: "bad1", display_name: "Someone"}, user: {uid: "u1"}},
      accountEmail: "member@example.org",
      accountEmailVerified: true,
      targetName: "Someone",
    });
    expect(email.reply_to).toBe("member@example.org");
    expect(email.text).toContain("Reporter email: member@example.org\n");
    expect(email.text).toContain("https://pkspot.app/en/u/bad1");
  });
});

describe("Spot report staff email trigger", () => {
  const handler = onSpotReportStaffEmailWrite as unknown as (event: unknown) => Promise<void>;
  const snapshot = (data: Record<string, unknown> | undefined) => ({
    exists: data !== undefined,
    data: () => data,
    ref: {path: "spots/s1/reports/r1"},
    createTime: {toMillis: () => 1},
  });
  const write = (before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined) =>
    handler({
      params: {spotId: "s1", reportId: "r1"},
      data: {before: snapshot(before), after: snapshot(after)},
    });
  const canonical = {spot: {id: "s1", name: "Wall"}, reasons: ["unsafe"], user: {uid: "u1"}, status: "open", submission: {canonical: true}};

  beforeEach(() => mocks.deliver.mockReset());

  it("emails once when a report becomes canonical", async () => {
    await write(undefined, canonical);
    expect(mocks.deliver).toHaveBeenCalledOnce();
    expect(mocks.deliver.mock.calls[0][0].deliveryPath).toBe("report_email_delivery/spot_s1_r1");
  });

  it("skips raw legacy writes, later edits, and superseded duplicates", async () => {
    await write(undefined, {...canonical, submission: undefined});
    await write(canonical, {...canonical, comment: "edited"});
    await write(undefined, {...canonical, status: "superseded", submission: {canonical: false}});
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
});
