import { GeoPoint } from "@firebase/firestore";
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
  user: UserReferenceSchema;
  createdAt: Date;
  location?: GeoPoint;
  top_posts?: PostData[];
  num_posts?: number;
  is_completed?: boolean;
  description?: LocaleMap;
}

export interface ChallengePreviewSchema {
  id: string;
  name: LocaleMap;
  media: MediaSchema;
  location?: GeoPoint;
}
