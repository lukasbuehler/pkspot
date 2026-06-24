import { Injectable } from "@angular/core";
import { Capacitor, registerPlugin } from "@capacitor/core";

interface NativeGooglePlacePhotoRequest {
  placeId: string;
  maxWidth: number;
  maxHeight: number;
  allowAttributed?: boolean;
}

interface NativeGooglePlacePhotoResponse {
  imageDataUrl: string | null;
  attributions: string[];
  skippedReason?: "no_photos" | "requires_attribution" | null;
}

type GooglePlacePhotoPlugin = {
  getPhoto(
    request: NativeGooglePlacePhotoRequest,
  ): Promise<NativeGooglePlacePhotoResponse>;
};

const NativeGooglePlacePhoto =
  registerPlugin<GooglePlacePhotoPlugin>("GooglePlacePhoto");

@Injectable({
  providedIn: "root",
})
export class NativeGooglePlacePhotoService {
  isAvailable(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  }

  async getPhoto(
    placeId: string,
    maxWidth = 300,
    maxHeight = 200,
  ): Promise<NativeGooglePlacePhotoResponse | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const photo = await NativeGooglePlacePhoto.getPhoto({
        placeId,
        maxWidth,
        maxHeight,
        allowAttributed: true,
      });
      console.log("[GooglePlacePhoto] Native photo response", {
        placeId,
        hasImage: !!photo.imageDataUrl,
        attributionCount: photo.attributions.length,
        skippedReason: photo.skippedReason,
      });
      return photo;
    } catch (error) {
      console.warn("Failed to load native Google Place photo", error);
      return null;
    }
  }
}
