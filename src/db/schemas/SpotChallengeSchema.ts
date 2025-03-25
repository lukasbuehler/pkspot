import { LocaleMap, Media } from "../models/Interfaces";
import { UserReferenceSchema } from "./UserSchema";

interface SpotData {
  name: string; // english name
  id: string;
}

interface PostData {
  id: string;
  media: Media;
  user: UserReferenceSchema;
}

export interface SpotChallengeSchema {
  spot: SpotData;
  name: LocaleMap;
  media: Media;
  description?: LocaleMap;
  user: UserReferenceSchema;
  createdAt: Date;
  is_completed?: boolean;
  selectPosts?: PostData[];
}
