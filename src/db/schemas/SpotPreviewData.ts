import type { RecentActivityMin30d } from "./CheckInActivitySchema";
import type { GeoPoint } from "firebase/firestore";
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
  hideStreetview?: boolean;
  /** Server-owned distinct-account activity band over the last 30 days. Null clears expired activity. */
  recent_activity_min_30d?: RecentActivityMin30d | null;
  rating?: number; // whole number 1-10
  numReviews?: number;
  num_reviews?: number;
  isReported?: boolean;
  reportReason?: string;
  amenities?: AmenitiesMap;
  bounds?: GeoPoint[];
  bounds_raw?: { lat: number; lng: number }[];
  bounds_radius_m?: number;
  bounds_center?: GeoPoint;
}
