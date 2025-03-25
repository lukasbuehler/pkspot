import { UserReferenceSchema } from "./UserSchema";

interface SpotData {
  name: string; // english name
  id: string;
}

export enum SpotReportReason {
  Duplicate = "duplicate",
}

export interface SpotReportSchema {
  spot: SpotData;
  reason: SpotReportReason | string;
  duplicateOf?: SpotData;
  user: UserReferenceSchema;
}
