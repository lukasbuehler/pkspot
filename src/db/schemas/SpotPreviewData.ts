import { GeoPoint } from "firebase/firestore";
import { SpotId } from "../schemas/SpotSchema";
import { AmenitiesMap } from "./Amenities";

export interface SpotPreviewData {
  name: string;
  id: SpotId;
  slug?: string;
  location?: GeoPoint;
  location_raw?: { lat: number; lng: number };
  type?: string; //SpotTypes;
  access?: string; //SpotAccess;
  locality: string;
  countryCode?: string;
  countryName?: string;
  imageSrc: string;
  isIconic: boolean;
  rating?: number; // whole number 1-10
  amenities?: AmenitiesMap;
}
