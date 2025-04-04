import { GeoPoint } from "@firebase/firestore";
import { SpotId } from "../schemas/SpotSchema";
import { AmenitiesMap } from "./Amenities";

export interface SpotPreviewData {
  name: string;
  id: SpotId;
  slug?: string;
  location?: GeoPoint;
  locality: string;
  imageSrc: string;
  isIconic: boolean;
  rating?: number; // whole number 1-10
  amenities?: AmenitiesMap;
}
