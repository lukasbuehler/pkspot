import { LocaleMap } from "../models/Interfaces";
import { MediaSchema } from "../schemas/Media";
import { SpotPreviewData } from "./SpotPreviewData";
import { UserReferenceSchema } from "./UserSchema";

type SpotData = Partial<SpotPreviewData> & {
  name: string; // english name
  id: string;
};

interface PostData {
  id: string;
  media: MediaSchema[];
  user: UserReferenceSchema;
}

export interface SpotChallengeSchema {
  spot: SpotData;
  name: LocaleMap;
  media: MediaSchema;
  description?: LocaleMap;
  user: UserReferenceSchema;
  createdAt: Date;
  is_completed?: boolean;
  selectPosts?: PostData[];
}
