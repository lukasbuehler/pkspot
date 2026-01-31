import { MarkerSchema } from "../../app/components/marker/marker.component";

export interface PoiData {
  type: "amenity" | "google-poi";
  id: string; // placeId for google, or constructed ID for amenity
  name: string;
  location: google.maps.LatLngLiteral;
  googlePlace?: google.maps.places.Place;
  marker?: MarkerSchema;
  icon?: string;
}
