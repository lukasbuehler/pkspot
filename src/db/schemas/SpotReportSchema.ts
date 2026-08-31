import { SpotPreviewData } from "./SpotPreviewData";
import {
  ModerationReporterSchema,
  ReportModerationStatus,
} from "./MediaReportSchema";
import { UserReferenceSchema } from "./UserSchema";

type SpotData = Partial<SpotPreviewData> & {
  name: string; // english name
  id: string;
};

export enum SpotReportReason {
  Duplicate = "duplicate",
  TornDown = "torn down",
  DoesNotExist = "does not exist",
  Private = "private",
  Other = "other",
}

export const SPOT_REPORT_REASONS = Object.values(SpotReportReason);

export interface SpotReportSchema {
  spot: SpotData;
  reason: SpotReportReason | string;
  /** Canonical reasons. `reason` remains for legacy clients and actions. */
  reasons?: (SpotReportReason | string)[];
  duplicateOf?: SpotData;
  /** Private reporter context; never copied to a public Spot warning. */
  comment?: string;
  user: ModerationReporterSchema;
  createdAt?: unknown;
  status?: ReportModerationStatus;
  updated_at?: unknown;
  withdrawn_at?: unknown;
  superseded_at?: unknown;
  superseded_into?: string;
  submission?: {
    channel: "callable" | "direct" | "legacy_bridge";
    canonical?: boolean;
    accepted_at?: unknown;
  };
  resolvedAt?: unknown;
  resolvedBy?: UserReferenceSchema;
  resolutionNote?: string;
}
