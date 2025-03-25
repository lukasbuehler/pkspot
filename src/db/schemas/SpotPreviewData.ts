import { GeoPoint } from "@firebase/firestore";
import { SpotId } from "../models/Spot";
import { AmenitiesMap } from "./Amenities";

export interface SpotPreviewData {
  name: string;
  id: SpotId;
  location?: GeoPoint;
  locality: string;
  imageSrc: string;
  isIconic: boolean;
  rating?: number; // whole number 1-10
  amenities?: AmenitiesMap;
}
