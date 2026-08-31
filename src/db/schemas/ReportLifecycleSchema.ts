import type { MediaReportReason } from "./MediaReportPolicy";
import type { SpotReportReason } from "./SpotReportSchema";

export interface SubmitSpotReportRequest {
  spotId: string;
  reasons: SpotReportReason[];
  comment?: string;
  duplicateOf?: { id: string; name?: string };
}

export interface SubmitSpotReportResponse {
  reportId: string;
  created: boolean;
}

export interface OwnReportTargetRequest {
  kind: "spot" | "media";
  spotId?: string;
  media?: {
    type: string;
    src: string;
    targetId?: string;
    context?: "spot" | "event" | "media";
  };
}

export interface OwnReportSummary {
  id: string;
  kind: "spot" | "media";
  status: "open" | "resolved" | "dismissed" | "withdrawn";
  reasons: (SpotReportReason | MediaReportReason | string)[];
  comment: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  withdrawnAt?: unknown;
  spot?: { id: string; name: string };
  duplicateOf?: { id: string; name?: string };
  duplicateMedia?: { type: string; src: string };
  media?: { type: string; src: string };
  targetId?: string;
  context?: "spot" | "event" | "media";
}

export interface GetOwnReportResponse {
  report: OwnReportSummary | null;
}

export interface ListOwnReportsResponse {
  reports: OwnReportSummary[];
}

export interface WithdrawOwnReportRequest {
  kind: "spot" | "media";
  reportId: string;
  spotId?: string;
}
