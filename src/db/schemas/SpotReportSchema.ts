import { SpotPreviewData } from "./SpotPreviewData";
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
  user: UserReferenceSchema;
}
