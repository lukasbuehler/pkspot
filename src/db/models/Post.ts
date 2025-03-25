import { OtherMedia, MediaType } from "./Interfaces";
import { DocumentReference, GeoPoint, Timestamp } from "@firebase/firestore";
import { UserReferenceSchema } from "../schemas/UserSchema";

export namespace Post {
  export class Class {
    id: string = "";
    title: string = "";
    user: UserReferenceSchema | null = null;
    body: string = "";
    mediaSrc: string = "";
    mediaIsImage: boolean = false;
    location: google.maps.LatLngLiteral | null = null;
    spot: Schema["spot"] | null = null;
    likeCount: number = 0;
    timePosted: Date | null = null;

    constructor(private _id: string, private _data: Post.Schema) {
      this.id = _id;
      this.updateData(_data);
    }

    like(): void {
      this.likeCount++;
    }
    unlike(): void {
      this.likeCount--;
    }

    getData(): Post.Schema {
      return this._data;
    }

    updateData(data: Post.Schema) {
      this._data = data;

      this.title = data.title;
      this.user = data.user;
      this.body = data.body;
      this.mediaSrc = data.media?.src || "";
      this.mediaIsImage = data.media?.type === MediaType.Image;

      if (data.location) {
        this.location = {
          lat: data.location.latitude,
          lng: data.location.longitude,
        };
      }

      if (this._data.spot) {
        this.spot = data.spot;
      }

      this.likeCount = data.like_count ?? 0;

      if (data.time_posted) {
        this.timePosted = new Date(data.time_posted.seconds * 1000);
      } else {
        console.error("time_posted is not defined on post " + this.id);
        console.log(data);
      }
    }
  }

  export interface Schema {
    title: string;
    user: UserReferenceSchema;
    body: string;
    media?: OtherMedia;
    location?: GeoPoint; // where the media was taken or the post was made
    spot?: {
      name: string;
      spot_location: GeoPoint;
      image_src: string;
      ref: DocumentReference;
    };

    like_count?: number;

    time_posted: Timestamp;
  }
}
