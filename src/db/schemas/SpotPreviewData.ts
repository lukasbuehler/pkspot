import { AmenitiesMap } from "./Amenities";

export interface SpotPreviewData {
  name: string;
  id: string;
  locality: string;
  imageSrc: string;
  isIconic: boolean;
  rating?: number; // whole number 1-10
  amenities?: AmenitiesMap;
}
