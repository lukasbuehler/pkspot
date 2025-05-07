import { GeoPoint, Timestamp } from "@firebase/firestore";
import { LocaleMap } from "../models/Interfaces";
import { MediaSchema } from "../schemas/Media";
import { SpotPreviewData } from "./SpotPreviewData";
import { UserReferenceSchema } from "./UserSchema";
import {
  ChallengeLabel,
  ChallengeParticipantType,
} from "./SpotChallengeLabels";

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
  media?: MediaSchema;
  description?: LocaleMap;
  user: UserReferenceSchema;
  created_at: Timestamp;
  release_date?: Timestamp;
  location?: GeoPoint;
  top_posts?: PostData[];
  num_posts?: number;
  is_completed?: boolean;
  label?: ChallengeLabel;
  participant_type?: ChallengeParticipantType;
  is_water_challenge?: boolean;
  is_beginner_friendly?: boolean;
}

export interface ChallengePreviewSchema {
  id: string;
  name: LocaleMap;
  media: MediaSchema;
  location?: GeoPoint;
}
