import { Timestamp } from "firebase/firestore";
import { UserReferenceSchema } from "./UserSchema";
import { SpotSchema } from "./SpotSchema";

export type SpotEditSchema = Partial<
  Pick<
    SpotSchema,
    | "name"
    | "location"
    | "description"
    | "media"
    | "external_references"
    | "type"
    | "access"
    | "amenities"
    | "bounds"
    | "slug"
    | "hide_streetview"
  >
>;

export interface SpotEdit {
  type: "CREATE" | "UPDATE";
  timestamp: Timestamp;
  likes: number;
  approved: boolean;
  user: UserReferenceSchema;
  data: SpotEditSchema;
}
