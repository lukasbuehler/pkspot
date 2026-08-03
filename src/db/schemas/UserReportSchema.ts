import { UserReferenceSchema } from "./UserSchema";
import {
  ModerationReporterSchema,
  ReportModerationStatus,
} from "./MediaReportSchema";

export type UserReportReason =
  | "harassment"
  | "impersonation"
  | "unsafe_profile"
  | "spam_or_malicious_links"
  | "other";

export interface UserReportSchema {
  reportedUser: UserReferenceSchema;
  reason: UserReportReason;
  comment?: string;
  user: ModerationReporterSchema;
  createdAt: Date;
  sourcePath?: string;
  status?: ReportModerationStatus;
  resolvedAt?: unknown;
  resolvedBy?: UserReferenceSchema;
  resolutionNote?: string;
}
