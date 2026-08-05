import {TestBed} from "@angular/core/testing";
import {MAT_DIALOG_DATA, MatDialogRef} from "@angular/material/dialog";
import {describe, expect, it, vi} from "vitest";
import type {
  PreviewSpotDuplicateResolutionResponse,
  SpotDuplicateCandidatePreview,
} from "../../../db/schemas/SpotDuplicateResolutionSchema";
import type {SpotReportSchema} from "../../../db/schemas/SpotReportSchema";
import {
  ModerationReportsService,
  type ModerationReportItem,
} from "../../services/firebase/firestore/moderation-reports.service";
import {SpotDuplicateResolutionDialogComponent} from "./spot-duplicate-resolution-dialog.component";

function candidate(id: string): SpotDuplicateCandidatePreview {
  return {
    id,
    name: id,
    media: [],
    editCount: 1,
    dependencies: {
      edits: 1,
      reviews: 0,
      reports: 0,
      challenges: 0,
      events: 0,
      checkIns: 0,
      privateLists: 0,
      homeSpots: 0,
      organizationReferences: 0,
      slugAliases: 0,
    },
    uniqueFields: [],
  };
}

function preview(candidateId: string): PreviewSpotDuplicateResolutionResponse {
  return {
    reported: candidate("reported"),
    candidate: candidate(candidateId),
    eligibleCanonicalSpotIds: ["reported", candidateId],
    blockers: [],
    previewToken: `token-${candidateId}`,
  };
}

function report(duplicateOf: unknown): ModerationReportItem {
  return {
    id: "report",
    path: "spots/reported/reports/report",
    kind: "spot",
    status: "open",
    reason: "duplicate",
    createdAt: null,
    createdAtMillis: 0,
    reporterLabel: "Reporter",
    targetLabel: "Reported Spot",
    spotId: "reported",
    requiresManualReview: false,
    canKeepWarning: false,
    canDeleteMedia: false,
    raw: {duplicateOf} as SpotReportSchema,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return {promise, resolve};
}

describe("SpotDuplicateResolutionDialogComponent", () => {
  it("ignores an old preview after the selected candidate changes", async () => {
    const first = deferred<PreviewSpotDuplicateResolutionResponse>();
    const second = deferred<PreviewSpotDuplicateResolutionResponse>();
    const previewSpotDuplicateResolution = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    TestBed.configureTestingModule({
      providers: [
        {provide: MAT_DIALOG_DATA, useValue: {report: report("candidate-a")}},
        {provide: MatDialogRef, useValue: {close: vi.fn()}},
        {
          provide: ModerationReportsService,
          useValue: {
            previewSpotDuplicateResolution,
            resolveSpotDuplicate: vi.fn(),
          },
        },
      ],
    });
    const component = TestBed.runInInjectionContext(
      () => new SpotDuplicateResolutionDialogComponent(),
    );

    const firstLoad = component.loadPreview();
    component.onCandidateSelection({
      id: "candidate-b",
      label: "Candidate B",
      subtitle: "",
    });
    first.resolve(preview("candidate-a"));
    await firstLoad;
    expect(component.previewData()).toBeNull();

    second.resolve(preview("candidate-b"));
    await vi.waitFor(() => {
      expect(component.previewData()?.candidate.id).toBe("candidate-b");
    });
    expect(component.isLoading()).toBe(false);
  });

  it("rejects a non-string persisted duplicate candidate ID", () => {
    TestBed.configureTestingModule({
      providers: [
        {provide: MAT_DIALOG_DATA, useValue: {report: report({id: 123})}},
        {provide: MatDialogRef, useValue: {close: vi.fn()}},
        {
          provide: ModerationReportsService,
          useValue: {
            previewSpotDuplicateResolution: vi.fn(),
            resolveSpotDuplicate: vi.fn(),
          },
        },
      ],
    });

    const component = TestBed.runInInjectionContext(
      () => new SpotDuplicateResolutionDialogComponent(),
    );

    expect(component.candidateSpotId()).toBe("");
  });
});
