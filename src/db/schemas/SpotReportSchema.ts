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
}

export interface SpotReportSchema {
  spot: SpotData;
  reason: SpotReportReason | string;
  duplicateOf?: SpotData;
  user: ModerationReporterSchema;
  createdAt?: unknown;
  status?: ReportModerationStatus;
  resolvedAt?: unknown;
  resolvedBy?: UserReferenceSchema;
  resolutionNote?: string;
}
