import type { SpotSchema } from "./SpotSchema";

export type SpotCreationPlatform = "web" | "ios" | "android";

export interface CreateSpotSubmissionRequest {
  submissionId: string;
  data: Partial<SpotSchema>;
  client: {
    platform: SpotCreationPlatform;
    appVersion: string;
  };
}

export interface CreateSpotSubmissionResponse {
  spotId: string;
  editId: string;
  replayed: boolean;
}

export interface RecordSpotCreateGuardBlockRequest {
  submissionId: string;
}

export interface SpotCreationDiagnosticCase {
  submissionId: string;
  spotId: string;
  editId: string;
  uid: string;
  platform: SpotCreationPlatform;
  appVersion: string;
  createdAtMillis: number;
  lastAttemptAtMillis: number;
  attemptCount: number;
  guardBlockCount: number;
}

export interface SpotCreationMetricWindow {
  actualCreates: number;
  callableCreates: number;
  legacyCreates: number;
  idempotentReplays: number;
  clientGuardBlocks: number;
  platforms: Record<string, number>;
  appVersions: Record<string, number>;
}

export interface SpotCreationDiagnosticsResponse {
  last24Hours: SpotCreationMetricWindow;
  last7Days: SpotCreationMetricWindow;
  recentPreventedCases: SpotCreationDiagnosticCase[];
}
