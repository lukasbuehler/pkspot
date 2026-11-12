import { environment } from "../../environments/environment.default";

/** Whether Spot galleries end with the photo from the linked Google Place. */
export const googlePlacePhotoInGalleryEnabled =
  (environment.features as Record<string, unknown>)[
    "googlePlacePhotoInGallery"
  ] === true;
